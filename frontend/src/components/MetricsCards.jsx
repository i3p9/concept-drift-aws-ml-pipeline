export default function MetricsCards({ data }) {
  const d = data || {};
  const improvement = d.static_mae && d.adaptive_mae
    ? ((d.static_mae - d.adaptive_mae) / d.static_mae * 100)
    : null;

  const lastRetrained = d.last_retrained ? (() => {
    const mins = Math.floor((Date.now() - new Date(d.last_retrained)) / 60000);
    if (mins < 1) return 'Now';
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h`;
  })() : null;

  const totalRecords = d.total_records || null;

  const cards = [
    { label: 'MODEL', value: d.model_version || '--', accent: '#2563eb', bg: '#eff6ff' },
    { label: 'ADAPTIVE ERR', value: d.adaptive_mae ? d.adaptive_mae.toFixed(1) : '--', accent: '#16a34a', bg: '#f0fdf4' },
    { label: 'STATIC ERR', value: d.static_mae ? d.static_mae.toFixed(1) : '--', accent: '#dc2626', bg: '#fef2f2' },
    { label: 'IMPROVEMENT', value: improvement !== null ? `${improvement.toFixed(1)}%` : '--', accent: '#7c3aed', bg: '#f5f3ff' },
    { label: 'TOTAL RECORDS', value: totalRecords ? totalRecords.toLocaleString() : '--', accent: '#d97706', bg: '#fffbeb' },
    { label: 'RETRAINED', value: lastRetrained || '--', accent: '#0891b2', bg: '#ecfeff' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-0" style={{ border: '2px solid #000' }}>
      {cards.map((card, i) => (
        <div key={card.label} className="p-4"
             style={{
               borderRight: i < cards.length - 1 ? '1px solid #000' : 'none',
               borderLeft: `4px solid ${card.accent}`,
               backgroundColor: card.bg,
             }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: card.accent }}>
            {card.label}
          </div>
          <div className="text-2xl font-bold" style={{ color: '#000' }}>
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}
