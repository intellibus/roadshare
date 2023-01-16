import { APIGatewayEvent } from 'aws-lambda';
import { sendToSQS } from 'common/interop';
import { eventsJson } from 'common/middleware';
import util, { HTTPResponse } from 'common/util';
import qs from 'querystring';
// import twilio from 'twilio';

const { QUESTIONS_GRID_ID, COMPLETED_QUEUE_URL } = process.env;

// const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

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
