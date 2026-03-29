import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const staticVal = payload.find(p => p.dataKey === 'static_mae')?.value;
  const adaptiveVal = payload.find(p => p.dataKey === 'adaptive_mae')?.value;
  const gap = staticVal && adaptiveVal ? (staticVal - adaptiveVal).toFixed(1) : null;

  return (
    <div style={{ backgroundColor: '#fff', border: '2px solid #000', padding: 12, fontFamily: 'inherit' }}>
      <p style={{ color: '#000', margin: '0 0 6px', fontSize: 12, fontWeight: 700 }}>{label}</p>
      <p style={{ color: '#dc2626', margin: '2px 0', fontSize: 12 }}>Static: {staticVal?.toFixed(1)}</p>
      <p style={{ color: '#16a34a', margin: '2px 0', fontSize: 12 }}>Adaptive: {adaptiveVal?.toFixed(1)}</p>
      {gap && <p style={{ color: '#000', margin: '4px 0 0', fontSize: 11, borderTop: '1px solid #000', paddingTop: 4 }}>Gap: {gap} pts</p>}
    </div>
  );
}

export default function MAEChart({ metrics }) {
  if (!metrics?.length) {
    return (
      <div className="p-5" style={{ border: '2px solid #000' }}>
        <h3 className="text-sm font-bold uppercase tracking-widest mb-1">Does Retraining Help?</h3>
        <p className="text-xs mb-4" style={{ color: '#666' }}>Inject data and retrain to compare.</p>
        <div className="flex items-center justify-center h-52" style={{ backgroundColor: '#fafafa', border: '1px dashed #ccc' }}>
          <p className="text-sm font-bold uppercase" style={{ color: '#ccc' }}>Awaiting Data</p>
        </div>
      </div>
    );
  }

  const data = metrics.map((m, i) => ({ ...m, label: m.week || `Retrain ${i + 1}` }));
  const last = data[data.length - 1];
  const gap = last ? (last.static_mae - last.adaptive_mae) : 0;
  const improvement = last && last.static_mae > 0 ? (gap / last.static_mae * 100) : 0;

  let driftLabel, driftColor;
  if (gap < 2) { driftLabel = 'NONE'; driftColor = '#16a34a'; }
  else if (gap < 15) { driftLabel = 'MODERATE'; driftColor = '#d97706'; }
  else if (gap < 25) { driftLabel = 'HIGH'; driftColor = '#ea580c'; }
  else { driftLabel = 'SEVERE'; driftColor = '#dc2626'; }

  return (
    <div className="p-5" style={{ border: '2px solid #000' }}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-widest mb-1">Does Retraining Help?</h3>
          <p className="text-xs" style={{ color: '#666' }}>MAE over time — lower is better</p>
        </div>
        {gap > 5 && (
          <span className="text-xs font-bold px-2 py-1" style={{ backgroundColor: '#000', color: '#fff' }}>
            YES
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: -5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
          <XAxis dataKey="label" stroke="#000" fontSize={9} tick={{ fill: '#000' }} />
          <YAxis stroke="#000" fontSize={9} tick={{ fill: '#000' }} />
          <Tooltip content={<CustomTooltip />} />
          <Line type="monotone" dataKey="static_mae" stroke="#dc2626" strokeWidth={2} strokeDasharray="6 3"
                dot={{ fill: '#dc2626', r: 4, strokeWidth: 2, stroke: '#fff' }} />
          <Line type="monotone" dataKey="adaptive_mae" stroke="#16a34a" strokeWidth={2.5}
                dot={{ fill: '#16a34a', r: 4, strokeWidth: 2, stroke: '#fff' }} />
        </LineChart>
      </ResponsiveContainer>

      {/* Compact legend */}
      <div className="flex items-center gap-4 mt-2 pt-2" style={{ borderTop: '1px solid #e5e5e5' }}>
        <div className="flex items-center gap-1.5">
          <div className="w-4" style={{ borderTop: '2px dashed #dc2626' }} />
          <span className="text-xs" style={{ color: '#dc2626' }}>Static</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5" style={{ backgroundColor: '#16a34a' }} />
          <span className="text-xs" style={{ color: '#16a34a' }}>Adaptive</span>
        </div>
      </div>

      {/* Drift summary strip */}
      <div className="grid grid-cols-3 gap-0 mt-3" style={{ border: '1px solid #000' }}>
        <div className="p-2 text-center" style={{ backgroundColor: '#fef2f2', borderRight: '1px solid #000' }}>
          <div className="text-xs font-bold" style={{ color: '#dc2626' }}>{last?.static_mae?.toFixed(1)}</div>
          <div className="text-xs" style={{ color: '#999' }}>Static</div>
        </div>
        <div className="p-2 text-center" style={{ backgroundColor: '#f0fdf4', borderRight: '1px solid #000' }}>
          <div className="text-xs font-bold" style={{ color: '#16a34a' }}>{last?.adaptive_mae?.toFixed(1)}</div>
          <div className="text-xs" style={{ color: '#999' }}>Adaptive</div>
        </div>
        <div className="p-2 text-center" style={{ backgroundColor: driftColor, color: '#fff' }}>
          <div className="text-xs font-bold">{improvement.toFixed(0)}%</div>
          <div className="text-xs">{driftLabel}</div>
        </div>
      </div>
    </div>
  );
}
