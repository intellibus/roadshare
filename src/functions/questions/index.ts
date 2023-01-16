import { APIGatewayEvent } from 'aws-lambda';
import { sendToSQS } from 'common/interop';
import { eventsJson } from 'common/middleware';
import util, { HTTPResponse } from 'common/util';
import qs from 'querystring';
import twilio from 'twilio';

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

const conversation = async (event: APIGatewayEventWithCookies): Promise<HTTPResponse> => {
	if (!event.body) {
		return util._500('Missing Form Encoded Body');
	}

	let twilioData: object;
	if (event.isBase64Encoded) {
		twilioData = qs.parse(Buffer.from(event.body, 'base64').toString('utf-8'));
	} else {
		twilioData = qs.parse(event.body);
	}

	// 1 Validate HMAC

	if (
		!event.headers['X-Twilio-Signature'] ||
		!twilio.validateRequest(
			TWILIO_AUTH!,
			event.headers['X-Twilio-Signature']!,
			`https://${event.headers.Host!}${event.path}`,
			twilioData
		)
	) {
		return util._403('Unauthorized Request');
	}

	// 2. Get Column Metadata — Parallel
	// 3. Get Rows for Phone # — Parallel
	// 4. Calculate Next Question to Ask
	// 5. If New Session, Insert Row for New Session
	// 5. Else If Session Ended — Alert Queue & Update Grid
	// 6. Reply with Next Question or New Session Start :)

	await sendToSQS(COMPLETED_QUEUE_URL ?? '', JSON.stringify(twilioData));

	return util._200(
		`Hi, Thanks for the message: ${
			(twilioData as MessagingWebhookBody).Body
		} | ${QUESTIONS_GRID_ID}`
	);
};

export async function main(input: APIGatewayEventWithCookies) {
	const runnable = await eventsJson(conversation);
	const response = await runnable(input);
	return response;
}
