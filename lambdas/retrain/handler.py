"""
Retrain Lambda — Weekly model retraining on cumulative sales data.
Trigger: EventBridge schedule (weekly) or manual invocation.

Trains RF + XGBoost + LR ensemble on all SALE records from DynamoDB,
compares against static baseline from S3, saves new model to S3,
writes MODEL META + METRIC records, pushes CloudWatch metrics.

Supports usePrevData flag: if true, merges historical baseline CSV
from S3 with the new DynamoDB records for a full training set.
"""

import json
import boto3
import os
import joblib
import numpy as np
import pandas as pd
from datetime import datetime
from decimal import Decimal
from sklearn.ensemble import RandomForestRegressor, VotingRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error
from sklearn.preprocessing import LabelEncoder
from xgboost import XGBRegressor

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
cloudwatch = boto3.client('cloudwatch')

TABLE_NAME = os.environ.get('TABLE_NAME', 'InventoryMLPipeline')
BUCKET = os.environ.get('MODEL_BUCKET', 'inventory-ml-models-811936641380')
table = dynamodb.Table(TABLE_NAME)

FEATURES = ['Category', 'Region', 'Price', 'Discount', 'Weather Condition',
            'DayOfWeek', 'Month', 'Sales_Lag_1', 'Sales_Lag_7', 'Rolling_7']
TARGET = 'Units Sold'

# Encoding maps — must match training and feature engineering
CATEGORY_MAP = {'Clothing': 0, 'Electronics': 1, 'Furniture': 2, 'Groceries': 3, 'Toys': 4}
REGION_MAP = {'East': 0, 'North': 1, 'South': 2, 'West': 3}
WEATHER_MAP = {'Cloudy': 0, 'Rainy': 1, 'Snowy': 2, 'Sunny': 3}
SEASON_MAP = {'Autumn': 0, 'Spring': 1, 'Summer': 2, 'Winter': 3}


BASELINE_KEY = 'baseline/baseline_training_data.csv'


def scan_all_sales():
    """Scan all SALE records from DynamoDB (paginated)."""
    items = []
    scan_kwargs = {
        'FilterExpression': 'RecordType = :rt',
        'ExpressionAttributeValues': {':rt': 'SALE'}
    }
    while True:
        response = table.scan(**scan_kwargs)
        items.extend(response.get('Items', []))
        if 'LastEvaluatedKey' not in response:
            break
        scan_kwargs['ExclusiveStartKey'] = response['LastEvaluatedKey']
    return items


def load_baseline_csv():
    """Download and parse the baseline training CSV from S3.

    Returns a list of dicts in the same shape as DynamoDB items
    so they can be fed into items_to_dataframe().
    """
    local_path = '/tmp/baseline_training_data.csv'
    s3.download_file(BUCKET, BASELINE_KEY, local_path)
    df = pd.read_csv(local_path)
    items = []
    for _, row in df.iterrows():
        items.append({
            'Date': str(row['Date']),
            'Store_ID': str(row['Store_ID']),
            'Product_ID': str(row['Product_ID']),
            'Category': str(row['Category']),
            'Region': str(row['Region']),
            'Price': float(row['Price']),
            'Discount': float(row['Discount']),
            'Weather_Condition': str(row['Weather_Condition']),
            'Units_Sold': int(row['Units_Sold']),
            'Seasonality': str(row['Seasonality']),
            'Holiday_Promotion': int(row.get('Holiday_Promotion', 0)),
        })
    return items


def items_to_dataframe(items):
    """Convert DynamoDB items to a pandas DataFrame ready for training."""
    records = []
    for item in items:
        try:
            records.append({
                'Date': item.get('Date', '2023-01-01'),
                'Store ID': item.get('Store_ID', ''),
                'Product ID': item.get('Product_ID', ''),
                'Category': CATEGORY_MAP.get(item.get('Category', ''), 0),
                'Region': REGION_MAP.get(item.get('Region', ''), 0),
                'Price': float(item.get('Price', 0)),
                'Discount': float(item.get('Discount', 0)),
                'Weather Condition': WEATHER_MAP.get(item.get('Weather_Condition', ''), 0),
                'Units Sold': int(item.get('Units_Sold', 0)),
                'Seasonality': SEASON_MAP.get(item.get('Seasonality', ''), 0),
                'Holiday_Promotion': int(item.get('Holiday_Promotion', 0)),
            })
        except (ValueError, TypeError) as e:
            print(f"Skipping bad record: {e}")
            continue

    df = pd.DataFrame(records)
    df['Date'] = pd.to_datetime(df['Date'])
    df = df.sort_values(['Date', 'Store ID', 'Product ID'])

    # Temporal features
    df['DayOfWeek'] = df['Date'].dt.dayofweek
    df['Month'] = df['Date'].dt.month

    # Lag and rolling features
    df['Sales_Lag_1'] = df.groupby(['Store ID', 'Product ID'])['Units Sold'].shift(1)
    df['Sales_Lag_7'] = df.groupby(['Store ID', 'Product ID'])['Units Sold'].shift(7)
    df['Rolling_7'] = df.groupby(['Store ID', 'Product ID'])['Units Sold'].transform(
        lambda x: x.rolling(7).mean()
    )

    return df.dropna()


def build_ensemble():
    """Create the ensemble model — RF + XGBoost + LR (matching notebook)."""
    return VotingRegressor(
        estimators=[
            ('rf', RandomForestRegressor(n_estimators=100, n_jobs=-1, random_state=42)),
            ('xgb', XGBRegressor(n_jobs=-1, random_state=42)),
            ('lr', LinearRegression())
        ],
        weights=[0.4, 0.4, 0.2]
    )


def lambda_handler(event, context):
    print("Starting retraining...")

    # Check for usePrevData flag from API Gateway body or direct invocation
    use_prev_data = False
    if isinstance(event.get('body'), str):
        try:
            body = json.loads(event['body'])
            use_prev_data = body.get('usePrevData', False)
        except (json.JSONDecodeError, TypeError):
            pass
    elif isinstance(event, dict):
        use_prev_data = event.get('usePrevData', False)

    # 1. Scan all sales data from DynamoDB
    print("Scanning sales data from DynamoDB...")
    items = scan_all_sales()
    print(f"  Found {len(items)} SALE records from DynamoDB")

    # 1b. Optionally merge with historical baseline data from S3
    if use_prev_data:
        print("Loading baseline training data from S3...")
        try:
            baseline_items = load_baseline_csv()
            print(f"  Loaded {len(baseline_items)} baseline records")
            items = baseline_items + items
            print(f"  Combined training set: {len(items)} records")
        except Exception as e:
            print(f"  Warning: could not load baseline CSV: {e}")
            print("  Continuing with DynamoDB data only")

    if len(items) < 50:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': f'Not enough data to train: {len(items)} records'})
        }

    # 2. Convert to DataFrame
    print("Preparing training data...")
    df = items_to_dataframe(items)
    print(f"  Training rows after feature engineering: {len(df)}")

    # 3. Train adaptive ensemble
    print("Training adaptive model...")
    adaptive_model = build_ensemble()
    adaptive_model.fit(df[FEATURES], df[TARGET])

    # 4. Evaluate on last 20% as holdout
    split_idx = int(len(df) * 0.8)
    holdout = df.iloc[split_idx:]
    adaptive_preds = adaptive_model.predict(holdout[FEATURES])
    adaptive_mae = mean_absolute_error(holdout[TARGET], adaptive_preds)
    print(f"  Adaptive MAE (holdout): {adaptive_mae:.2f}")

    # 5. Load static model from S3 and evaluate
    print("Loading static model from S3...")
    s3.download_file(BUCKET, 'static/static_model.joblib', '/tmp/static_model.joblib')
    static_model = joblib.load('/tmp/static_model.joblib')
    static_preds = static_model.predict(holdout[FEATURES])
    static_mae = mean_absolute_error(holdout[TARGET], static_preds)
    print(f"  Static MAE (holdout): {static_mae:.2f}")

    improvement = static_mae - adaptive_mae
    improvement_pct = (improvement / static_mae * 100) if static_mae > 0 else 0
    print(f"  Improvement: {improvement:.2f} ({improvement_pct:.1f}%)")

    # 6. Save new model to S3
    version = f"v{int(datetime.now().timestamp())}"
    model_path = f'/tmp/{version}.joblib'
    joblib.dump(adaptive_model, model_path, compress=3)
    s3_key = f'models/{version}/ensemble_model.joblib'
    s3.upload_file(model_path, BUCKET, s3_key)
    print(f"  Saved model to s3://{BUCKET}/{s3_key}")

    # 7. Derive a meaningful week label from the data (latest date in training set)
    latest_date = df['Date'].max()
    data_week = latest_date.strftime('%Y-W%U')
    # Also count existing metrics to create a "Retrain #N" label
    existing_metrics = table.scan(
        FilterExpression='RecordType = :rt',
        ExpressionAttributeValues={':rt': 'METRIC'},
        Select='COUNT'
    ).get('Count', 0)
    retrain_num = existing_metrics + 1
    week_label = f"Retrain #{retrain_num} ({data_week})"

    # 8. Write MODEL META record
    table.put_item(Item={
        'PK': f'MODEL#{version}',
        'SK': 'META',
        'Version': version,
        'MAE': Decimal(str(round(adaptive_mae, 2))),
        'Static_MAE': Decimal(str(round(static_mae, 2))),
        'Training_Rows': len(df),
        'Total_Records': len(items),
        'Feature_List': FEATURES,
        'S3_Path': f's3://{BUCKET}/{s3_key}',
        'RecordType': 'MODEL_META',
        'Created_At': datetime.utcnow().isoformat() + 'Z'
    })

    # 9. Write METRIC record (keyed by version so each retrain creates a unique record)
    table.put_item(Item={
        'PK': f'METRIC#{version}',
        'SK': f'METRIC#{version}',
        'Version': version,
        'Week': week_label,
        'Static_MAE': Decimal(str(round(static_mae, 2))),
        'Adaptive_MAE': Decimal(str(round(adaptive_mae, 2))),
        'Improvement_Delta': Decimal(str(round(improvement, 2))),
        'Improvement_Pct': Decimal(str(round(improvement_pct, 2))),
        'Training_Rows': len(df),
        'Total_Records': len(items),
        'RecordType': 'METRIC',
        'Created_At': datetime.utcnow().isoformat() + 'Z'
    })

    # 10. Update LATEST pointer
    table.put_item(Item={
        'PK': 'MODEL#LATEST',
        'SK': 'META',
        'Version': version,
        'S3_Path': f's3://{BUCKET}/{s3_key}',
        'MAE': Decimal(str(round(adaptive_mae, 2))),
        'RecordType': 'LATEST_POINTER',
        'Updated_At': datetime.utcnow().isoformat() + 'Z'
    })

    # 11. Push CloudWatch metrics
    cloudwatch.put_metric_data(
        Namespace='InventoryML',
        MetricData=[
            {'MetricName': 'StaticMAE', 'Value': float(static_mae), 'Unit': 'None'},
            {'MetricName': 'AdaptiveMAE', 'Value': float(adaptive_mae), 'Unit': 'None'},
            {'MetricName': 'ImprovementDelta', 'Value': float(improvement), 'Unit': 'None'}
        ]
    )

    print(f"Retraining complete: {version}")

    result = {
        'version': version,
        'adaptive_mae': round(adaptive_mae, 2),
        'static_mae': round(static_mae, 2),
        'improvement': round(improvement, 2),
        'improvement_pct': round(improvement_pct, 1),
        'training_rows': len(df)
    }

    return {
        'statusCode': 200,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps(result)
    }
