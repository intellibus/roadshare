import log from 'lambda-log';

log.options.debug = process.env.ENVIRONMENT === 'development';

export const runFunction = async (
	handler: (event: any) => Promise<any | void>,
	input: any
): Promise<any | void> => {
	log.info('Function Input', input);
	const response = await handler(input);
	return response;
};

export const eventsJson = async (handler: (event: any) => Promise<any | void>) => {
	const wrappedFunction = async (input: any) => {
		const response = await runFunction(handler, input);
		return response;
	};
	return wrappedFunction;
};
