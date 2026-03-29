import { useState, useCallback } from "react";
import MetricsCards from "./components/MetricsCards";
import MAEChart from "./components/MAEChart";
import PredictionChart from "./components/PredictionChart";
import InventoryTable from "./components/InventoryTable";
import DemoControls from "./components/DemoControls";
import PipelineActivity from "./components/PipelineActivity";
import PipelineDiagram from "./components/PipelineDiagram";
import StoreSelector from "./components/StoreSelector";
import StoryBanner from "./components/StoryBanner";
import HowItWorks from "./components/HowItWorks";
import { MAIN_SCENARIOS } from "./data/scenarios";
import {
	fetchMetrics,
	fetchLatestMetrics,
	fetchPredictions,
	fetchPrediction,
	fetchInventory,
	ingestBatch,
	triggerRetrain,
	resetDemo,
} from "./api/client";

export default function App() {
	const [storeId, setStoreId] = useState("S001");
	const [latestMetrics, setLatestMetrics] = useState(null);
	const [metricsHistory, setMetricsHistory] = useState([]);
	const [predictions, setPredictions] = useState([]); // per-category predictions from latest predict call
	const [predictTarget, setPredictTarget] = useState(""); // e.g. "October"
	const [inventory, setInventory] = useState([]);
	const [loadingAction, setLoadingAction] = useState(null);
	const [scenariosInjected, setScenariosInjected] = useState(0);
	const [injectedIds, setInjectedIds] = useState([]); // track which scenario ids have been injected
	const [usePrevData, setUsePrevData] = useState(false);

	// Pipeline activity state
	const [activeServices, setActiveServices] = useState([]);
	const [statusText, setStatusText] = useState("");

	const setActivity = useCallback((services, text) => {
		setActiveServices(services);
		setStatusText(text);
	}, []);

	const clearActivity = useCallback(() => {
		setTimeout(() => {
			setActiveServices([]);
			setStatusText("");
		}, 2000);
	}, []);

	const refreshDashboard = useCallback(
		async (silent = false) => {
			if (!silent)
				setActivity(
					["api", "lambda", "dynamodb"],
					"Refreshing dashboard...",
				);
			try {
				const [metricsRes, latestRes, invRes] =
					await Promise.allSettled([
						fetchMetrics(),
						fetchLatestMetrics(),
						fetchInventory(storeId),
					]);

				if (
					metricsRes.status === "fulfilled" &&
					metricsRes.value.metrics
				) {
					setMetricsHistory(metricsRes.value.metrics);
				}
				if (
					latestRes.status === "fulfilled" &&
					!latestRes.value.error
				) {
					setLatestMetrics(latestRes.value);
				}
				if (
					invRes.status === "fulfilled" &&
					invRes.value.latest_sales
				) {
					setInventory(invRes.value.latest_sales);
				}

				if (!silent) {
					setActivity(["amplify"], "Dashboard refreshed");
					clearActivity();
				}
			} catch (err) {
				setActivity([], `Refresh failed: ${err.message}`);
			}
		},
		[storeId, setActivity, clearActivity],
	);

	const handleInject = useCallback(
		async (scenario) => {
			setLoadingAction(`inject-${scenario.id}`);
			setActivity(["api"], `Loading ${scenario.label} data...`);

			try {
				const res = await fetch(scenario.file);
				const data = await res.json();
				const records = data.records;
				const total = records.length;
				setActivity(
					["api", "lambda"],
					`Sending ${total.toLocaleString()} records to AWS...`,
				);

				const chunkSize = 25;
				let ingested = 0;
				let lastPct = 0;
				for (let i = 0; i < total; i += chunkSize) {
					const chunk = records.slice(i, i + chunkSize);
					await ingestBatch(chunk);
					ingested += chunk.length;
					const pct = Math.floor((ingested / total) * 100);
					if (pct >= lastPct + 10) {
						setActivity(
							["api", "lambda", "dynamodb"],
							`Ingesting: ${ingested.toLocaleString()}/${total.toLocaleString()} (${pct}%)`,
						);
						lastPct = pct;
					}
				}

				setActivity(
					["dynamodb", "streams", "lambda"],
					`${ingested.toLocaleString()} records ingested. Feature engineering running...`,
				);
				setScenariosInjected((prev) => prev + 1);
				setInjectedIds((prev) =>
					prev.includes(scenario.id) ? prev : [...prev, scenario.id],
				);

				setTimeout(() => refreshDashboard(true), 3000);
				clearActivity();
			} catch (err) {
				setActivity([], `Ingest failed: ${err.message}`);
			} finally {
				setLoadingAction(null);
			}
		},
		[setActivity, clearActivity, refreshDashboard],
	);

	const handleRetrain = useCallback(async () => {
		setLoadingAction("retrain");
		setActivity(
			["dynamodb", "lambda"],
			usePrevData
				? "Loading baseline + DynamoDB data for retraining..."
				: "Scanning DynamoDB data for retraining...",
		);

		// Snapshot current model version so we can detect when a new one appears
		let prevVersion = latestMetrics?.model_version || null;

		try {
			setActivity(["lambda", "s3"], "Training model...");
			const result = await triggerRetrain(usePrevData);
			if (result.error) {
				setActivity([], `Retrain error: ${result.error}`);
			} else {
				const version = result.version || result.model_version || "?";
				const adaptiveMAE = result.adaptive_mae || result.MAE;
				const staticMAE = result.static_mae || result.Static_MAE;

				let msg = `Model ${version} deployed`;
				if (adaptiveMAE && staticMAE) {
					const improvement = (
						((staticMAE - adaptiveMAE) / staticMAE) *
						100
					).toFixed(1);
					msg += ` — Adaptive: ${Number(adaptiveMAE).toFixed(1)} | Static: ${Number(staticMAE).toFixed(1)} | ${improvement}% better`;
				}
				setActivity(["s3", "dynamodb"], msg);
			}

			await refreshDashboard(true);
			clearActivity();
			setLoadingAction(null);
		} catch (err) {
			// API Gateway has a 29s timeout — if the retrain takes longer (e.g. with
			// baseline data), we get a timeout error but the Lambda keeps running.
			// Poll /metrics/latest until a new model version shows up.
			const isTimeout =
				err.message.includes("timed out") ||
				err.message.includes("Endpoint request") ||
				err.message.includes("504") ||
				err.message.includes("Network error") ||
				err.message.includes("Failed to fetch");

			if (!isTimeout) {
				setActivity([], `Retrain failed: ${err.message}`);
				setLoadingAction(null);
				return;
			}

			setActivity(
				["lambda", "s3"],
				"Training in progress (large dataset)... waiting for completion",
			);

			// Poll every 5s for up to 5 minutes
			const maxAttempts = 60;
			for (let i = 0; i < maxAttempts; i++) {
				await new Promise((r) => setTimeout(r, 5000));
				try {
					const latest = await fetchLatestMetrics();
					const newVersion = latest?.model_version || null;
					if (newVersion && newVersion !== prevVersion) {
						const adaptiveMAE = latest.adaptive_mae;
						const staticMAE = latest.static_mae;
						let msg = `Model ${newVersion} deployed`;
						if (adaptiveMAE && staticMAE) {
							const improvement = (
								((staticMAE - adaptiveMAE) / staticMAE) *
								100
							).toFixed(1);
							msg += ` — Adaptive: ${Number(adaptiveMAE).toFixed(1)} | Static: ${Number(staticMAE).toFixed(1)} | ${improvement}% better`;
						}
						setActivity(["s3", "dynamodb"], msg);
						await refreshDashboard(true);
						clearActivity();
						setLoadingAction(null);
						return;
					}
					setActivity(
						["lambda", "s3"],
						`Training in progress... (${(i + 1) * 5}s elapsed)`,
					);
				} catch {
					// polling failed, keep trying
				}
			}

			setActivity(
				[],
				"Retrain is taking longer than expected. Try clicking Refresh.",
			);
			setLoadingAction(null);
		}
	}, [usePrevData, latestMetrics, setActivity, clearActivity, refreshDashboard]);

	const handlePredict = useCallback(async () => {
		setLoadingAction("predict");

		// Determine which month we're predicting for based on last injected scenario
		const lastInjected = MAIN_SCENARIOS.filter((s) =>
			injectedIds.includes(s.id),
		).pop();
		const target = lastInjected?.predictTarget || "Next Month";

		setActivity(
			["s3", "lambda"],
			`Predicting ${target} demand for ${storeId}...`,
		);

		try {
			const result = await fetchPrediction(storeId);

			if (result.error) {
				setActivity([], result.error);
			} else if (result.predictions) {
				setPredictions(result.predictions);
				setPredictTarget(target);

				const total = result.predictions.reduce(
					(s, p) => s + p.adaptive_units,
					0,
				);
				setActivity(
					["amplify"],
					`${target} forecast ready — ${result.predictions.length} categories, ~${Math.round(total)} total adaptive units`,
				);
			}
			await refreshDashboard(true);
			clearActivity();
		} catch (err) {
			setActivity([], `Prediction failed: ${err.message}`);
		} finally {
			setLoadingAction(null);
		}
	}, [
		storeId,
		injectedIds,
		setActivity,
		clearActivity,
		refreshDashboard,
	]);

	const handleReset = useCallback(async () => {
		if (!window.confirm("Reset all demo data?")) return;

		setLoadingAction("reset");
		setActivity(["dynamodb", "s3"], "Resetting...");

		try {
			const result = await resetDemo();
			const d = result.deleted || {};
			setActivity(
				[],
				`Cleared ${(d.sales || 0).toLocaleString()} sales, ${d.features || 0} features, ${d.metrics || 0} metrics`,
			);

			setLatestMetrics(null);
			setMetricsHistory([]);
			setPredictions([]);
			setPredictTarget("");
			setInventory([]);
			setScenariosInjected(0);
			setInjectedIds([]);
			clearActivity();
		} catch (err) {
			setActivity([], `Reset failed: ${err.message}`);
		} finally {
			setLoadingAction(null);
		}
	}, [setActivity, clearActivity]);

	const handleStoreChange = useCallback((newStoreId) => {
		setStoreId(newStoreId);
		setPredictions([]);
		setPredictTarget("");
		Promise.allSettled([
			fetchInventory(newStoreId).then(
				(r) => r.latest_sales && setInventory(r.latest_sales),
			),
		]);
	}, []);

	const disabled = loadingAction !== null;

	return (
		<div
			className='min-h-screen p-6 md:p-10 lg:p-12'
			style={{ backgroundColor: "#ffffff" }}
		>
			{/* Header */}
			<div
				className='flex flex-col md:flex-row items-start md:items-end justify-between mb-8 pb-4'
				style={{ borderBottom: "3px solid #000" }}
			>
				<div>
					<h1
						className='text-2xl md:text-4xl font-bold uppercase tracking-tight'
						style={{ color: "#000" }}
					>
						Concept Drift-Aware ML Pipeline
					</h1>
					<p
						className='text-sm uppercase tracking-widest mt-1'
						style={{ color: "#666" }}
					>
						CS6905 Cloud Information Systems // Smart Inventory
						Management
					</p>
				</div>
				<StoreSelector value={storeId} onChange={handleStoreChange} />
			</div>

			{/* Story Banner hidden for now due to text mismatch*/}
			{/* <StoryBanner metricsCount={metricsHistory.length} scenariosInjected={scenariosInjected} /> */}

			{/* Metrics Cards */}
			<div className='mb-8'>
				<MetricsCards data={latestMetrics} usePrevData={usePrevData} />
			</div>

			{/* Two column: main content + controls */}
			<div className='grid grid-cols-1 lg:grid-cols-4 gap-8 mb-8'>
				{/* Left: Charts (3/4) */}
				<div className='lg:col-span-3 space-y-8'>
					{/* MAE chart + Demand Forecast — two across */}
					<div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
						<MAEChart metrics={metricsHistory} />
						<PredictionChart
							predictions={predictions}
							predictTarget={predictTarget}
							storeId={storeId}
						/>
					</div>

					{/* Inventory + Forecast table */}
					<InventoryTable
						inventory={inventory}
						predictions={predictions}
						predictTarget={predictTarget}
						storeId={storeId}
					/>

					{/* Pipeline + How It Works side by side */}
					<div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
						<PipelineDiagram />
						<HowItWorks />
					</div>
				</div>

				{/* Right: Controls + Pipeline Activity (1/4) */}
				<div className='space-y-8'>
					<DemoControls
						onInject={handleInject}
						onRetrain={handleRetrain}
						onPredict={handlePredict}
						onRefresh={() => refreshDashboard()}
						onReset={handleReset}
						disabled={disabled}
						loadingAction={loadingAction}
						scenariosInjected={scenariosInjected}
						usePrevData={usePrevData}
						onTogglePrevData={() => setUsePrevData((p) => !p)}
					/>
					<PipelineActivity
						activeServices={activeServices}
						statusText={statusText}
					/>
				</div>
			</div>

			{/* Footer */}
			<div
				className='pt-4 mt-8'
				style={{ borderTop: "2px solid #000" }}
			>
				<p
					className='text-xs uppercase tracking-widest'
					style={{ color: "#999" }}
				>
					Fahim Faisal / Ali Rizvi / Refat Ishrak Hemel — Serverless
					AWS Architecture
				</p>
			</div>
		</div>
	);
}
