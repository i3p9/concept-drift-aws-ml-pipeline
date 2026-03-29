"""
Ingest Lambda — Receives sales records and writes them to DynamoDB.
Trigger: API Gateway POST /ingest or direct invocation.
"""

import json
import boto3
import os
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
TABLE_NAME = os.environ.get('TABLE_NAME', 'InventoryMLPipeline')
table = dynamodb.Table(TABLE_NAME)


def decimal_default(obj):
    """Convert float to Decimal for DynamoDB compatibility."""
    if isinstance(obj, float):
        return Decimal(str(round(obj, 4)))
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def build_item(record):
    """Convert a raw sales record into a DynamoDB item with PK/SK prefixes."""
    store_id = record['Store_ID']
    date = record['Date']
    product_id = record['Product_ID']

    item = {
        'PK': f"STORE#{store_id}",
        'SK': f"SALE#{date}#{product_id}",
        'GSI1PK': f"REGION#{record['Region']}",
        'GSI1SK': f"SALE#{date}",
        'RecordType': 'SALE',
        'Date': date,
        'Store_ID': store_id,
        'Product_ID': product_id,
        'Category': record['Category'],
        'Region': record['Region'],
        'Inventory_Level': int(record['Inventory_Level']),
        'Units_Sold': int(record['Units_Sold']),
        'Units_Ordered': int(record.get('Units_Ordered', 0)),
        'Demand_Forecast': Decimal(str(round(float(record.get('Demand_Forecast', 0)), 2))),
        'Price': Decimal(str(round(float(record['Price']), 2))),
        'Discount': int(record['Discount']),
        'Weather_Condition': record['Weather_Condition'],
        'Holiday_Promotion': int(record.get('Holiday_Promotion', 0)),
        'Competitor_Pricing': Decimal(str(round(float(record.get('Competitor_Pricing', 0)), 2))),
        'Seasonality': record.get('Seasonality', 'Unknown')
    }
    return item


def lambda_handler(event, context):
    # Handle both API Gateway and direct invocation
    if isinstance(event.get('body'), str):
        body = json.loads(event['body'])
    else:
        body = event

    records = body.get('records', [])

    if not records:
        return {
            'statusCode': 400,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': 'No records provided'})
        }

    ingested = 0
    failed = 0

    with table.batch_writer() as batch:
        for record in records:
            try:
                item = build_item(record)
                batch.put_item(Item=item)
                ingested += 1
            except Exception as e:
                print(f"Failed to write record: {e}")
                failed += 1

    response_body = {
        'message': f'Ingested {ingested} records',
        'ingested': ingested,
        'failed': failed,
        'total': len(records)
    }

    return {
        'statusCode': 200,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        },
        'body': json.dumps(response_body)
    }
