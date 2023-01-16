import { SQSEvent } from 'aws-lambda';
import { eventsJson } from 'common/middleware';
import twilio from 'twilio';

const { TWILIO_SID, TWILIO_AUTH, TWILIO_PHONE_NUMBER, MATCHES_GRID_ID } = process.env;

const client = twilio(TWILIO_SID, TWILIO_AUTH);

const conversation = async (event: SQSEvent): Promise<void> => {
	const sqsBody = JSON.parse(event.Records[0].body);

	await client.messages.create({
		body: `Message from matching function to ${sqsBody.From} | ${MATCHES_GRID_ID}`,
		from: `${TWILIO_PHONE_NUMBER}`,
		to: sqsBody.From
	});

	return;
};

export async function main(input: SQSEvent) {
	const runnable = await eventsJson(conversation);
	const response = await runnable(input);
	return response;
}
