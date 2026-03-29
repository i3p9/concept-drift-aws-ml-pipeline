"""
Generate the baseline training dataset (pre-September 2023) as a CSV.
This gets uploaded to S3 so the retrain Lambda can include historical
data when usePrevData=true.

The CSV uses the same field names the retrain Lambda expects
(matching DynamoDB item format from the ingest Lambda).

Usage:
  python generate_baseline.py
  aws s3 cp baseline_training_data.csv s3://inventory-ml-models-811936641380/baseline/baseline_training_data.csv
"""

import pandas as pd
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(SCRIPT_DIR, 'retail_store_inventory.csv')
OUTPUT_PATH = os.path.join(SCRIPT_DIR, 'baseline_training_data.csv')
CUTOFF = '2023-09-01'


def main():
    print("Loading dataset...")
    df = pd.read_csv(CSV_PATH)
    df['Date'] = pd.to_datetime(df['Date'])
    print(f"  Total rows: {len(df)}")

    # Filter pre-September 2023
    baseline = df[df['Date'] < CUTOFF].copy()
    print(f"  Baseline rows (before {CUTOFF}): {len(baseline)}")

    # Rename columns to match DynamoDB/ingest format
    out = pd.DataFrame({
        'Date': baseline['Date'].dt.strftime('%Y-%m-%d'),
        'Store_ID': baseline['Store ID'],
        'Product_ID': baseline['Product ID'],
        'Category': baseline['Category'],
        'Region': baseline['Region'],
        'Inventory_Level': baseline['Inventory Level'],
        'Units_Sold': baseline['Units Sold'],
        'Units_Ordered': baseline['Units Ordered'],
        'Price': baseline['Price'].round(2),
        'Discount': baseline['Discount'],
        'Weather_Condition': baseline['Weather Condition'],
        'Holiday_Promotion': baseline['Promotion'],
        'Competitor_Pricing': baseline['Competitor Pricing'].round(2),
        'Seasonality': baseline['Seasonality'],
    })

    out.to_csv(OUTPUT_PATH, index=False)
    size_mb = os.path.getsize(OUTPUT_PATH) / 1024 / 1024
    print(f"  Saved: {OUTPUT_PATH} ({size_mb:.1f} MB, {len(out)} rows)")
    print(f"\nUpload to S3:")
    print(f"  aws s3 cp {OUTPUT_PATH} s3://inventory-ml-models-811936641380/baseline/baseline_training_data.csv")


if __name__ == '__main__':
    main()
