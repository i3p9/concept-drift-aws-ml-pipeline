import { RefreshCw, RotateCcw, Brain, BarChart3 } from 'lucide-react';
import { MAIN_SCENARIOS } from '../data/scenarios';

function ScenarioButton({ scenario, onClick, disabled, loading, stepNumber }) {
  return (
    <button
      onClick={() => onClick(scenario)}
      disabled={disabled}
      className="flex items-center gap-3 w-full text-left px-4 py-3 transition-colors disabled:opacity-30"
      style={{
        border: `1px solid ${scenario.color}`,
        backgroundColor: loading ? `${scenario.color}10` : '#fff',
        borderLeft: `4px solid ${scenario.color}`,
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.backgroundColor = `${scenario.color}10`; }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = loading ? `${scenario.color}10` : '#fff'; }}
    >
      {stepNumber && (
        <span className="text-sm font-bold" style={{ color: scenario.color }}>
          {String(stepNumber).padStart(2, '0')}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold" style={{ color: scenario.color }}>{scenario.label}</div>
        <div className="text-xs" style={{ color: '#666' }}>{scenario.description}</div>
      </div>
      {loading && <RefreshCw size={14} color={scenario.color} className="animate-spin flex-shrink-0" />}
    </button>
  );
}

export default function DemoControls({ onInject, onRetrain, onPredict, onRefresh, onReset, disabled, loadingAction, scenariosInjected, hasRetrained, usePrevData, onTogglePrevData }) {
  const canRetrain = scenariosInjected > 0;
  const canPredict = scenariosInjected > 0;

  return (
    <div className="p-5" style={{ border: '2px solid #000' }}>
      <h3 className="text-sm font-bold uppercase tracking-widest mb-1">Controls</h3>
      <p className="text-xs mb-4" style={{ color: '#666' }}>
        Inject monthly data, retrain, then predict
      </p>

      {/* Monthly data injection */}
      <div className="mb-4">
        <div className="text-xs font-bold uppercase tracking-widest mb-2 pb-1" style={{ color: '#999', borderBottom: '1px solid #e5e5e5' }}>
          Step 1 — Data Injection
        </div>
        <div className="space-y-1">
          {MAIN_SCENARIOS.map((s, i) => (
            <ScenarioButton key={s.id} scenario={s} onClick={onInject} disabled={disabled}
              loading={loadingAction === `inject-${s.id}`} stepNumber={i + 1} />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2 pt-4" style={{ borderTop: '2px solid #000' }}>
        <div className="text-xs font-bold uppercase tracking-widest mb-2 pb-1" style={{ color: '#999', borderBottom: '1px solid #e5e5e5' }}>
          Step 2 — Retrain
        </div>
        <button onClick={onRetrain} disabled={disabled || !canRetrain}
          className="flex items-center justify-center gap-2 w-full px-4 py-3 font-bold text-sm uppercase tracking-wider transition-all disabled:opacity-30"
          style={{ backgroundColor: '#16a34a', color: '#fff', border: '2px solid #16a34a' }}
          onMouseEnter={e => { if (!disabled && canRetrain) { e.currentTarget.style.backgroundColor = '#fff'; e.currentTarget.style.color = '#16a34a'; } }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#16a34a'; e.currentTarget.style.color = '#fff'; }}>
          {loadingAction === 'retrain' ? <RefreshCw size={14} className="animate-spin" /> : <Brain size={14} />}
          Retrain Model
        </button>
        <label className="flex items-center gap-2 text-xs cursor-pointer select-none mt-1" style={{ color: '#666' }}>
          <input type="checkbox" checked={usePrevData} onChange={onTogglePrevData}
            className="accent-green-600" style={{ width: 14, height: 14 }} />
          Include historical baseline data (pre-Sep 2023)
        </label>
        {!canRetrain && (
          <p className="text-xs" style={{ color: '#999' }}>Inject data first</p>
        )}

        <div className="text-xs font-bold uppercase tracking-widest mb-2 pb-1 mt-3" style={{ color: '#999', borderBottom: '1px solid #e5e5e5' }}>
          Step 3 — Predict
        </div>
        <button onClick={onPredict} disabled={disabled || !canPredict}
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 font-bold text-sm uppercase tracking-wider transition-all disabled:opacity-30"
          style={{ backgroundColor: '#2563eb', color: '#fff', border: '2px solid #2563eb' }}
          onMouseEnter={e => { if (!disabled && canPredict) { e.currentTarget.style.backgroundColor = '#fff'; e.currentTarget.style.color = '#2563eb'; } }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#2563eb'; e.currentTarget.style.color = '#fff'; }}>
          {loadingAction === 'predict' ? <RefreshCw size={14} className="animate-spin" /> : <BarChart3 size={14} />}
          Predict All Categories
        </button>
        {!canPredict && (
          <p className="text-xs" style={{ color: '#999' }}>Inject data first</p>
        )}

        <div className="flex gap-2 pt-3" style={{ borderTop: '1px solid #e5e5e5' }}>
          <button onClick={onRefresh} disabled={disabled}
            className="flex items-center justify-center gap-2 flex-1 px-3 py-2 text-xs font-bold uppercase disabled:opacity-30"
            style={{ border: '1px solid #000', color: '#000' }}>
            <RefreshCw size={12} /> Refresh
          </button>
          <button onClick={onReset} disabled={disabled}
            className="flex items-center justify-center gap-2 flex-1 px-3 py-2 text-xs font-bold uppercase disabled:opacity-30"
            style={{ border: '2px solid #dc2626', color: '#dc2626', backgroundColor: '#fef2f2' }}>
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
    </div>
  );
}
