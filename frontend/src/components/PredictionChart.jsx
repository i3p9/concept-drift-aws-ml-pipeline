import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CATEGORY_COLORS } from '../data/scenarios';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const actualVal = payload.find(p => p.dataKey === 'actual_avg')?.value;
  const staticVal = payload.find(p => p.dataKey === 'static_units')?.value;
  const adaptiveVal = payload.find(p => p.dataKey === 'adaptive_units')?.value;

  const sGap = actualVal && staticVal ? Math.abs(staticVal - actualVal) : null;
  const aGap = actualVal && adaptiveVal ? Math.abs(adaptiveVal - actualVal) : null;

  return (
    <div style={{ backgroundColor: '#fff', border: '2px solid #000', padding: 12, fontFamily: 'inherit' }}>
      <p style={{ color: CATEGORY_COLORS[label] || '#000', margin: '0 0 6px', fontWeight: 700, fontSize: 13 }}>
        {label}
      </p>
      {actualVal != null && (
        <p style={{ color: '#2563eb', margin: '2px 0', fontSize: 12 }}>
          Actual: ~{actualVal?.toFixed(0)} units
        </p>
      )}
      <p style={{ color: '#dc2626', margin: '2px 0', fontSize: 12 }}>
        Static (v1): ~{staticVal?.toFixed(0)} units {sGap != null && <span style={{ color: '#999' }}>(off by {sGap.toFixed(1)})</span>}
      </p>
      <p style={{ color: '#16a34a', margin: '2px 0', fontSize: 12 }}>
        Adaptive: ~{adaptiveVal?.toFixed(0)} units {aGap != null && <span style={{ color: '#999' }}>(off by {aGap.toFixed(1)})</span>}
      </p>
      {sGap != null && aGap != null && (
        <p style={{
          color: aGap < sGap ? '#16a34a' : '#dc2626', margin: '4px 0 0', fontSize: 11,
          borderTop: '1px solid #000', paddingTop: 4, fontWeight: 700
        }}>
          {aGap < sGap ? 'Adaptive is closer to actual' : 'Static is closer to actual'}
        </p>
      )}
    </div>
  );
}

export default function PredictionChart({ predictions, predictTarget, storeId }) {
  if (!predictions?.length) {
    return (
      <div className="p-5" style={{ border: '2px solid #000' }}>
        <h3 className="text-sm font-bold uppercase tracking-widest mb-1">Demand Forecast by Category</h3>
        <p className="text-xs mb-4" style={{ color: '#666' }}>Static (v1) vs Adaptive model — per category for {storeId}</p>
        <div className="flex items-center justify-center h-52" style={{ backgroundColor: '#fafafa', border: '1px dashed #ccc' }}>
          <p className="text-sm font-bold uppercase" style={{ color: '#ccc' }}>Inject data, retrain, then predict</p>
        </div>
      </div>
    );
  }

  const order = ['Electronics', 'Groceries', 'Clothing', 'Furniture', 'Toys'];
  const data = order
    .map(cat => predictions.find(p => p.category === cat))
    .filter(Boolean);

  const hasActuals = data.some(d => d.actual_avg != null);
  const adaptiveWins = data.filter(d => d.winner === 'adaptive').length;

  return (
    <div className="p-5" style={{ border: '2px solid #000' }}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-widest mb-1">Predicted vs Actual Demand</h3>
          <p className="text-xs" style={{ color: '#666' }}>
            Per-category comparison — {storeId}
          </p>
        </div>
        {hasActuals && (
          <div className="text-right">
            <div className="text-xs font-bold" style={{ color: '#16a34a' }}>
              Adaptive closer: {adaptiveWins}/{data.length}
            </div>
          </div>
        )}
      </div>

      {predictTarget && (
        <div className="mb-3 px-3 py-2 text-xs font-bold" style={{ backgroundColor: '#f0f0f0', border: '1px solid #000' }}>
          Based on ingested data up to: <span style={{ color: '#2563eb' }}>{predictTarget}</span>
        </div>
      )}

      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: -5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
          <XAxis dataKey="category" stroke="#000" fontSize={9} tick={{ fill: '#000' }} />
          <YAxis stroke="#000" fontSize={9} tick={{ fill: '#000' }} label={{ value: 'Avg Units', angle: -90, position: 'insideLeft', fontSize: 9, fill: '#999' }} />
          <Tooltip content={<CustomTooltip />} />
          {hasActuals && (
            <Bar dataKey="actual_avg" name="Actual" fill="#2563eb" opacity={0.5} maxBarSize={25} />
          )}
          <Bar dataKey="static_units" name="Static (v1)" fill="#dc2626" opacity={0.7} maxBarSize={25} />
          <Bar dataKey="adaptive_units" name="Adaptive" fill="#16a34a" maxBarSize={25} />
        </BarChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 pt-2 flex-wrap" style={{ borderTop: '1px solid #e5e5e5' }}>
        {hasActuals && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3" style={{ backgroundColor: '#2563eb', opacity: 0.5 }} />
            <span className="text-xs" style={{ color: '#2563eb' }}>Actual sales</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3" style={{ backgroundColor: '#dc2626', opacity: 0.7 }} />
          <span className="text-xs" style={{ color: '#dc2626' }}>Static (v1)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3" style={{ backgroundColor: '#16a34a' }} />
          <span className="text-xs" style={{ color: '#16a34a' }}>Adaptive</span>
        </div>
      </div>
    </div>
  );
}
