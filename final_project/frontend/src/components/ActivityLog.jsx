import { useRef, useEffect } from 'react';

const PREFIX = {
  success: '[OK]',
  error: '[ERR]',
  loading: '[...]',
  info: '[--]'
};

const COLORS = {
  success: '#16a34a',
  error: '#dc2626',
  loading: '#666',
  info: '#666'
};

export default function ActivityLog({ logs }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs.length]);

  return (
    <div className="p-4" style={{ border: '2px solid #000' }}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#999' }}>
          Activity Log
        </h4>
        {logs.length > 0 && (
          <span className="text-xs font-bold" style={{ color: '#999' }}>{logs.length}</span>
        )}
      </div>
      <div ref={containerRef} className="overflow-y-auto max-h-56 p-3 font-mono" style={{ backgroundColor: '#fafafa', border: '1px solid #e5e5e5' }}>
        {logs.length === 0 && (
          <p className="text-xs text-center py-4" style={{ color: '#ccc' }}>
            Waiting for actions...
          </p>
        )}
        {logs.map((log, i) => (
          <div key={i} className="text-xs py-0.5" style={{ color: COLORS[log.type] || '#666' }}>
            <span style={{ color: '#ccc' }}>{log.time}</span>{' '}
            <span style={{ color: COLORS[log.type] }}>{PREFIX[log.type] || '[--]'}</span>{' '}
            {log.message}
          </div>
        ))}
      </div>
    </div>
  );
}
