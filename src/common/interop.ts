import { SQSClient, SendMessageCommand, SendMessageCommandOutput } from '@aws-sdk/client-sqs';

const sqsClient = new SQSClient({});

export const sendToSQS = async (
	queueUrl: string,
	messageBody: string
): Promise<SendMessageCommandOutput> => {
	const response = await sqsClient.send(
		new SendMessageCommand({
			QueueUrl: queueUrl,
			MessageBody: messageBody
		})
	);
	return response;
};
