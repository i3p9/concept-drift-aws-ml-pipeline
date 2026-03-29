import { ShoppingBag, Database, Cpu, Brain, HardDrive, BarChart3, ArrowRight } from 'lucide-react';

const steps = [
  { icon: ShoppingBag, color: '#7c3aed', label: 'INGEST', aws: 'API Gateway + Lambda', detail: 'Sales records arrive' },
  { icon: Database, color: '#2563eb', label: 'STORE', aws: 'DynamoDB', detail: 'Saved to cloud DB' },
  { icon: Cpu, color: '#d97706', label: 'FEATURES', aws: 'Lambda (auto)', detail: 'Compute patterns' },
  { icon: Brain, color: '#db2777', label: 'RETRAIN', aws: 'Lambda + EventBridge', detail: 'Learn from all data' },
  { icon: HardDrive, color: '#16a34a', label: 'SAVE', aws: 'S3 Bucket', detail: 'Version new model' },
  { icon: BarChart3, color: '#0891b2', label: 'PREDICT', aws: 'Lambda', detail: 'Serve predictions' },
];

export default function PipelineDiagram() {
  return (
    <div className="p-6" style={{ border: '2px solid #000' }}>
      <h3 className="text-sm font-bold uppercase tracking-widest mb-1">Pipeline Architecture</h3>
      <p className="text-xs mb-4" style={{ color: '#666' }}>Fully serverless on AWS — zero servers to manage</p>

      {/* Desktop */}
      <div className="hidden md:flex items-start justify-between gap-1">
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <div key={i} className="flex items-start gap-1 flex-1">
              <div className="flex flex-col items-center text-center min-w-0 flex-1">
                <div className="w-12 h-12 flex items-center justify-center mb-2"
                     style={{ border: `2px solid ${step.color}`, backgroundColor: `${step.color}08` }}>
                  <Icon size={20} color={step.color} />
                </div>
                <p className="text-xs font-bold" style={{ color: step.color }}>{step.label}</p>
                <p className="text-xs mt-0.5" style={{ color: '#666' }}>{step.detail}</p>
                <p className="text-xs mt-1 px-1" style={{ color: '#999', fontSize: 9 }}>{step.aws}</p>
              </div>
              {i < steps.length - 1 && (
                <div className="flex items-center pt-5 flex-shrink-0">
                  <ArrowRight size={14} color="#ccc" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile */}
      <div className="md:hidden space-y-2">
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <div key={i}>
              <div className="flex items-center gap-3 p-3" style={{ border: `1px solid ${step.color}` }}>
                <Icon size={18} color={step.color} className="flex-shrink-0" />
                <div>
                  <span className="text-xs font-bold" style={{ color: step.color }}>{step.label}</span>
                  <span className="text-xs ml-2" style={{ color: '#666' }}>{step.detail}</span>
                </div>
              </div>
              {i < steps.length - 1 && (
                <div className="flex justify-center py-0.5">
                  <ArrowRight size={12} color="#ccc" className="rotate-90" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 p-3 text-xs" style={{ backgroundColor: '#fffbeb', border: '1px solid #d97706' }}>
        <strong>Steps 3-5 are automatic.</strong> When new sales arrive, DynamoDB Streams trigger feature engineering, and EventBridge schedules retraining. No human intervention required.
      </div>
    </div>
  );
}
