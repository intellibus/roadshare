import { MatchesGridModel } from '@/grids/Matches.grid';
import { QuestionsGridModel } from '@/grids/Questions.grid';
import { LatLong, MessagingWebhookBody } from '@/types/index';
import { SQSEvent } from 'aws-lambda';
import { insert, QueryObject, search, updateByRowId } from 'bigparser';
import { eventsJson } from 'common/middleware';
import qs from 'querystring';
import twilio from 'twilio';
import { v4 as uuid } from 'uuid';
import { x } from 'xrays';
import fetch from 'node-fetch';

const { TWILIO_SID, TWILIO_AUTH, TWILIO_PHONE_NUMBER, MATCHES_GRID_ID, GEOCODING_API_KEY } =
	process.env;

const client = twilio(TWILIO_SID, TWILIO_AUTH);

const THANK_YOU_MESSAGE =
	'Thank you for sharing your information. We will notify you as soon as we find a match!';

const getGeoData = async (location: string) => {
	const data = {
		address: location,
		key: GEOCODING_API_KEY
	};
	const response = await fetch(
		`https://maps.googleapis.com/maps/api/geocode/json?${qs.stringify(data)}`
	);
	const jsonResponse = await response.json();
	return jsonResponse as any;
};

const getLatLong = async (location: string) => {
	const geoData = await getGeoData(location);
	return geoData?.results[0]?.geometry?.location;
};

function toFixed(num: number, fixed: number) {
	var re = new RegExp('^-?\\d+(?:.\\d{0,' + (fixed || -1) + '})?');
	return num.toString()!.match(re)![0];
}

const searchGridForMatches = async (pickupPosition: LatLong, dropoffPosition: LatLong) => {
	const queryObj: QueryObject<MatchesGridModel> = {
		query: {
			columnFilter: {
				filters: [
					{ column: 'Pickup Latitude', operator: 'LIKE', keyword: toFixed(pickupPosition.lat, 4) },
					{ column: 'Pickup Latitude', operator: 'LIKE', keyword: toFixed(pickupPosition.lat, 4) },
					{
						column: 'Pickup Longitude',
						operator: 'LIKE',
						keyword: toFixed(pickupPosition.lng, 4)
					},
					{
						column: 'Pickup Longitude',
						operator: 'LIKE',
						keyword: toFixed(pickupPosition.lng, 4)
					},
					{
						column: 'Dropoff Latitude',
						operator: 'LIKE',
						keyword: toFixed(dropoffPosition.lat, 4)
					},
					{
						column: 'Dropoff Latitude',
						operator: 'LIKE',
						keyword: toFixed(dropoffPosition.lat, 4)
					},
					{
						column: 'Dropoff Longitude',
						operator: 'LIKE',
						keyword: toFixed(dropoffPosition.lng, 4)
					},
					{
						column: 'Dropoff Longitude',
						operator: 'LIKE',
						keyword: toFixed(dropoffPosition.lng, 4)
					},
					{ column: 'Match Id', operator: 'BLANK', keyword: '' }
				],
				filtersJoinOperator: 'AND'
			},
			sendRowIdsInResponse: true,
			showColumnNamesInResponse: true
		}
	};
	const response = await search<MatchesGridModel>(queryObj, MATCHES_GRID_ID!);
	return response;
};

const updateMatchesWithId = async (rideshareMatches: any, matchId: string) => {
	return await updateByRowId(
		{
			update: {
				rows: rideshareMatches.map((match: { _id: string }) => {
					return { rowId: match._id, columns: { 'Match Id': matchId } };
				})
			}
		},
		MATCHES_GRID_ID!
	);
};

const sendMessage = async (to: string, body: string) => {
	return await client.messages.create({
		from: `${TWILIO_PHONE_NUMBER}`,
		to,
		body
	});
};

const sendMessagesToAllMatches = async (
	twilioData: MessagingWebhookBody,
	existingSession: QuestionsGridModel,
	rideshareMatches: any
) => {
	const pickup = rideshareMatches[0]['Pickup'];
	// const dropoff = rideshareMatches[0]['Dropoff'];

	const messagePromises = rideshareMatches.map(async (match: MatchesGridModel) => {
		return await sendMessage(
			match['Phone #'],
			`Hi ${match['Name']}! We found a match for you! Meet ${rideshareMatches
				.filter(
					(others: MatchesGridModel) =>
						!(others['Phone #'] === match['Phone #'] && others['Name'] === match['Name'])
				)
				.push({ Name: existingSession['Name'] })
				.map((others: MatchesGridModel) => others['Name'].trim())
				.join(', ')} @ ${pickup}`
		);
	});

	const matcherMessage = await sendMessage(
		twilioData.From,
		`Hi ${existingSession['Name']}! We found a match for you! Meet ${rideshareMatches
			.map((others: MatchesGridModel) => others['Name'])
			.join(', ')} @ ${pickup}`
	);

	await Promise.all([messagePromises, matcherMessage]);
};

const addNewRowForMatch = async (
	twilioData: MessagingWebhookBody,
	existingSession: QuestionsGridModel,
	pickupPosition: LatLong,
	dropoffPosition: LatLong,
	matchId: string | undefined
) => {
	return await insert<MatchesGridModel>(
		{
			insert: {
				rows: [
					{
						'Phone #': twilioData.From,
						Name: existingSession['Name'],
						Pickup: existingSession['Pickup'],
						'Pickup Latitude': pickupPosition.lat.toString(),
						'Pickup Longitude': pickupPosition.lng.toString(),
						Dropoff: existingSession['Dropoff'],
						'Dropoff Latitude': dropoffPosition.lat.toString(),
						'Dropoff Longitude': dropoffPosition.lng.toString(),
						'Expiry Time': '' + new Date(new Date().getTime() + 60 * 1000 * 10).toISOString(),
						'Match Id': matchId
					}
				]
			}
		},
		MATCHES_GRID_ID!
	);
};

const conversation = async (event: SQSEvent): Promise<void> => {
	const sqsBody: { existingSession: QuestionsGridModel; twilioData: MessagingWebhookBody } =
		JSON.parse(event.Records[0].body);

	const { twilioData, existingSession } = sqsBody;

	const [
		{ data: pickupPosition, error: pickupError },
		{ data: dropoffPosition, error: dropoffError }
	] = await Promise.all([
		x(getLatLong, existingSession.Pickup),
		x(getLatLong, existingSession.Dropoff)
	]);

	if (pickupError || dropoffError || !pickupPosition || !dropoffPosition) {
		return;
	}

	const { data: rideshareMatches, error: rideshareMatchError } = await searchGridForMatches(
		pickupPosition,
		dropoffPosition
	);

	if (rideshareMatchError || !rideshareMatches) {
		return;
	}

	await sendMessage(twilioData.From, THANK_YOU_MESSAGE);

	console.log(rideshareMatches);

	let matchId;
	if (rideshareMatches.totalRowCount > 0) {
		matchId = uuid();
		console.log(matchId);
		const { data: updateResponse, error: updateError } = await updateMatchesWithId(
			rideshareMatches.rows,
			matchId
		);
		if (updateError || !updateResponse) {
			return;
		}
		await sendMessagesToAllMatches(twilioData, existingSession, rideshareMatches.rows);
	}

	await addNewRowForMatch(twilioData, existingSession, pickupPosition, dropoffPosition, matchId);

	return;
};

export async function main(input: SQSEvent) {
	const runnable = await eventsJson(conversation);
	const response = await runnable(input);
	return response;
}
