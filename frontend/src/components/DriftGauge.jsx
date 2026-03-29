export default function DriftGauge({ staticMAE, adaptiveMAE }) {
  if (!staticMAE || !adaptiveMAE) {
    return (
      <div className="p-6 flex flex-col items-center justify-center" style={{ border: '2px solid #000', minHeight: 200, backgroundColor: '#fafafa' }}>
        <p className="text-sm font-bold uppercase tracking-widest" style={{ color: '#ccc' }}>Drift Gauge</p>
        <p className="text-xs mt-2" style={{ color: '#ccc' }}>Waiting for data</p>
      </div>
    );
  }

  const improvement = ((staticMAE - adaptiveMAE) / staticMAE * 100);
  const gap = staticMAE - adaptiveMAE;

  let severityLabel, severityColor, severityBg;
  if (gap < 2) { severityLabel = 'NO DRIFT'; severityColor = '#16a34a'; severityBg = '#f0fdf4'; }
  else if (gap < 5) { severityLabel = 'LOW DRIFT'; severityColor = '#16a34a'; severityBg = '#f0fdf4'; }
  else if (gap < 15) { severityLabel = 'MODERATE'; severityColor = '#d97706'; severityBg = '#fffbeb'; }
  else if (gap < 25) { severityLabel = 'HIGH DRIFT'; severityColor = '#ea580c'; severityBg = '#fff7ed'; }
  else { severityLabel = 'SEVERE'; severityColor = '#dc2626'; severityBg = '#fef2f2'; }

  const pct = Math.min(gap / 40 * 100, 100);

  return (
    <div className="p-6" style={{ border: `2px solid ${severityColor}`, backgroundColor: severityBg }}>
      <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: '#999' }}>
        Drift Detector
      </p>

      <div className="text-center mb-4">
        <div className="text-2xl font-bold" style={{ color: severityColor }}>{severityLabel}</div>
        <div className="text-xs mt-1 font-bold" style={{ color: '#666' }}>{gap.toFixed(1)} pt gap</div>
      </div>

      {/* Bar */}
      <div className="w-full h-5 mb-1" style={{ backgroundColor: '#fff', border: `2px solid ${severityColor}` }}>
        <div className="h-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: severityColor }} />
      </div>
      <div className="flex justify-between text-xs font-bold mb-4" style={{ color: '#ccc' }}>
        <span>0</span><span>40+</span>
      </div>

      <div className="grid grid-cols-2 gap-0" style={{ border: '1px solid #000' }}>
        <div className="p-3 text-center" style={{ borderRight: '1px solid #000', backgroundColor: '#fef2f2' }}>
          <div className="text-xs font-bold uppercase" style={{ color: '#dc2626' }}>Static</div>
          <div className="text-xl font-bold">{staticMAE.toFixed(1)}</div>
        </div>
        <div className="p-3 text-center" style={{ backgroundColor: '#f0fdf4' }}>
          <div className="text-xs font-bold uppercase" style={{ color: '#16a34a' }}>Adaptive</div>
          <div className="text-xl font-bold">{adaptiveMAE.toFixed(1)}</div>
        </div>
      </div>

      <div className="text-center mt-3 py-2" style={{ backgroundColor: severityColor, color: '#fff' }}>
        <span className="text-sm font-bold">{improvement.toFixed(1)}% MORE ACCURATE</span>
      </div>
    </div>
  );
}
