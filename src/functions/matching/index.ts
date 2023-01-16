import { SQSEvent } from 'aws-lambda';
import { eventsJson } from 'common/middleware';
import twilio from 'twilio';

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, MATCHING_GRID_ID } =
	process.env;

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

const conversation = async (event: SQSEvent): Promise<void> => {
	const sqsBody = JSON.parse(event.Records[0].body);

	await client.messages.create({
		body: `Message from matching function to ${sqsBody.From} | ${MATCHING_GRID_ID}`,
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
