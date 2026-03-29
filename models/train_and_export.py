"""
Train and export ML models for the Inventory ML Pipeline.
Produces:
  - static_model.joblib     (trained once on data before 2023-09-01, never updated)
  - adaptive_model_v1.joblib (same initial model, will be retrained in the cloud)

Usage:
  python train_and_export.py

Important: run this inside a venv with matching Lambda layer versions:
  pip install scikit-learn==1.7.2 xgboost==3.0.5 pandas numpy joblib
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor, VotingRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error
from xgboost import XGBRegressor
import joblib
import os
import warnings

warnings.filterwarnings('ignore')

# --- CONFIG ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(SCRIPT_DIR, '..', 'retail_store_inventory.csv')
OUTPUT_DIR = SCRIPT_DIR
TRAIN_CUTOFF = pd.Timestamp('2023-09-01')

FEATURES = ['Category', 'Region', 'Price', 'Discount', 'Weather Condition',
            'DayOfWeek', 'Month', 'Sales_Lag_1', 'Sales_Lag_7', 'Rolling_7']
TARGET = 'Units Sold'

# Encoding maps — must match Lambda code exactly
CATEGORY_MAP = {'Clothing': 0, 'Electronics': 1, 'Furniture': 2, 'Groceries': 3, 'Toys': 4}
REGION_MAP = {'East': 0, 'North': 1, 'South': 2, 'West': 3}
WEATHER_MAP = {'Cloudy': 0, 'Rainy': 1, 'Snowy': 2, 'Sunny': 3}
SEASON_MAP = {'Autumn': 0, 'Spring': 1, 'Summer': 2, 'Winter': 3}


def prepare_data(df):
    """Prepare dataset with feature engineering — matches Lambda pipeline exactly."""
    df['Date'] = pd.to_datetime(df['Date'])
    df = df.sort_values(['Date', 'Store ID', 'Product ID'])

    # Encode categoricals using the same hardcoded maps as Lambda code
    df['Category'] = df['Category'].map(CATEGORY_MAP)
    df['Region'] = df['Region'].map(REGION_MAP)
    df['Weather Condition'] = df['Weather Condition'].map(WEATHER_MAP)
    df['Seasonality'] = df['Seasonality'].map(SEASON_MAP)

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
    """Create the ensemble model — RF + XGBoost + LR (matching retrain Lambda)."""
    return VotingRegressor(
        estimators=[
            ('rf', RandomForestRegressor(n_estimators=100, n_jobs=-1, random_state=42)),
            ('xgb', XGBRegressor(n_jobs=-1, random_state=42)),
            ('lr', LinearRegression())
        ],
        weights=[0.4, 0.4, 0.2]
    )


def main():
    print("Loading dataset...")
    df_raw = pd.read_csv(CSV_PATH)
    print(f"  Raw rows: {len(df_raw)}")

    print("Preparing data (encoding, lag features, rolling averages)...")
    df = prepare_data(df_raw)
    print(f"  Rows after dropna: {len(df)}")

    # Split: train on everything before cutoff
    train_data = df[df['Date'] < TRAIN_CUTOFF]
    test_data = df[df['Date'] >= TRAIN_CUTOFF]
    print(f"  Training rows: {len(train_data)}")
    print(f"  Test/simulation rows: {len(test_data)}")

    # Train the static model
    print("\nTraining static ensemble (RF 0.4 + XGBoost 0.4 + LR 0.2)...")
    static_model = build_ensemble()
    static_model.fit(train_data[FEATURES], train_data[TARGET])

    # Evaluate on test set
    static_preds = static_model.predict(test_data[FEATURES])
    static_mae = mean_absolute_error(test_data[TARGET], static_preds)
    print(f"  Static Model MAE (on test set): {static_mae:.2f}")

    # Save static model (with compression for Lambda-friendly size)
    static_path = os.path.join(OUTPUT_DIR, 'static_model.joblib')
    joblib.dump(static_model, static_path, compress=3)
    print(f"  Saved: {static_path} ({os.path.getsize(static_path)/1024/1024:.1f} MB)")

    # Save initial adaptive model (same as static at the start)
    adaptive_path = os.path.join(OUTPUT_DIR, 'adaptive_model_v1.joblib')
    joblib.dump(static_model, adaptive_path, compress=3)
    print(f"  Saved: {adaptive_path}")

    # Print encoding maps for reference
    print("\n--- Encoding Maps (hardcoded in Lambda code) ---")
    print(f"  Category: {CATEGORY_MAP}")
    print(f"  Region:   {REGION_MAP}")
    print(f"  Weather:  {WEATHER_MAP}")
    print(f"  Season:   {SEASON_MAP}")

    print(f"\nDone! Files saved to {OUTPUT_DIR}")
    print(f"  static_model.joblib       — upload to S3 static/")
    print(f"  adaptive_model_v1.joblib  — upload to S3 models/v1/ensemble_model.joblib")


if __name__ == '__main__':
    main()
