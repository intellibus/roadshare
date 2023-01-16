import { Construct } from 'constructs';
import { App, S3Backend, TerraformOutput, TerraformStack } from 'cdktf';
import { AwsProvider } from '@cdktf/provider-aws/lib/provider';
import { DataAwsCallerIdentity } from '@cdktf/provider-aws/lib/data-aws-caller-identity';
import { LambdaPermission } from '@cdktf/provider-aws/lib/lambda-permission';
import { LambdaEventSourceMapping } from '@cdktf/provider-aws/lib/lambda-event-source-mapping';

import { Lambda } from '../.gen/modules/lambda';
import { ApigatewayV2 } from '../.gen/modules/apigateway-v2';
import { Sqs } from '../.gen/modules/sqs';

const {
	BP_AUTH_TOKEN,
	QUESTIONS_GRID_ID,
	MATCHES_GRID_ID,
	REGION,
	ENVIRONMENT,
	AWS_ACCESS_KEY_ID,
	AWS_SECRET_ACCESS_KEY,
	TERRAFORM_BACKEND_BUCKET,
	TWILIO_SID,
	TWILIO_AUTH,
	TWILIO_PHONE_NUMBER,
	GEOCODING_API_KEY
} = process.env;

const getFunctionConfig = (
	name: string,
	accountId: string,
	envVars?: object,
	policyStatements?: object
) => {
	return {
		functionName: `roadshare-${name}-function-${ENVIRONMENT}`,
		sourcePath: `../../../dist/${name}`,
		runtime: 'nodejs16.x',
		handler: 'index.main',
		environmentVariables: {
			BP_AUTH_TOKEN: BP_AUTH_TOKEN!,
			QUESTIONS_GRID_ID: QUESTIONS_GRID_ID!,
			MATCHES_GRID_ID: MATCHES_GRID_ID!,
			TWILIO_SID: TWILIO_SID!,
			TWILIO_AUTH: TWILIO_AUTH!,
			TWILIO_PHONE_NUMBER: TWILIO_PHONE_NUMBER!,
			GEOCODING_API_KEY: GEOCODING_API_KEY!,
			...envVars
		},
		memorySize: 2048,
		timeout: 20,
		attachPolicyStatements: true,
		policyStatements: {
			create_logs: {
				effect: 'Allow',
				actions: ['logs:CreateLogStream', 'logs:CreateLogGroup'],
				resources: [
					`arn:aws:logs:${REGION}:${accountId}:log-group:/aws/lambda/roadshare-${name}-function-${ENVIRONMENT}:*`
				]
			},
			insert_logs: {
				effect: 'Allow',
				actions: ['logs:PutLogEvents'],
				resources: [
					`arn:aws:logs:${REGION}:${accountId}:log-group:/aws/lambda/roadshare-${name}-function-${ENVIRONMENT}:*`
				]
			},
			...policyStatements
		},
		tags: {
			Project: 'roadshare',
			Environment: ENVIRONMENT ?? 'development',
			Name: name
		}
	};
};

class RoadshareDeployment extends TerraformStack {
	constructor(scope: Construct, id: string) {
		super(scope, id);

		new S3Backend(this, {
			region: REGION,
			bucket: TERRAFORM_BACKEND_BUCKET!,
			key: `microsites/${id}/chat.tfstate`,
			accessKey: AWS_ACCESS_KEY_ID,
			secretKey: AWS_SECRET_ACCESS_KEY
		});

		new AwsProvider(this, 'AWS', {
			region: 'us-east-1',
			accessKey: AWS_ACCESS_KEY_ID,
			secretKey: AWS_SECRET_ACCESS_KEY
		});

		const AWSCaller = new DataAwsCallerIdentity(this, 'caller', {});

		const completedQueue = new Sqs(this, `roadshare-completed-queue-${ENVIRONMENT}`, {
			name: `roadshare-completed-queue-${ENVIRONMENT}`,
			tags: {
				Environment: ENVIRONMENT ?? 'development'
			}
		});

		const questionsLambda = new Lambda(
			this,
			`roadshare-questions-function-${ENVIRONMENT}`,
			getFunctionConfig(
				'questions',
				AWSCaller.accountId,
				{
					COMPLETED_QUEUE_URL: completedQueue.queueUrlOutput
				},
				{
					completedSQS: {
						effect: 'Allow',
						actions: ['sqs:SendMessage'],
						resources: [completedQueue.queueArnOutput]
					}
				}
			)
		);

		const matchingFunction = new Lambda(
			this,
			`roadshare-matching-function-${ENVIRONMENT}`,
			getFunctionConfig(
				'matching',
				AWSCaller.accountId,
				{},
				{
					completedSQS: {
						effect: 'Allow',
						actions: ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'],
						resources: [completedQueue.queueArnOutput]
					}
				}
			)
		);

		const apiGateway = new ApigatewayV2(this, `roadshare-api-gateway-${ENVIRONMENT}`, {
			name: `roadshare-api-gateway-${ENVIRONMENT}`,
			description: 'HTTP API Gateway exposed to Twilio',
			protocolType: 'HTTP',
			createApiDomainName: false,
			corsConfiguration: {
				allowHeaders: [
					'content-type',
					'x-amz-date',
					'authorization',
					'x-api-key',
					'x-amz-security-token',
					'x-amz-user-agent'
				],
				allowMethods: ['*'],
				allowOrigins: ['*']
			},
			integrations: {
				'POST /': {
					lambda_arn: questionsLambda.lambdaFunctionArnOutput,
					payloadFormatVersion: '2.0',
					timeout_milliseconds: 20000
				}
			},
			tags: {
				Project: 'roadshare',
				Environment: ENVIRONMENT ?? 'development',
				Name: `api-gateway`
			}
		});

		new LambdaPermission(this, `roadshare-questions-permission-${ENVIRONMENT}`, {
			statementId: 'AllowQuestionsAPIInvoke',
			action: 'lambda:InvokeFunction',
			functionName: questionsLambda.lambdaFunctionNameOutput,
			principal: 'apigateway.amazonaws.com',
			sourceArn: `${apiGateway.apigatewayv2ApiExecutionArnOutput}/*/*/*`
		});

		new LambdaEventSourceMapping(this, `roadshare-complete-event-source-mapping-${ENVIRONMENT}`, {
			eventSourceArn: completedQueue.queueArnOutput,
			functionName: matchingFunction.lambdaFunctionArnOutput
		});

		new TerraformOutput(this, `roadshare-api-gateway-url-output-${ENVIRONMENT}`, {
			value: apiGateway.defaultApigatewayv2StageInvokeUrlOutput
		});
	}
}

const main = async () => {
	const app = new App();
	new RoadshareDeployment(app, `roadshare-${ENVIRONMENT!}`);
	app.synth();
};

main();
