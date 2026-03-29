import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { CATEGORY_COLORS } from '../data/scenarios';

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ backgroundColor: '#fff', border: '2px solid #000', padding: 12, fontFamily: 'inherit' }}>
      <p style={{ color: CATEGORY_COLORS[d.category] || '#000', margin: '0 0 4px', fontWeight: 700, fontSize: 13 }}>
        {d.category}
      </p>
      <p style={{ color: '#000', margin: '2px 0', fontSize: 12 }}>{d.units.toLocaleString()} units sold</p>
      <p style={{ color: '#666', margin: '2px 0', fontSize: 11 }}>Avg price: ${d.avgPrice?.toFixed(2)}</p>
      <p style={{ color: '#666', margin: '2px 0', fontSize: 11 }}>{d.count} transactions</p>
    </div>
  );
}

export default function CategoryBreakdown({ inventory }) {
  if (!inventory?.length) {
    return (
      <div className="p-6" style={{ border: '2px solid #000' }}>
        <h3 className="text-sm font-bold uppercase tracking-widest mb-1">Product Mix</h3>
        <p className="text-xs mb-6" style={{ color: '#666' }}>What categories are selling — this drives concept drift.</p>
        <div className="flex items-center justify-center h-56" style={{ backgroundColor: '#fafafa', border: '1px dashed #ccc' }}>
          <p className="text-sm" style={{ color: '#999' }}>NO DATA YET</p>
        </div>
      </div>
    );
  }

  const categoryMap = {};
  inventory.forEach(item => {
    const cat = item.category;
    if (!categoryMap[cat]) categoryMap[cat] = { category: cat, units: 0, totalPrice: 0, count: 0 };
    categoryMap[cat].units += item.units_sold;
    categoryMap[cat].totalPrice += item.price;
    categoryMap[cat].count += 1;
  });

  const data = Object.values(categoryMap).map(c => ({
    ...c,
    avgPrice: c.totalPrice / c.count,
  })).sort((a, b) => b.units - a.units);

  return (
    <div className="p-6" style={{ border: '2px solid #000' }}>
      <div className="mb-4">
        <h3 className="text-sm font-bold uppercase tracking-widest mb-1">Product Mix</h3>
        <p className="text-xs" style={{ color: '#666' }}>
          <span style={{ color: CATEGORY_COLORS[data[0]?.category], fontWeight: 700 }}>{data[0]?.category}</span> leads with {data[0]?.units.toLocaleString()} units
        </p>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 10, right: 10, bottom: 5, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
          <XAxis dataKey="category" stroke="#000" fontSize={10} tick={{ fill: '#000' }} />
          <YAxis stroke="#000" fontSize={10} tick={{ fill: '#000' }} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="units" maxBarSize={50}>
            {data.map((entry, i) => (
              <Cell key={i} fill={CATEGORY_COLORS[entry.category] || '#000'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap gap-4 mt-3 pt-3" style={{ borderTop: '1px solid #e5e5e5' }}>
        {data.map(d => (
          <div key={d.category} className="flex items-center gap-1.5">
            <div className="w-3 h-3" style={{ backgroundColor: CATEGORY_COLORS[d.category] }} />
            <span className="text-xs font-bold">{d.category}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
