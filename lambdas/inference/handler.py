"""
Inference Lambda — Generates demand predictions using the latest trained model.
Trigger: API Gateway GET /predictions/{store_id} or GET /predictions/{store_id}/history
         Also handles GET /metrics, GET /metrics/latest, GET /stores/{store_id}/inventory
"""

import json
import boto3
import os
import joblib
from datetime import datetime
from decimal import Decimal
from boto3.dynamodb.conditions import Key

s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")

TABLE_NAME = os.environ.get("TABLE_NAME", "InventoryMLPipeline")
BUCKET = os.environ.get("MODEL_BUCKET", "inventory-ml-models-811936641380")
table = dynamodb.Table(TABLE_NAME)

FEATURES_ORDER = [
    "Category",
    "Region",
    "Price",
    "Discount",
    "Weather Condition",
    "DayOfWeek",
    "Month",
    "Sales_Lag_1",
    "Sales_Lag_7",
    "Rolling_7",
]

# Category mappings — must match training
CATEGORIES = {
    0: "Clothing",
    1: "Electronics",
    2: "Furniture",
    3: "Groceries",
    4: "Toys",
}
CATEGORY_MAP = {
    "Clothing": 0,
    "Electronics": 1,
    "Furniture": 2,
    "Groceries": 3,
    "Toys": 4,
}
REGION_MAP = {"East": 0, "North": 1, "South": 2, "West": 3}
WEATHER_MAP = {"Cloudy": 0, "Rainy": 1, "Snowy": 2, "Sunny": 3}

# Cache models in Lambda container for warm starts
_cached_adaptive = None
_cached_adaptive_version = None
_cached_static = None


def json_response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,X-Api-Key",
            "Content-Type": "application/json",
        },
        "body": json.dumps(body, default=str),
    }


def load_static_model():
    """Load the static baseline model from S3 (cached)."""
    global _cached_static
    if _cached_static is not None:
        return _cached_static
    s3.download_file(BUCKET, "static/static_model.joblib", "/tmp/static_model.joblib")
    _cached_static = joblib.load("/tmp/static_model.joblib")
    return _cached_static


def load_adaptive_model():
    """Load the latest adaptive model from S3, with caching."""
    global _cached_adaptive, _cached_adaptive_version

    response = table.get_item(Key={"PK": "MODEL#LATEST", "SK": "META"})
    if "Item" not in response:
        return None, None

    latest = response["Item"]
    version = latest["Version"]

    if _cached_adaptive is not None and _cached_adaptive_version == version:
        return _cached_adaptive, version

    s3_path = latest["S3_Path"].replace(f"s3://{BUCKET}/", "")
    s3.download_file(BUCKET, s3_path, "/tmp/adaptive_model.joblib")
    _cached_adaptive = joblib.load("/tmp/adaptive_model.joblib")
    _cached_adaptive_version = version

    return _cached_adaptive, version


def extract_feature_vector(feature_item):
    """Extract ordered feature vector from a FEATURE# DynamoDB item."""
    return [
        float(feature_item.get("Category_Encoded", 0)),
        float(feature_item.get("Region_Encoded", 0)),
        float(feature_item.get("Avg_Price", 0)),
        float(feature_item.get("Avg_Discount", 0)),
        float(feature_item.get("Weather_Encoded", 0)),
        float(feature_item.get("DayOfWeek", 3)),
        float(feature_item.get("Month", 6)),
        float(feature_item.get("Sales_Lag_1", 0)),
        float(feature_item.get("Sales_Lag_7", 0)),
        float(feature_item.get("Rolling_7", 0)),
    ]


def query_all_sales(store_id):
    """Query ALL sale records for a store (paginated)."""
    items = []
    query_kwargs = {
        "KeyConditionExpression": Key("PK").eq(f"STORE#{store_id}")
        & Key("SK").begins_with("SALE#"),
        "ScanIndexForward": True,
    }
    while True:
        response = table.query(**query_kwargs)
        items.extend(response.get("Items", []))
        if "LastEvaluatedKey" not in response:
            break
        query_kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
    return items


def build_feature_vectors(sales_records):
    """Build per-record feature vectors from raw SALE records, matching training pipeline.

    Returns list of (feature_vector, units_sold, category_name) tuples.
    Records without enough history for lag features are skipped (matching dropna in training).
    """
    # Sort by date, store, product
    sales_records.sort(key=lambda r: (r.get("Date", ""), r.get("Product_ID", "")))

    # Group by product to compute lag/rolling per product
    from collections import defaultdict

    product_history = defaultdict(list)  # product_id -> [(units_sold, record), ...]

    results = []
    for record in sales_records:
        pid = record.get("Product_ID", "")
        cat_name = record.get("Category", "")
        cat_enc = CATEGORY_MAP.get(cat_name)
        region_enc = REGION_MAP.get(record.get("Region", ""), 0)
        weather_enc = WEATHER_MAP.get(record.get("Weather_Condition", ""), 0)
        price = float(record.get("Price", 0))
        discount = float(record.get("Discount", 0))
        units_sold = int(record.get("Units_Sold", 0))

        try:
            dt = datetime.strptime(record.get("Date", "2023-01-01"), "%Y-%m-%d")
        except ValueError:
            continue

        day_of_week = dt.weekday()
        month = dt.month

        history = product_history[pid]

        # Lag features — skip if not enough history (matches dropna in training)
        if len(history) < 7:
            history.append(units_sold)
            continue

        sales_lag_1 = float(history[-1])
        sales_lag_7 = float(history[-7])
        rolling_7 = sum(history[-7:]) / 7.0

        if cat_enc is None:
            history.append(units_sold)
            continue

        feature_vec = [
            float(cat_enc),
            float(region_enc),
            price,
            discount,
            float(weather_enc),
            float(day_of_week),
            float(month),
            sales_lag_1,
            sales_lag_7,
            rolling_7,
        ]
        results.append((feature_vec, units_sold, cat_name))
        history.append(units_sold)

    return results


def handle_predict(store_id):
    """Generate per-category predictions using per-record features from actual sales data."""
    adaptive_model, version = load_adaptive_model()
    if adaptive_model is None:
        return json_response(
            404, {"error": "No trained model found. Run retraining first."}
        )

    static_model = load_static_model()

    # Query all SALE records for this store
    sales = query_all_sales(store_id)
    if not sales:
        return json_response(
            404, {"error": f"No sales data for store {store_id}. Inject data first."}
        )

    # Build per-record feature vectors (matching training pipeline)
    records = build_feature_vectors(sales)
    if not records:
        return json_response(
            404,
            {
                "error": f"Not enough sales history for store {store_id}. Need at least 7 days per product."
            },
        )

    # Predict on each record using both models
    import numpy as np

    features_matrix = [r[0] for r in records]
    actuals = [r[1] for r in records]
    categories = [r[2] for r in records]

    static_preds = static_model.predict(features_matrix)
    adaptive_preds = adaptive_model.predict(features_matrix)

    # Aggregate per category
    from collections import defaultdict

    cat_data = defaultdict(lambda: {"actuals": [], "static": [], "adaptive": []})
    for i, cat_name in enumerate(categories):
        cat_data[cat_name]["actuals"].append(actuals[i])
        cat_data[cat_name]["static"].append(float(static_preds[i]))
        cat_data[cat_name]["adaptive"].append(float(adaptive_preds[i]))

    category_predictions = []
    static_total_err = 0
    adaptive_total_err = 0
    total_records = 0

    for cat_name in ["Clothing", "Electronics", "Furniture", "Groceries", "Toys"]:
        if cat_name not in cat_data:
            continue
        d = cat_data[cat_name]
        n = len(d["actuals"])
        actual_avg = sum(d["actuals"]) / n
        static_avg = sum(d["static"]) / n
        adaptive_avg = sum(d["adaptive"]) / n

        # Per-record MAE for this category
        s_mae = sum(abs(a - p) for a, p in zip(d["actuals"], d["static"])) / n
        a_mae = sum(abs(a - p) for a, p in zip(d["actuals"], d["adaptive"])) / n

        static_total_err += s_mae * n
        adaptive_total_err += a_mae * n
        total_records += n

        winner = "adaptive" if a_mae < s_mae else "static" if s_mae < a_mae else "tie"
        s_gap = abs(static_avg - actual_avg)
        a_gap = abs(adaptive_avg - actual_avg)
        winner_units = (
            "adaptive"
            if a_gap < s_gap
            else "static"
            if s_gap < a_gap
            else "tie"
        )

        category_predictions.append(
            {
                "category": cat_name,
                "actual_avg": round(actual_avg, 1),
                "static_units": round(static_avg, 1),
                "adaptive_units": round(adaptive_avg, 1),
                "static_mae": round(s_mae, 2),
                "adaptive_mae": round(a_mae, 2),
                "winner": winner,
                "winner_unit": winner_units,
                "record_count": n,
            }
        )

    overall_static_mae = (
        round(static_total_err / total_records, 2) if total_records else 0
    )
    overall_adaptive_mae = (
        round(adaptive_total_err / total_records, 2) if total_records else 0
    )

    # Derive week key from latest sale date
    latest_date = max(s.get("Date", "") for s in sales)
    try:
        dt = datetime.strptime(latest_date, "%Y-%m-%d")
        week_key = f"{dt.isocalendar()[0]}-W{dt.isocalendar()[1]:02d}"
    except ValueError:
        week_key = datetime.utcnow().strftime("%Y-W%U")

    # Write summary to DynamoDB
    table.put_item(
        Item={
            "PK": f"STORE#{store_id}",
            "SK": f"PRED#{week_key}",
            "Store_ID": store_id,
            "Week": week_key,
            "Predictions": json.dumps(category_predictions),
            "Model_Version": version,
            "RecordType": "PRED",
            "Created_At": datetime.utcnow().isoformat() + "Z",
        }
    )

    return json_response(
        200,
        {
            "store_id": store_id,
            "model_version": version,
            "week": week_key,
            "total_records": total_records,
            "overall_static_mae": overall_static_mae,
            "overall_adaptive_mae": overall_adaptive_mae,
            "predictions": category_predictions,
        },
    )


def handle_prediction_history(store_id):
    """Get all predictions over time for a store."""
    response = table.query(
        KeyConditionExpression=Key("PK").eq(f"STORE#{store_id}")
        & Key("SK").begins_with("PRED#"),
        ScanIndexForward=True,
    )

    predictions = []
    for item in response.get("Items", []):
        entry = {
            "week": item.get("Week", ""),
            "model_version": item.get("Model_Version", ""),
            "created_at": item.get("Created_At", ""),
        }
        # Handle new per-category format
        preds_json = item.get("Predictions")
        if preds_json:
            entry["predictions"] = (
                json.loads(preds_json) if isinstance(preds_json, str) else preds_json
            )
        else:
            # Legacy single-value format
            entry["predicted_units"] = float(item.get("Predicted_Units", 0))
        predictions.append(entry)

    return json_response(200, {"store_id": store_id, "predictions": predictions})


def handle_metrics():
    """Get all model accuracy metrics over time."""
    items = []
    scan_kwargs = {
        "FilterExpression": "RecordType = :rt",
        "ExpressionAttributeValues": {":rt": "METRIC"},
    }
    while True:
        response = table.scan(**scan_kwargs)
        items.extend(response.get("Items", []))
        if "LastEvaluatedKey" not in response:
            break
        scan_kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]

    metrics = []
    for item in sorted(items, key=lambda x: x.get("Created_At", "")):
        metrics.append(
            {
                "week": item.get("Week", ""),
                "version": item.get("Version", ""),
                "static_mae": float(item.get("Static_MAE", 0)),
                "adaptive_mae": float(item.get("Adaptive_MAE", 0)),
                "improvement_delta": float(item.get("Improvement_Delta", 0)),
                "improvement_pct": float(item.get("Improvement_Pct", 0)),
                "training_rows": int(item.get("Training_Rows", 0)),
            }
        )

    return json_response(200, {"metrics": metrics})


def handle_metrics_latest():
    """Get the most recent model performance snapshot."""
    response = table.get_item(Key={"PK": "MODEL#LATEST", "SK": "META"})
    if "Item" not in response:
        return json_response(404, {"error": "No model found"})

    latest = response["Item"]
    version = latest["Version"]

    meta_response = table.get_item(Key={"PK": f"MODEL#{version}", "SK": "META"})
    if "Item" not in meta_response:
        return json_response(404, {"error": "Model metadata not found"})

    meta = meta_response["Item"]

    return json_response(
        200,
        {
            "model_version": version,
            "adaptive_mae": float(meta.get("MAE", 0)),
            "static_mae": float(meta.get("Static_MAE", 0)),
            "training_rows": int(meta.get("Training_Rows", 0)),
            "total_records": int(meta.get("Total_Records", 0)),
            "last_retrained": meta.get("Created_At", ""),
            "s3_path": meta.get("S3_Path", ""),
        },
    )


def handle_inventory(store_id):
    """Get current inventory status for a store (latest sales)."""
    response = table.query(
        KeyConditionExpression=Key("PK").eq(f"STORE#{store_id}")
        & Key("SK").begins_with("SALE#"),
        ScanIndexForward=False,
        Limit=50,
    )

    sales = []
    for item in response.get("Items", []):
        sales.append(
            {
                "product_id": item.get("Product_ID", ""),
                "category": item.get("Category", ""),
                "units_sold": int(item.get("Units_Sold", 0)),
                "inventory_level": int(item.get("Inventory_Level", 0)),
                "price": float(item.get("Price", 0)),
                "date": item.get("Date", ""),
            }
        )

    return json_response(200, {"store_id": store_id, "latest_sales": sales})


def handle_reset():
    """Reset demo state: delete all SALE, FEATURE, PRED, METRIC records and reset model pointer."""
    global _cached_adaptive, _cached_adaptive_version, _cached_static

    initial_s3_path = f"s3://{BUCKET}/models/v1/ensemble_model.joblib"
    deleted_counts = {}

    for prefix, label in [
        ("SALE#", "sales"),
        ("FEATURE#", "features"),
        ("PRED#", "predictions"),
    ]:
        deleted = 0
        scan_kwargs = {
            "ProjectionExpression": "PK, SK",
            "FilterExpression": "begins_with(SK, :prefix)",
            "ExpressionAttributeValues": {":prefix": prefix},
        }
        while True:
            response = table.scan(**scan_kwargs)
            items = response.get("Items", [])
            with table.batch_writer() as batch:
                for item in items:
                    batch.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})
                    deleted += 1
            if "LastEvaluatedKey" not in response:
                break
            scan_kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
        deleted_counts[label] = deleted

    deleted = 0
    scan_kwargs = {
        "ProjectionExpression": "PK, SK",
        "FilterExpression": "RecordType = :rt",
        "ExpressionAttributeValues": {":rt": "METRIC"},
    }
    while True:
        response = table.scan(**scan_kwargs)
        items = response.get("Items", [])
        with table.batch_writer() as batch:
            for item in items:
                batch.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})
                deleted += 1
        if "LastEvaluatedKey" not in response:
            break
        scan_kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
    deleted_counts["metrics"] = deleted

    deleted = 0
    scan_kwargs = {
        "ProjectionExpression": "PK, SK",
        "FilterExpression": "begins_with(PK, :prefix)",
        "ExpressionAttributeValues": {":prefix": "MODEL#"},
    }
    while True:
        response = table.scan(**scan_kwargs)
        items = response.get("Items", [])
        with table.batch_writer() as batch:
            for item in items:
                if item["PK"] not in ("MODEL#v1",):
                    batch.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})
                    deleted += 1
        if "LastEvaluatedKey" not in response:
            break
        scan_kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
    deleted_counts["model_records"] = deleted

    table.put_item(
        Item={
            "PK": "MODEL#LATEST",
            "SK": "META",
            "Version": "v1",
            "S3_Path": initial_s3_path,
            "RecordType": "MODEL_POINTER",
        }
    )

    s3_deleted = 0
    keep_prefixes = ("static/", "models/v1/", "encoders/", "layers/")
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=BUCKET, Prefix="models/"):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if not any(key.startswith(p) for p in keep_prefixes):
                s3.delete_object(Bucket=BUCKET, Key=key)
                s3_deleted += 1
    deleted_counts["s3_models"] = s3_deleted

    _cached_adaptive = None
    _cached_adaptive_version = None
    _cached_static = None

    return json_response(
        200, {"message": "Demo reset complete", "deleted": deleted_counts}
    )


def lambda_handler(event, context):
    """Route requests based on API Gateway path and method."""
    if "resource" not in event and "httpMethod" not in event:
        store_id = event.get("store_id", "S001")
        return handle_predict(store_id)

    path = event.get("resource", event.get("path", ""))
    method = event.get("httpMethod", "GET")
    path_params = event.get("pathParameters", {}) or {}

    if method == "OPTIONS":
        return json_response(200, {})

    if "/reset" in path and method == "POST":
        return handle_reset()
    elif "/metrics/latest" in path:
        return handle_metrics_latest()
    elif "/metrics" in path:
        return handle_metrics()
    elif "/predictions" in path and "/history" in path:
        store_id = path_params.get("store_id", "S001")
        return handle_prediction_history(store_id)
    elif "/predictions" in path:
        store_id = path_params.get("store_id", "S001")
        return handle_predict(store_id)
    elif "/inventory" in path or "/stores" in path:
        store_id = path_params.get("store_id", "S001")
        return handle_inventory(store_id)
    else:
        return json_response(400, {"error": f"Unknown route: {method} {path}"})
