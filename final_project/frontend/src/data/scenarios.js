export const MAIN_SCENARIOS = [
  {
    id: 'september',
    label: 'September',
    description: '3,000 records — baseline fall sales data',
    file: '/batches/batch1_september.json',
    color: '#22c55e',
    predictTarget: 'October',
  },
  {
    id: 'october',
    label: 'October',
    description: '3,100 records — weather shifts, pattern changes',
    file: '/batches/batch2_october.json',
    color: '#3b82f6',
    predictTarget: 'November',
  },
  {
    id: 'november',
    label: 'November',
    description: '3,000 records — pre-holiday demand changes',
    file: '/batches/batch3_november.json',
    color: '#f59e0b',
    predictTarget: 'December',
  },
  {
    id: 'december',
    label: 'December',
    description: '3,200 records — peak seasonal shift',
    file: '/batches/batch4_december.json',
    color: '#ef4444',
    predictTarget: 'January',
  }
];

export const CATEGORY_COLORS = {
  Electronics: '#3b82f6',
  Groceries: '#22c55e',
  Clothing: '#a855f7',
  Furniture: '#f59e0b',
  Toys: '#ec4899'
};
