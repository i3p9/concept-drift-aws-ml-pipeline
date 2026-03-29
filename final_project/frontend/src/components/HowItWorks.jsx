import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const sections = [
  {
    color: '#dc2626',
    question: 'What problem are we solving?',
    answer: `Imagine you train an AI to predict how many phone chargers a store will sell. You train it using summer data — people buy chargers for vacations.

But then Christmas comes. Now people are buying chargers as gifts, in much larger quantities, along with completely different products. Your AI has no idea about Christmas shopping patterns because it only learned from summer data.

This is called **concept drift** — when real-world patterns change but your AI model is stuck in the past. Most companies just keep using their old model and don't realize their predictions are getting worse.`
  },
  {
    color: '#16a34a',
    question: 'How does our system fix this?',
    answer: `Our system has two models running side by side:

**The static model (red line on chart):** Trained once on initial data and never updated. This is how most companies operate. It degrades as patterns change.

**The adaptive model (green line on chart):** Retrains every time new data comes in. It learns from September data, then October, then November — always incorporating the latest patterns.

The chart shows prediction error (MAE) of both. Lower is better. As you inject more data and retrain, the adaptive model stays accurate while the static model falls behind.`
  },
  {
    color: '#2563eb',
    question: 'What does the demand forecast show?',
    answer: `Every store needs to know: "How many products should I order next week?"

Order too many — money wasted on unsold inventory. Order too few — customers leave empty-handed.

The AI looks at a store's patterns: what categories sell most, weather conditions, holiday effects, recent trends. It combines these into a demand prediction.

The prediction changes as patterns change. If a store shifts from high-volume Electronics to lower-volume Clothing, the prediction drops. This isn't an error — it's the model correctly reflecting the new product mix.

**Check the MAE chart for accuracy, not the prediction number.** That's the real proof.`
  },
  {
    color: '#d97706',
    question: 'What is MAE?',
    answer: `**MAE = Mean Absolute Error.** How wrong are the predictions on average.

If the AI predicts 100 units but the store sells 120, the error is 20. Average that across thousands of predictions — that's the MAE.

**MAE of 80** = predictions are off by ~80 units on average (bad)
**MAE of 50** = predictions are off by ~50 units on average (much better)

Green line dropping = adaptive model getting more accurate. Red line staying high = static model stuck making bad predictions.`
  },
  {
    color: '#7c3aed',
    question: 'What happens when I click the buttons?',
    answer: `**1. Inject Data** — Sends thousands of sales records to AWS. Each record has a store, product, category, units sold, weather, price. Simulates real sales arriving.

**2. Feature Engineering (automatic)** — AWS detects new data via DynamoDB Streams and calculates patterns: rolling averages, lag features, seasonal trends. No button needed.

**3. Retrain Model** — Trains a Random Forest + Linear Regression ensemble on ALL data so far. Compares against the static model.

**4. Dashboard Updates** — MAE chart adds a new point. Metric cards update. You see the adaptive model improving.

**5. Get Prediction** — Asks the model: "What will this store sell next?" Shows the answer.`
  }
];

export default function HowItWorks() {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <div className="p-6" style={{ border: '2px solid #000' }}>
      <h3 className="text-sm font-bold uppercase tracking-widest mb-1">How It Works</h3>
      <p className="text-xs mb-4" style={{ color: '#666' }}>Click a question to expand</p>

      <div className="space-y-0">
        {sections.map((section, i) => {
          const isOpen = openIndex === i;
          return (
            <div key={i} style={{ borderBottom: i < sections.length - 1 ? '1px solid #e5e5e5' : 'none' }}>
              <button
                onClick={() => setOpenIndex(isOpen ? null : i)}
                className="w-full flex items-center gap-3 py-3 text-left"
              >
                <div className="w-1 h-6 flex-shrink-0" style={{ backgroundColor: section.color }} />
                <span className="text-xs font-bold flex-1">{section.question}</span>
                {isOpen ? <ChevronUp size={14} color="#999" /> : <ChevronDown size={14} color="#999" />}
              </button>

              {isOpen && (
                <div className="pb-4 pl-7">
                  {section.answer.split('\n\n').map((paragraph, j) => (
                    <p key={j} className="text-xs leading-relaxed mb-2" style={{ color: '#444' }}
                       dangerouslySetInnerHTML={{
                         __html: paragraph
                           .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #000">$1</strong>')
                           .replace(/\n/g, '<br/>')
                       }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
