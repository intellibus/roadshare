# Roadshare Starter App
## An SMS Chat Experience Powered by Twilio and BigParser

This starter app will get you going with using the [BigParser](https://bigparser.com) [APIs](https://api.bigparser.com) and Twilio to create a basic ride-matching application.

### Key Technologies:
- Node
- pnpm
- TypeScript
- BigParser
- Twilio
- AWS
    - API Gateway
    - Lambda
    - Simple Storage Service (S3)
- Google Geocoding API
- Terraform

### Setup Steps:
#### 1. Create Accounts
- [BigParser](https://bigparser.com)
    - __Cost__: free
    - Use Google account or email
- [Twilio](https://www.twilio.com/try-twilio)
    - __Cost__: reserving a phone number costs $1.15 per month; cancel anytime to avoid recurring charges
- [AWS](https://aws.amazon.com/free/)
    - __Cost__: free for limited usage in the first 12 months
- [Google Maps APIs](https://developers.google.com/maps/documentation/geocoding)
    - Click "Get Started" in the upper right
    - __Cost__: free within limits; no credit card required

#### 2. Get Starter App Code
Three options:
- Git via HTTPS: `git clone https://github.com/intellibus/roadshare.git`
- Git via SSH: `git@github.com:intellibus/roadshare.git`
- Download:
  ![](https://raw.githubusercontent.com/wiki/intellibus/roadshare/img/github_download_highlight.jpg)

#### 3. Get a Twilio phone number

#### 3. Collect Secrets
- BigParser API token (required if using SSO) or `authID`
- AWS Access Key ID
- AWS Secret Access Key
- Twilio SID
- Twilio phone number
- Google Geocoding API key

#### 3. Create your first BigParser grids
Use the Roadshare grid template to create your new grids.
You should end up with two tabs: one called "Questions" and one called "Matches"
Note the grid IDs for each tab in the URL bar, as these will be needed later.

#### 4. Create AWS S3 Bucket for Terraform Data
- Create an S3 bucket to store Terraform's state data.
- The bucket name can be anything you wish, but must be unique across all buckets in the AWS region.
- If you use a region other than `US-EAST-1`, just make a note of its name as it will be needed later.
  ![](https://raw.githubusercontent.com/wiki/intellibus/roadshare/img/aws_s3_open_steps.jpg)
  ![](https://raw.githubusercontent.com/wiki/intellibus/roadshare/img/aws_s3_create_bucket.jpg)

#### 3. Configure .env file
- In repo directory, rename `.env example` file to `.env`.
- Update the following values:
  ```
  TERRAFORM_BACKEND_BUCKET=<your bucket name>
  ...
  BP_AUTH_TOKEN=<your BigParser API token>
  QUESTIONS_GRID_ID=<your grid ID from BigParser URL for "Questions" grid>
  MATCHES_GRID_ID=<your grid ID from BigParser URL for "Matches" grid>
  REGION=us-east-1 (update this if using a different region)
  AWS_ACCESS_KEY_ID=<your AWS access key ID>
  AWS_SECRET_ACCESS_KEY=<your AWS secret access key>
  TWILIO_SID=<the SID associated with your Twilio phone number>
  ...
  TWILIO_PHONE_NUMBER=<your Twilio phone number, formatted like +13219876543
  GEOCODING_API_KEY=<your Google geocoding API key>
  ```
