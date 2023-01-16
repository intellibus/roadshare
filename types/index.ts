import { APIGatewayEvent } from 'aws-lambda';

export interface APIGatewayEventWithCookies extends APIGatewayEvent {
	cookies: string[];
}

export type MessagingWebhookBody = {
	MessageSid: string;
	Body: string;
	From: string;
	To: string;
};

export type ColumnMetadata = {
	columnName: string;
	columnDesc: string;
};

export type LatLong = {
	lat: number;
	lng: number;
};
