import { APIGatewayEvent } from 'aws-lambda';
import { getGridMetadata, insert, search, updateByQuery, updateByRowId } from 'bigparser';
import { sendToSQS } from 'common/interop';
import { eventsJson } from 'common/middleware';
import util, { HTTPResponse } from 'common/util';
import qs from 'querystring';
import twilio from 'twilio';
import { QuestionsGridModel } from '@/grids/Questions.grid';

const { TWILIO_AUTH, QUESTIONS_GRID_ID, COMPLETED_QUEUE_URL } = process.env;

// const client = twilio(TWILIO_SID, TWILIO_AUTH);

interface APIGatewayEventWithCookies extends APIGatewayEvent {
	cookies: string[];
}

type MessagingWebhookBody = {
	MessageSid: string;
	Body: string;
	From: string;
	To: string;
};

type ColumnMetadata = {
	columnName: string;
	columnDesc: string;
};

const CONVERSATION_RESET_PHRASES = ['reset', 'find me a ride'];

const ErrorResponse = util._200(
	'Yikes, I forgot what I wanted to ask you about. Please give me a few minutes to collect my thoughts and ask me again.'
);

const getBody = (event: APIGatewayEventWithCookies): MessagingWebhookBody => {
	if (event.isBase64Encoded) {
		return qs.parse(Buffer.from(event.body!, 'base64').toString('utf-8')) as MessagingWebhookBody;
	} else {
		return qs.parse(event.body!) as MessagingWebhookBody;
	}
};

const validateRequest = (event: APIGatewayEventWithCookies, twilioData: MessagingWebhookBody) => {
	return (
		event.headers['X-Twilio-Signature'] &&
		twilio.validateRequest(
			TWILIO_AUTH!,
			event.headers['X-Twilio-Signature']!,
			`https://${event.headers.Host!}${event.path}`,
			twilioData
		)
	);
};

const shouldReset = (twilioData: MessagingWebhookBody) => {
	return CONVERSATION_RESET_PHRASES.includes(twilioData.Body.trim().toLowerCase());
};

const startNewConversationInGrid = async (twilioData: MessagingWebhookBody) => {
	return await insert<QuestionsGridModel>(
		{ insert: { rows: [{ 'Phone #': twilioData.From, Complete: 'false' }] } },
		QUESTIONS_GRID_ID!
	);
};

const resetConversationInGrid = async (twilioData: MessagingWebhookBody) => {
	const { error: updateError } = await updateByQuery<QuestionsGridModel>(
		{
			update: {
				columns: {
					Complete: 'true'
				}
			},
			query: {
				columnFilter: {
					filters: [
						{
							column: 'Phone #',
							keyword: twilioData.From,
							operator: 'EQ'
						},
						{
							column: 'Complete',
							keyword: 'false',
							operator: 'EQ'
						}
					]
				}
			}
		},
		QUESTIONS_GRID_ID!
	);
	if (updateError) {
		return { data: null, error: updateError };
	}
	return await startNewConversationInGrid(twilioData);
};

const getQuestions = async () => {
	const { data: metadata, error: metadataRequestError } = await getGridMetadata(QUESTIONS_GRID_ID!);
	if (metadataRequestError) {
		return { data: null, error: metadataRequestError };
	}
	return {
		data: metadata.columns
			.filter(
				(column: ColumnMetadata) =>
					!column.columnDesc.toLowerCase().includes('skip') &&
					!['Phone #', 'Complete'].includes(column.columnName)
			)
			.map((column: ColumnMetadata) => column.columnName),
		error: null
	};
};

const replyWithFirstQuestion = (questions: Array<string>) => {
	if (!questions.length || questions.length < 1) {
		return util._404('No Questions Found');
	}

	return util._200(questions[0]);
};

const resetConversation = async (twilioData: MessagingWebhookBody) => {
	const [
		{ data: gridResetData, error: gridResetError },
		{ data: questions, error: questionsError }
	] = await Promise.all([resetConversationInGrid(twilioData), getQuestions()]);

	if (gridResetError || questionsError || !gridResetData || !questions) {
		return ErrorResponse;
	}

	return replyWithFirstQuestion(questions);
};

const getExistingSession = async (twilioData: MessagingWebhookBody) => {
	return await search<QuestionsGridModel>(
		{
			query: {
				columnFilter: {
					filters: [
						{
							column: 'Phone #',
							keyword: twilioData.From,
							operator: 'EQ'
						},
						{
							column: 'Complete',
							keyword: 'false',
							operator: 'EQ'
						}
					]
				},
				sendRowIdsInResponse: true,
				showColumnNamesInResponse: true
			}
		},
		QUESTIONS_GRID_ID!
	);
};

const updateExistingSession = async (
	existingSession: { _id: string },
	questionsRemaining: Array<string>,
	twilioData: MessagingWebhookBody
) => {
	return await updateByRowId(
		{
			update: {
				rows: [
					{
						rowId: existingSession._id,
						columns: {
							[questionsRemaining[0]]: twilioData.Body,
							Complete: `${questionsRemaining.length <= 1}`
						}
					}
				]
			}
		},
		QUESTIONS_GRID_ID!
	);
};

const conversation = async (event: APIGatewayEventWithCookies): Promise<HTTPResponse> => {
	if (!event.body) {
		return util._500('Missing Form Encoded Body');
	}

	let twilioData = getBody(event);

	// 1. Validate HMAC
	if (!validateRequest(event, twilioData)) {
		return util._403('Unauthorized Request');
	}

	if (shouldReset(twilioData)) {
		return resetConversation(twilioData);
	}

	// 2. Get Column Metadata — Parallel
	// 3. Get Rows for Phone # — Parallel
	const [
		{ data: questions, error: questionsError },
		{ data: existingSession, error: getSessionError }
	] = await Promise.all([getQuestions(), getExistingSession(twilioData)]);

	if (getSessionError || questionsError || !questions || !existingSession) {
		return ErrorResponse;
	}

	// 4. If New Session, Insert Row for New Session
	if (existingSession.totalRowCount === 0) {
		const { error: insertNewSessionError } = await startNewConversationInGrid(twilioData);
		if (insertNewSessionError) {
			return ErrorResponse;
		}
		return replyWithFirstQuestion(questions);
	}

	// 5. Calculate Next Question to Ask
	const questionsRemaining: Array<string> = questions.filter(
		(question: string) => !existingSession.rows[0][question]
	);

	if (questionsRemaining.length < 1) {
		return resetConversation(twilioData);
	}

	const { error: updateSessionError } = await updateExistingSession(
		existingSession.rows[0],
		questionsRemaining,
		twilioData
	);

	if (updateSessionError) {
		return ErrorResponse;
	}

	// 5. Else If Session Ended — Alert Queue & Update Grid
	if (questionsRemaining.length === 1) {
		await sendToSQS(COMPLETED_QUEUE_URL ?? '', JSON.stringify(twilioData));
	}

	questionsRemaining.shift();

	// 6. Reply with Next Question
	return replyWithFirstQuestion(questionsRemaining);
};

export async function main(input: APIGatewayEventWithCookies) {
	const runnable = await eventsJson(conversation);
	const response = await runnable(input);
	return response;
}
