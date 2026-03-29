"""
Feature Engineering Lambda — Triggered by DynamoDB Streams.
Computes ML features (lag, rolling avg, encoded categoricals) when new SALE records arrive.
Writes FEATURE# records back to DynamoDB.
"""

import json
import boto3
import os
from decimal import Decimal
from datetime import datetime
from collections import defaultdict
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
TABLE_NAME = os.environ.get('TABLE_NAME', 'InventoryMLPipeline')
table = dynamodb.Table(TABLE_NAME)

# Encoding maps — must match local training exactly
CATEGORY_MAP = {'Clothing': 0, 'Electronics': 1, 'Furniture': 2, 'Groceries': 3, 'Toys': 4}
REGION_MAP = {'East': 0, 'North': 1, 'South': 2, 'West': 3}
WEATHER_MAP = {'Cloudy': 0, 'Rainy': 1, 'Snowy': 2, 'Sunny': 3}
SEASON_MAP = {'Autumn': 0, 'Spring': 1, 'Summer': 2, 'Winter': 3}


def deserialize_dynamodb(image):
    """Convert DynamoDB stream image to plain dict."""
    deserializer = boto3.dynamodb.types.TypeDeserializer()
    return {k: deserializer.deserialize(v) for k, v in image.items()}


def get_week_key(date_str):
    """Convert a date string to year-week format (e.g., 2023-W40)."""
    dt = datetime.strptime(date_str, '%Y-%m-%d')
    iso = dt.isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


def query_recent_sales(store_id, num_weeks=3):
    """Query recent SALE records for a store to compute lag features."""
    response = table.query(
        KeyConditionExpression=Key('PK').eq(f'STORE#{store_id}') & Key('SK').begins_with('SALE#'),
        ScanIndexForward=False,  # newest first
        Limit=500  # enough for ~3 weeks of data
    )
    return response.get('Items', [])


def compute_features_for_store_week(store_id, week_key, sales_records):
    """
    Compute aggregated features for a store-week combination.
    Uses all available sales records to compute lag and rolling features.
    """
    if not sales_records:
        return None

    # Sort by date
    sales_records.sort(key=lambda x: x.get('Date', ''))

    # Compute aggregates from the sales records
    units_sold_list = [float(r.get('Units_Sold', 0)) for r in sales_records]
    prices = [float(r.get('Price', 0)) for r in sales_records]
    discounts = [float(r.get('Discount', 0)) for r in sales_records]

    # Get the most common categorical values for encoding
    categories = [r.get('Category', 'Unknown') for r in sales_records]
    regions = [r.get('Region', 'Unknown') for r in sales_records]
    weathers = [r.get('Weather_Condition', 'Unknown') for r in sales_records]
    seasons = [r.get('Seasonality', 'Unknown') for r in sales_records]

    most_common = lambda lst: max(set(lst), key=lst.count) if lst else 'Unknown'

    # Lag features (using latest values)
    sales_lag_1 = units_sold_list[-1] if len(units_sold_list) >= 1 else 0
    sales_lag_7 = units_sold_list[-7] if len(units_sold_list) >= 7 else units_sold_list[0]

    # Rolling 7-day average
    last_7 = units_sold_list[-7:] if len(units_sold_list) >= 7 else units_sold_list
    rolling_7 = sum(last_7) / len(last_7) if last_7 else 0

    # Day of week average (from dates)
    day_of_weeks = []
    months = []
    for r in sales_records:
        try:
            dt = datetime.strptime(r.get('Date', '2023-01-01'), '%Y-%m-%d')
            day_of_weeks.append(dt.weekday())
            months.append(dt.month)
        except ValueError:
            pass

    avg_day_of_week = sum(day_of_weeks) / len(day_of_weeks) if day_of_weeks else 3
    avg_month = sum(months) / len(months) if months else 6

    feature_item = {
        'PK': f'STORE#{store_id}',
        'SK': f'FEATURE#{week_key}',
        'RecordType': 'FEATURE',
        'Store_ID': store_id,
        'Week': week_key,
        'Category_Encoded': CATEGORY_MAP.get(most_common(categories), 0),
        'Region_Encoded': REGION_MAP.get(most_common(regions), 0),
        'Weather_Encoded': WEATHER_MAP.get(most_common(weathers), 0),
        'Seasonality_Encoded': SEASON_MAP.get(most_common(seasons), 0),
        'DayOfWeek': Decimal(str(round(avg_day_of_week, 2))),
        'Month': int(round(avg_month)),
        'Sales_Lag_1': Decimal(str(round(sales_lag_1, 2))),
        'Sales_Lag_7': Decimal(str(round(sales_lag_7, 2))),
        'Rolling_7': Decimal(str(round(rolling_7, 2))),
        'Avg_Price': Decimal(str(round(sum(prices) / len(prices), 2))) if prices else Decimal('0'),
        'Avg_Discount': Decimal(str(round(sum(discounts) / len(discounts), 2))) if discounts else Decimal('0'),
        'Total_Units_Sold': int(sum(units_sold_list)),
        'Record_Count': len(sales_records),
        'Computed_At': datetime.utcnow().isoformat() + 'Z'
    }

    return feature_item


def lambda_handler(event, context):
    """Process DynamoDB Stream events and compute features."""
    # Extract new SALE records from the stream
    new_sales_by_store = defaultdict(list)

    for record in event.get('Records', []):
        if record['eventName'] not in ('INSERT', 'MODIFY'):
            continue

        new_image = record['dynamodb'].get('NewImage', {})
        item = deserialize_dynamodb(new_image)

        sk = item.get('SK', '')
        if not sk.startswith('SALE#'):
            continue

        store_id = item.get('Store_ID', '')
        if store_id:
            new_sales_by_store[store_id].append(item)

    if not new_sales_by_store:
        print("No new SALE records found in stream event")
        return {'processed': 0}

    features_written = 0

    for store_id, new_sales in new_sales_by_store.items():
        # Get the week key from the first new sale's date
        dates = [s.get('Date', '') for s in new_sales if s.get('Date')]
        if not dates:
            continue

        week_key = get_week_key(dates[0])

        # Query recent sales for this store (for lag/rolling computation)
        all_recent_sales = query_recent_sales(store_id)

        # Compute features using all available data
        feature_item = compute_features_for_store_week(store_id, week_key, all_recent_sales)

        if feature_item:
            table.put_item(Item=feature_item)
            features_written += 1
            print(f"Wrote FEATURE#{week_key} for STORE#{store_id}")

    print(f"Processed {len(new_sales_by_store)} stores, wrote {features_written} feature records")
    return {
        'processed': len(new_sales_by_store),
        'features_written': features_written
    }
