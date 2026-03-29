import { useState, useEffect, useRef } from 'react';

const SERVICES = [
  { id: 'api', label: 'API Gateway', img: 'https://d2908q01vomqb2.cloudfront.net/da4b9237bacccdf19c0760cab7aec4a8359010b0/2021/08/17/Amazon-API-Gateway.png' },
  { id: 'lambda', label: 'Lambda', img: 'https://d2908q01vomqb2.cloudfront.net/da4b9237bacccdf19c0760cab7aec4a8359010b0/2021/08/17/AWS-Lambda.png' },
  { id: 'dynamodb', label: 'DynamoDB', img: 'https://d2908q01vomqb2.cloudfront.net/da4b9237bacccdf19c0760cab7aec4a8359010b0/2021/08/17/Amazon-DynamoDB.png' },
  { id: 'streams', label: 'Streams', img: 'https://d2908q01vomqb2.cloudfront.net/da4b9237bacccdf19c0760cab7aec4a8359010b0/2021/08/17/Amazon-DynamoDB.png' },
  { id: 's3', label: 'S3', img: 'https://d2908q01vomqb2.cloudfront.net/da4b9237bacccdf19c0760cab7aec4a8359010b0/2021/08/17/Amazon-S3.png' },
  { id: 'amplify', label: 'Amplify', img: 'https://d2908q01vomqb2.cloudfront.net/da4b9237bacccdf19c0760cab7aec4a8359010b0/2021/08/17/AWS-Amplify.png' },
];

// Fallback: use text-based icons if images fail to load
const FALLBACK = {
  api: 'GW', lambda: 'fn', dynamodb: 'DB', streams: 'ST', s3: 'S3', amplify: 'WEB'
};

const COLORS = {
  api: '#7c3aed', lambda: '#d97706', dynamodb: '#2563eb',
  streams: '#0891b2', s3: '#16a34a', amplify: '#db2777'
};

export default function PipelineActivity({ activeServices, statusText }) {
  const [imgFailed, setImgFailed] = useState({});

  return (
    <div className="p-4" style={{ border: '2px solid #000' }}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#999' }}>
          Pipeline Activity
        </h4>
      </div>

      {/* Service icons */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {SERVICES.map(svc => {
          const isActive = activeServices?.includes(svc.id);
          const color = COLORS[svc.id];
          return (
            <div
              key={svc.id}
              className="flex flex-col items-center p-2 transition-all"
              style={{
                border: isActive ? `2px solid ${color}` : '1px solid #e5e5e5',
                backgroundColor: isActive ? `${color}10` : '#fafafa',
                opacity: isActive ? 1 : 0.4,
              }}
            >
              {imgFailed[svc.id] ? (
                <div className="w-8 h-8 flex items-center justify-center text-xs font-bold mb-1"
                     style={{ color, backgroundColor: `${color}15`, border: `1px solid ${color}` }}>
                  {FALLBACK[svc.id]}
                </div>
              ) : (
                <img
                  src={svc.img}
                  alt={svc.label}
                  className="w-8 h-8 mb-1 object-contain"
                  onError={() => setImgFailed(p => ({ ...p, [svc.id]: true }))}
                  style={{ filter: isActive ? 'none' : 'grayscale(100%)' }}
                />
              )}
              <span className="text-xs font-bold" style={{ color: isActive ? color : '#999', fontSize: 9 }}>
                {svc.label}
              </span>
              {isActive && (
                <div className="w-1.5 h-1.5 mt-1 rounded-full animate-pulse" style={{ backgroundColor: color }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Status text */}
      <div className="p-2 font-mono text-xs" style={{ backgroundColor: '#fafafa', border: '1px solid #e5e5e5', minHeight: 32 }}>
        {statusText ? (
          <span style={{ color: '#000' }}>{statusText}</span>
        ) : (
          <span style={{ color: '#ccc' }}>Idle — waiting for actions...</span>
        )}
      </div>
    </div>
  );
}
