const STORY_STAGES = [
	{
		id: "empty",
		label: "00",
		title: "START HERE",
		subtitle: 'Click "1. September data Sales" to begin the demo.',
		detail:
			"We built an AI that predicts store inventory demand. Shopping patterns change constantly — September looks nothing like December. Most AI models are trained once and degrade over time. Ours retrains automatically.",
		next: "Inject September sales data to begin",
	},
	{
		id: "baseline",
		label: "01",
		title: "BASELINE SET",
		subtitle:
			'September data loaded. Click "Retrain Model" to train the AI.',
		detail:
			"3,000 sales records loaded. The AI will learn fall shopping patterns — steady electronics, normal grocery demand. Both models start equal since the data hasn't shifted yet.",
		next: "Retrain, then inject more data",
	},
	{
		id: "drift_starting",
		label: "02",
		title: "DRIFT DETECTED",
		subtitle:
			"Weather changing, buying habits shifting. Retrain to see who adapts.",
		detail:
			"October/November data is in. Warm clothing up, holiday groceries up, early gift shopping. The static model still thinks it's September. Retrain the adaptive model and watch the MAE chart diverge.",
		next: "Keep injecting and retraining",
	},
	{
		id: "drift_clear",
		label: "03",
		title: "GAP WIDENING",
		subtitle: "Black Friday patterns are breaking the static model.",
		detail:
			"The MAE chart tells the story: red line (static error) climbing, green line (adaptive) staying low. The static model was frozen in September. We're in November now with completely different demand patterns.",
		next: "Inject Christmas data for final proof",
	},
	{
		id: "drift_severe",
		label: "04",
		title: "PROVEN",
		subtitle: "Adaptive retraining outperforms static models.",
		detail:
			"A model trained once in September has zero understanding of Christmas shopping. The adaptive model retrains on each batch and stays accurate. In production, this means correct inventory orders instead of guessing.",
		next: "Try the what-if scenarios for bonus demos",
	},
];

export default function StoryBanner({
	metricsCount,
	scenariosInjected,
}) {
	let stageId = "empty";
	if (scenariosInjected >= 4) stageId = "drift_severe";
	else if (scenariosInjected >= 3) stageId = "drift_clear";
	else if (scenariosInjected >= 2) stageId = "drift_starting";
	else if (scenariosInjected >= 1 || metricsCount >= 1)
		stageId = "baseline";

	const stage = STORY_STAGES.find((s) => s.id === stageId);
	const stageIndex = STORY_STAGES.findIndex((s) => s.id === stageId);

	return (
		<div
			className='mb-8 p-6'
			style={{
				border: "2px solid #000",
				backgroundColor:
					stageIndex >= 4
						? "#fef2f2"
						: stageIndex >= 2
							? "#fffbeb"
							: stageIndex >= 1
								? "#f0fdf4"
								: "#fafafa",
			}}
		>
			<div className='flex items-start gap-6'>
				<div
					className='text-4xl font-bold'
					style={{ color: "#ccc", lineHeight: 1 }}
				>
					{stage.label}
				</div>
				<div className='flex-1'>
					<h2 className='text-lg font-bold uppercase tracking-wider mb-1'>
						{stage.title}
					</h2>
					<p
						className='text-sm font-bold mb-2'
						style={{ color: "#333" }}
					>
						{stage.subtitle}
					</p>
					<p className='text-xs mb-3' style={{ color: "#666" }}>
						{stage.detail}
					</p>
					<p
						className='text-xs font-bold uppercase'
						style={{ color: "#999" }}
					>
						Next: {stage.next}
					</p>
				</div>
			</div>

			{/* Progress */}
			<div className='flex gap-1 mt-4'>
				{STORY_STAGES.map((s, i) => (
					<div
						key={s.id}
						className='h-1 flex-1'
						style={{
							backgroundColor: i <= stageIndex ? "#000" : "#e5e5e5",
						}}
					/>
				))}
			</div>
			<div className='flex justify-between mt-1'>
				{["Start", "Baseline", "Drift", "Gap", "Proven"].map(
					(label, i) => (
						<span
							key={label}
							className='text-xs font-bold'
							style={{ color: i <= stageIndex ? "#000" : "#ccc" }}
						>
							{label}
						</span>
					),
				)}
			</div>
		</div>
	);
}
