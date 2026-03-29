"""
Generate simulation data batches from the Kaggle dataset.
Produces 4 JSON batch files ready for the Ingest Lambda.

Batches:
  1. September 2023 (Normal fall sales)
  2. October 2023 (Normal continued)
  3. November 2023 (Pre-holiday ramp-up)
  4. December 2023 - Jan 2024 (Christmas rush + new year)

Each batch contains records formatted for DynamoDB ingestion with
the fields expected by the ingest Lambda.

Usage:
  python generate_batches.py
"""

import pandas as pd
import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(SCRIPT_DIR, '..', 'retail_store_inventory.csv')
OUTPUT_DIR = os.path.join(SCRIPT_DIR, 'simulation_batches')


def format_record(row):
    """Convert a DataFrame row into the JSON format expected by the Ingest Lambda."""
    return {
        "Date": str(row['Date'].date()),
        "Store_ID": row['Store ID'],
        "Product_ID": row['Product ID'],
        "Category": row['Category'],
        "Region": row['Region'],
        "Inventory_Level": int(row['Inventory Level']),
        "Units_Sold": int(row['Units Sold']),
        "Units_Ordered": int(row['Units Ordered']),
        "Demand_Forecast": round(float(row['Demand Forecast']), 2),
        "Price": round(float(row['Price']), 2),
        "Discount": int(row['Discount']),
        "Weather_Condition": row['Weather Condition'],
        "Holiday_Promotion": int(row['Holiday/Promotion']),
        "Competitor_Pricing": round(float(row['Competitor Pricing']), 2),
        "Seasonality": row['Seasonality']
    }


def main():
    print("Loading dataset...")
    df = pd.read_csv(CSV_PATH)
    df['Date'] = pd.to_datetime(df['Date'])

    # Define batch date ranges
    batches = [
        {
            "name": "batch1_september",
            "label": "September 2023 (Normal Fall)",
            "start": "2023-09-01",
            "end": "2023-09-30"
        },
        {
            "name": "batch2_october",
            "label": "October 2023 (Normal Continued)",
            "start": "2023-10-01",
            "end": "2023-10-31"
        },
        {
            "name": "batch3_november",
            "label": "November 2023 (Pre-Holiday Ramp)",
            "start": "2023-11-01",
            "end": "2023-11-30"
        },
        {
            "name": "batch4_december",
            "label": "December 2023 - Jan 2024 (Christmas Rush)",
            "start": "2023-12-01",
            "end": "2024-01-01"
        }
    ]

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    for batch in batches:
        mask = (df['Date'] >= batch['start']) & (df['Date'] <= batch['end'])
        batch_df = df[mask]

        records = [format_record(row) for _, row in batch_df.iterrows()]

        output = {
            "batch_label": batch['label'],
            "record_count": len(records),
            "date_range": f"{batch['start']} to {batch['end']}",
            "records": records
        }

        filepath = os.path.join(OUTPUT_DIR, f"{batch['name']}.json")
        with open(filepath, 'w') as f:
            json.dump(output, f, indent=2)

        print(f"  {batch['name']}.json — {len(records)} records ({batch['label']})")

    # Also create a small sample file for quick testing (first 10 records of batch 1)
    with open(os.path.join(OUTPUT_DIR, 'batch1_september.json')) as f:
        batch1 = json.load(f)

    sample = {
        "batch_label": "Quick Test Sample (10 records)",
        "record_count": 10,
        "records": batch1['records'][:10]
    }
    sample_path = os.path.join(OUTPUT_DIR, 'sample_test.json')
    with open(sample_path, 'w') as f:
        json.dump(sample, f, indent=2)
    print(f"  sample_test.json — 10 records (for quick API testing)")

    print(f"\nAll batches saved to {OUTPUT_DIR}")


if __name__ == '__main__':
    main()
