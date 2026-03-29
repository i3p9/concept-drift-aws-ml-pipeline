"""
Reset Demo — Clears all ingested data from DynamoDB and resets model to v1.
Run this before each demo rehearsal or the actual demo.

Usage:
  cd final_project
  source venv/bin/activate
  python reset_demo.py
"""

import boto3
import time

TABLE_NAME = 'InventoryMLPipeline'
BUCKET = 'inventory-ml-models-811936641380'
INITIAL_MODEL_S3_PATH = f's3://{BUCKET}/models/v1/ensemble_model.joblib'

dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
s3 = boto3.client('s3', region_name='us-east-1')
table = dynamodb.Table(TABLE_NAME)


def delete_items_by_prefix(sk_prefix, record_type_label):
    """Scan and delete all items whose SK starts with a given prefix."""
    deleted = 0
    scan_kwargs = {
        'ProjectionExpression': 'PK, SK',
        'FilterExpression': 'begins_with(SK, :prefix)',
        'ExpressionAttributeValues': {':prefix': sk_prefix}
    }

    while True:
        response = table.scan(**scan_kwargs)
        items = response.get('Items', [])

        with table.batch_writer() as batch:
            for item in items:
                batch.delete_item(Key={'PK': item['PK'], 'SK': item['SK']})
                deleted += 1

        if 'LastEvaluatedKey' not in response:
            break
        scan_kwargs['ExclusiveStartKey'] = response['LastEvaluatedKey']

    print(f"  Deleted {deleted} {record_type_label} records")
    return deleted


def delete_items_by_record_type(record_type):
    """Scan and delete all items with a specific RecordType."""
    deleted = 0
    scan_kwargs = {
        'ProjectionExpression': 'PK, SK',
        'FilterExpression': 'RecordType = :rt',
        'ExpressionAttributeValues': {':rt': record_type}
    }

    while True:
        response = table.scan(**scan_kwargs)
        items = response.get('Items', [])

        with table.batch_writer() as batch:
            for item in items:
                batch.delete_item(Key={'PK': item['PK'], 'SK': item['SK']})
                deleted += 1

        if 'LastEvaluatedKey' not in response:
            break
        scan_kwargs['ExclusiveStartKey'] = response['LastEvaluatedKey']

    print(f"  Deleted {deleted} {record_type} records")
    return deleted


def delete_model_meta_records():
    """Delete all MODEL# records except the initial v1 and reset LATEST pointer."""
    deleted = 0
    scan_kwargs = {
        'ProjectionExpression': 'PK, SK',
        'FilterExpression': 'begins_with(PK, :prefix)',
        'ExpressionAttributeValues': {':prefix': 'MODEL#'}
    }

    while True:
        response = table.scan(**scan_kwargs)
        items = response.get('Items', [])

        with table.batch_writer() as batch:
            for item in items:
                pk = item['PK']
                # Delete everything except MODEL#v1
                if pk not in ('MODEL#v1',):
                    batch.delete_item(Key={'PK': pk, 'SK': item['SK']})
                    deleted += 1

        if 'LastEvaluatedKey' not in response:
            break
        scan_kwargs['ExclusiveStartKey'] = response['LastEvaluatedKey']

    print(f"  Deleted {deleted} MODEL meta records (kept v1)")
    return deleted


def reset_latest_pointer():
    """Reset MODEL#LATEST to point to v1."""
    table.put_item(Item={
        'PK': 'MODEL#LATEST',
        'SK': 'META',
        'Version': 'v1',
        'S3_Path': INITIAL_MODEL_S3_PATH,
        'RecordType': 'MODEL_POINTER'
    })
    print("  Reset MODEL#LATEST → v1")


def cleanup_s3_models():
    """Delete retrained model versions from S3, keep static/ models/v1/ and encoders/."""
    keep_prefixes = ('static/', 'models/v1/', 'encoders/', 'layers/')
    deleted = 0

    paginator = s3.get_paginator('list_objects_v2')
    for page in paginator.paginate(Bucket=BUCKET, Prefix='models/'):
        for obj in page.get('Contents', []):
            key = obj['Key']
            if not any(key.startswith(p) for p in keep_prefixes):
                s3.delete_object(Bucket=BUCKET, Key=key)
                deleted += 1

    print(f"  Deleted {deleted} retrained model files from S3 (kept v1 + static)")


def main():
    print("=" * 50)
    print("  DEMO RESET")
    print("=" * 50)
    print()
    print(f"Table: {TABLE_NAME}")
    print(f"Bucket: {BUCKET}")
    print()

    confirm = input("This will DELETE all demo data. Type 'yes' to confirm: ")
    if confirm.strip().lower() != 'yes':
        print("Aborted.")
        return

    print()
    print("[1/6] Deleting SALE records...")
    delete_items_by_prefix('SALE#', 'SALE')

    print("[2/6] Deleting FEATURE records...")
    delete_items_by_prefix('FEATURE#', 'FEATURE')

    print("[3/6] Deleting PRED records...")
    delete_items_by_prefix('PRED#', 'PRED')

    print("[4/6] Deleting METRIC records...")
    delete_items_by_record_type('METRIC')

    print("[5/6] Cleaning up MODEL records and resetting pointer...")
    delete_model_meta_records()
    reset_latest_pointer()

    print("[6/6] Cleaning up retrained models from S3...")
    cleanup_s3_models()

    print()
    print("=" * 50)
    print("  RESET COMPLETE")
    print("  Ready for a fresh demo!")
    print("=" * 50)


if __name__ == '__main__':
    main()
