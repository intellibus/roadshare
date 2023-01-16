// import { MatchesGridModel } from '@/grids/Matches.grid';
import { QuestionsGridModel } from '@/grids/Questions.grid';
import { MessagingWebhookBody } from '@/types/index';
import { SQSEvent } from 'aws-lambda';
import { eventsJson } from 'common/middleware';
import twilio from 'twilio';

const { TWILIO_SID, TWILIO_AUTH, TWILIO_PHONE_NUMBER } = process.env;

const client = twilio(TWILIO_SID, TWILIO_AUTH);

const THANK_YOU_MESSAGE =
	'Thank you for sharing your information. We will notify you as soon as we find a match!';

const sendMessage = async (to: string, body: string) => {
	return await client.messages.create({
		from: `${TWILIO_PHONE_NUMBER}`,
		to,
		body
	});
};

const conversation = async (event: SQSEvent): Promise<void> => {
	const sqsBody: { existingSession: QuestionsGridModel; twilioData: MessagingWebhookBody } =
		JSON.parse(event.Records[0].body);

	const { twilioData } = sqsBody;

	await sendMessage(twilioData.From, THANK_YOU_MESSAGE);
	return;
};

export async function main(input: SQSEvent) {
	const runnable = await eventsJson(conversation);
	const response = await runnable(input);
	return response;
}
