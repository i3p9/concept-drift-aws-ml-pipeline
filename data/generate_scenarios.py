"""
Generate synthetic "what-if" scenario batches for the demo.
Creates 3 scenario files by modifying copies of existing batch data.

Usage:
  cd final_project
  source venv/bin/activate
  python data/generate_scenarios.py
"""

import json
import os
import random
import copy

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BATCH_DIR = os.path.join(SCRIPT_DIR, 'simulation_batches')

random.seed(42)


def load_batch(filename):
    with open(os.path.join(BATCH_DIR, filename)) as f:
        return json.load(f)['records']


def generate_snowstorm(base_records):
    """
    Snowstorm Emergency: Blizzard hits the region.
    - All weather → Snowy, season → Winter
    - Groceries demand doubles (people stock up)
    - Clothing and Toys demand halved (nobody goes shopping)
    - Electronics stays roughly the same
    """
    sampled = random.sample(base_records, min(500, len(base_records)))
    records = copy.deepcopy(sampled)

    for r in records:
        r['Weather_Condition'] = 'Snowy'
        r['Seasonality'] = 'Winter'
        r['Date'] = '2024-01-15'  # Mid-January blizzard

        if r['Category'] == 'Groceries':
            r['Units_Sold'] = int(r['Units_Sold'] * 2.0)
            r['Demand_Forecast'] = round(r['Demand_Forecast'] * 1.8, 2)
            r['Inventory_Level'] = max(5, int(r['Inventory_Level'] * 0.4))
        elif r['Category'] in ('Clothing', 'Toys'):
            r['Units_Sold'] = max(1, int(r['Units_Sold'] * 0.4))
            r['Demand_Forecast'] = round(r['Demand_Forecast'] * 0.5, 2)
        elif r['Category'] == 'Electronics':
            r['Units_Sold'] = int(r['Units_Sold'] * 1.1)

    return records


def generate_flash_sale(base_records):
    """
    Electronics Flash Sale: Massive promotion event.
    - Only Electronics products
    - Heavy discounts (30-50%)
    - Holiday promotion active
    - Units sold boosted 1.8x
    """
    electronics = [r for r in base_records if r['Category'] == 'Electronics']
    sampled = random.sample(electronics, min(500, len(electronics)))
    records = copy.deepcopy(sampled)

    for r in records:
        r['Discount'] = random.randint(30, 50)
        r['Holiday_Promotion'] = 1
        r['Units_Sold'] = int(r['Units_Sold'] * 1.8)
        r['Demand_Forecast'] = round(r['Demand_Forecast'] * 1.6, 2)
        r['Price'] = round(r['Price'] * 0.7, 2)
        r['Competitor_Pricing'] = round(r['Competitor_Pricing'] * 0.85, 2)
        r['Date'] = '2024-02-01'  # Flash sale event

    return records


def generate_supply_crisis(base_records):
    """
    Supply Chain Crisis: Stock shortages across all categories.
    - Inventory levels drop to 30%
    - Competitor prices surge 25%
    - Demand stays the same (supply problem, not demand)
    - Some categories hit harder than others
    """
    sampled = random.sample(base_records, min(500, len(base_records)))
    records = copy.deepcopy(sampled)

    for r in records:
        r['Inventory_Level'] = max(5, int(r['Inventory_Level'] * 0.3))
        r['Competitor_Pricing'] = round(r['Competitor_Pricing'] * 1.25, 2)
        r['Price'] = round(r['Price'] * 1.1, 2)
        r['Discount'] = max(0, r['Discount'] - 10)
        r['Date'] = '2024-02-15'  # Supply crisis period

        if r['Category'] == 'Electronics':
            r['Inventory_Level'] = max(2, int(r['Inventory_Level'] * 0.5))
        elif r['Category'] == 'Furniture':
            r['Inventory_Level'] = max(2, int(r['Inventory_Level'] * 0.3))

    return records


def main():
    print("Loading base batch data...")
    # Use a mix of batches as the base for variety
    all_records = load_batch('batch1_september.json') + load_batch('batch2_october.json')
    print(f"  Loaded {len(all_records)} base records")
    print()

    scenarios = [
        {
            'name': 'scenario_snowstorm',
            'label': 'Snowstorm Emergency — Blizzard disrupts buying patterns',
            'generator': generate_snowstorm
        },
        {
            'name': 'scenario_flash_sale',
            'label': 'Electronics Flash Sale — Massive promotion event',
            'generator': generate_flash_sale
        },
        {
            'name': 'scenario_supply_crisis',
            'label': 'Supply Chain Crisis — Stock shortages, price surges',
            'generator': generate_supply_crisis
        }
    ]

    for scenario in scenarios:
        records = scenario['generator'](all_records)
        output = {
            'batch_label': scenario['label'],
            'record_count': len(records),
            'records': records
        }

        filepath = os.path.join(BATCH_DIR, f"{scenario['name']}.json")
        with open(filepath, 'w') as f:
            json.dump(output, f, indent=2)

        print(f"  {scenario['name']}.json — {len(records)} records")

    print()
    print("All scenario files saved to data/simulation_batches/")


if __name__ == '__main__':
    main()
