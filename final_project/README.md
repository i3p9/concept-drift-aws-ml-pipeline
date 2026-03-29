# Concept Drift-Aware Cloud ML Pipeline for Smart Inventory Management

We built this for CS6905 (Cloud Information Management Systems) at UNB. The idea is pretty straightforward: ML models go stale. A model trained on September sales data is going to be confused when December rolls around. So we built a serverless pipeline on AWS that detects this drift and retrains automatically.

## What it does

Retail demand shifts all the time -- seasons change, holidays happen, promotions come and go. We wanted to show that a model which keeps learning from new data will beat one that just sits there. And it does.

The pipeline works like this:

1. Sales data gets ingested into DynamoDB through an API
2. DynamoDB Streams triggers a Lambda that computes ML features automatically
3. A retraining Lambda fits a weighted ensemble -- RandomForest (0.4) + XGBoost (0.4) + LinearRegression (0.2) -- on all the accumulated data
4. That retrained model gets compared against a static baseline that never updates
5. Everything shows up on a React dashboard

Over four months of simulated seasonal data, the adaptive model beats the static baseline by about 14-19% on MAE. The gap gets more obvious as the seasons shift further from the original training period.

## Architecture

```
Frontend (Amplify) --> API Gateway --> Lambda Functions --> DynamoDB / S3
                                           |
                                      4 Lambdas:
                                      - ingest-sales
                                      - feature-engineering (DynamoDB Streams trigger)
                                      - retrain-model (EventBridge weekly schedule)
                                      - inference
                                      Lambda Layer (ML dependencies):
                                      - pandas, numpy, scikit-learn, xgboost, scipy, pytz, joblib
```

We went with DynamoDB in single-table design, S3 for versioned model storage, Lambda (Python 3.11) for all the compute, API Gateway (REST) with API keys, EventBridge for scheduling retrains, CloudWatch for monitoring, and Amplify to host the frontend. The whole thing runs on Free Tier which is nice.

## Repo Structure

```
├── models/
│   └── train_and_export.py         # Train initial models locally
├── data/
│   ├── generate_batches.py         # Generate seasonal batches from Kaggle CSV
│   ├── generate_scenarios.py       # Generate what-if scenario data
│   └── simulation_batches/         # Pre-generated JSON files
├── lambdas/
│   ├── ingest/handler.py           # Writes sales records to DynamoDB
│   ├── feature_engineering/handler.py  # Computes ML features from Streams
│   ├── retrain/handler.py          # Trains ensemble, compares to baseline
│   └── inference/handler.py        # Predictions, metrics, inventory, reset
├── frontend/
│   ├── src/
│   │   ├── App.jsx                 # Main layout and state
│   │   ├── api/client.js           # API Gateway client
│   │   ├── data/scenarios.js       # Scenario definitions
│   │   └── components/             # React components for the dashboard
│   ├── public/batches/             # Data files served to the browser
│   └── .env                        # API URL + key (not committed)
├── infrastructure/
├── retail_store_inventory.csv      # Source dataset (Kaggle)
└── DEPLOYMENT_COMMANDS.md
```

Note: the trained `.joblib` model files and the `lambda_layer/` directory (about 288MB of Python packages) are gitignored. You generate those locally.

## Prerequisites

- AWS account (Free Tier works fine)
- Python 3.11+
- Node.js 18+ and npm
- AWS CLI configured with your credentials

## Deployment

This turned out to be trickier than expected, especially the Lambda layer part. Here's the rough order of operations.

### 1. Database and Storage

```bash
# Create the DynamoDB table
aws dynamodb create-table \
  --table-name InventoryMLPipeline \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
    AttributeName=GSI1PK,AttributeType=S \
    AttributeName=GSI1SK,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes \
    '[{"IndexName":"GSI1","KeySchema":[{"AttributeName":"GSI1PK","KeyType":"HASH"},{"AttributeName":"GSI1SK","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --billing-mode PAY_PER_REQUEST \
  --stream-specification StreamEnabled=true,StreamViewType=NEW_AND_OLD_IMAGES

# Create an S3 bucket -- replace ACCOUNT_ID with yours
aws s3 mb s3://inventory-ml-models-ACCOUNT_ID
aws s3api put-bucket-versioning --bucket inventory-ml-models-ACCOUNT_ID \
  --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket inventory-ml-models-ACCOUNT_ID \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

### 2. Train and Upload Models

```bash
cd models
python train_and_export.py

# Push them to S3
aws s3 cp static_model.joblib s3://inventory-ml-models-ACCOUNT_ID/static/
aws s3 cp adaptive_model_v1.joblib s3://inventory-ml-models-ACCOUNT_ID/models/v1/ensemble_model.joblib
```

### 3. Lambda Layer

This was a headache. You need to install the ML packages into the right directory structure so Lambda can find them.

```bash
cd infrastructure/lambda_layer
pip install pandas numpy scikit-learn xgboost scipy pytz joblib -t python/lib/python3.11/site-packages/
zip -r ml-dependencies.zip python/
# Then upload as a Lambda Layer via the Console or CLI
```

Fair warning: be very careful about what you strip out of numpy and scipy. We lost a few hours to that.

### 4. Deploy Lambda Functions

Each handler in `lambdas/` goes up as its own Lambda function. Set these environment variables on each:
- `TABLE_NAME=InventoryMLPipeline`
- `MODEL_BUCKET=inventory-ml-models-ACCOUNT_ID`

Attach the `ml-dependencies` layer to `retrain-model` and `inference`. The other two Lambdas don't need it. Category encoding is hardcoded in the Lambda code so there's no separate encoder file to worry about.

Then wire up the triggers:
- `feature-engineering` gets triggered by DynamoDB Streams on `InventoryMLPipeline`
- `retrain-model` gets triggered by an EventBridge rule on `rate(7 days)`

### 5. API Gateway

Set up a REST API with these routes:

| Method | Path | Lambda |
|--------|------|--------|
| POST | /ingest | ingest-sales |
| POST | /retrain | retrain-model |
| POST | /reset | inference |
| GET | /predictions/{store_id} | inference |
| GET | /predictions/{store_id}/history | inference |
| GET | /metrics | inference |
| GET | /metrics/latest | inference |
| GET | /stores/{store_id}/inventory | inference |

Enable API key requirement on all routes and deploy to a `prod` stage.

### 6. Frontend

```bash
cd frontend
cp .env.example .env
# Fill in your API Gateway URL and API key in .env
npm install
npm run build
```

Deploy the `dist/` folder to Amplify. You can either zip-upload it manually or connect a git repo.

## Running the Demo

1. Open the dashboard
2. Click "Normal Fall Sales" to inject about 3,000 September records
3. Hit "Retrain Model" -- first data point shows up on the MAE chart
4. Repeat with October, November, December
5. Watch the gap grow between the static line (red) and adaptive line (green)
6. Click "Get Prediction" to run a store-level demand forecast. The endpoint compares both models against actual Kaggle data and picks winners. There are actually two winner metrics: one based on MAE and one based on which model's average prediction is closer to the actual units sold. The MAE-based winner is usually the adaptive model, but the unit-based winner can sometimes favor the static model for certain product categories, which honestly makes the results feel more realistic.
7. Try the what-if scenarios (Snowstorm, Flash Sale, Supply Crisis) to see how predictions shift
8. Click "Reset" to wipe everything and start fresh

## Testing

If you want to poke at the API directly, grab your URL and key from `frontend/.env` and try these:

```bash
# Set these from your .env file
export API=https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/prod
export KEY=YOUR_API_KEY

# Ingest a small batch
curl -X POST "$API/ingest" \
  -H "x-api-key: $KEY" \
  -H "Content-Type: application/json" \
  -d @data/simulation_batches/sample_test.json

# Trigger a retrain
curl -X POST "$API/retrain" -H "x-api-key: $KEY"

# Check the metrics
curl "$API/metrics" -H "x-api-key: $KEY"

# Get a prediction for store S001
curl "$API/predictions/S001" -H "x-api-key: $KEY"

# This should return 403 -- no API key means no access
curl "$API/metrics"
```

If the 403 test passes you know the API key gate is working. If retrain comes back with metrics, the whole pipeline is wired up correctly.

## Team

- **Ali Rizvi** (3802911)
- **Fahim Faisal** (3809190)
- **Refat Ishrak Hemel** (3810002)

CS6905 -- Cloud Information Management Systems, University of New Brunswick, Winter 2026
