import { CATEGORY_COLORS } from "../data/scenarios";

function getStatus(inventory, unitsSold) {
	if (inventory < unitsSold)
		return { label: "RESTOCK", color: "#dc2626", bg: "#fef2f2" };
	if (inventory < unitsSold * 2)
		return { label: "LOW", color: "#d97706", bg: "#fffbeb" };
	return { label: "OK", color: "#16a34a", bg: "#f0fdf4" };
}

export default function InventoryTable({
	inventory,
	predictions,
	predictTarget,
	storeId,
}) {
	if (!inventory?.length) {
		return (
			<div className='p-6' style={{ border: "2px solid #000" }}>
				<h3 className='text-sm font-bold uppercase tracking-widest mb-1'>
					Inventory + Forecast
				</h3>
				<p className='text-xs mb-6' style={{ color: "#666" }}>
					Stock health and demand predictions for {storeId}
				</p>
				<div
					className='flex items-center justify-center h-32'
					style={{
						backgroundColor: "#fafafa",
						border: "1px dashed #ccc",
					}}
				>
					<p className='text-sm' style={{ color: "#999" }}>
						NO DATA
					</p>
				</div>
			</div>
		);
	}

	// Build prediction lookup by category
	const predMap = {};
	if (predictions?.length) {
		predictions.forEach((p) => {
			predMap[p.category] = p;
		});
	}

	// Aggregate inventory by category
	const categoryMap = {};
	inventory.forEach((item) => {
		const cat = item.category;
		if (!categoryMap[cat]) {
			categoryMap[cat] = {
				category: cat,
				total_sold: 0,
				total_stock: 0,
				total_price: 0,
				count: 0,
				min_stock: Infinity,
			};
		}
		categoryMap[cat].total_sold += item.units_sold;
		categoryMap[cat].total_stock += item.inventory_level;
		categoryMap[cat].total_price += item.price;
		categoryMap[cat].count += 1;
		categoryMap[cat].min_stock = Math.min(
			categoryMap[cat].min_stock,
			item.inventory_level,
		);
	});

	const categories = Object.values(categoryMap)
		.map((c) => ({
			...c,
			avg_price: c.total_price / c.count,
			avg_sold: Math.round(c.total_sold / c.count),
			status: getStatus(
				c.min_stock,
				Math.round(c.total_sold / c.count),
			),
		}))
		.sort((a, b) => b.total_sold - a.total_sold);

	const hasPredictions = Object.keys(predMap).length > 0;
	const hasActuals =
		hasPredictions &&
		Object.values(predMap).some((p) => p.actual_avg != null);
	const adaptiveWins = hasPredictions
		? Object.values(predMap).filter((p) => p.winner === "adaptive")
				.length
		: 0;
	const totalCats = hasPredictions ? Object.keys(predMap).length : 0;

	return (
		<div className='p-6' style={{ border: "2px solid #000" }}>
			<div className='flex items-start justify-between mb-4'>
				<div>
					<h3 className='text-sm font-bold uppercase tracking-widest mb-1'>
						Inventory + Forecast — {storeId}
					</h3>
					<p className='text-xs' style={{ color: "#666" }}>
						{hasPredictions
							? `Per-record predictions vs actual sales — ${predictions.reduce((s, p) => s + (p.record_count || 0), 0).toLocaleString()} records evaluated`
							: `${inventory.length} recent records across ${categories.length} categories`}
					</p>
				</div>
			</div>

			<div
				className='overflow-x-auto'
				style={{ border: "1px solid #000" }}
			>
				<table className='w-full text-xs'>
					<thead>
						<tr style={{ backgroundColor: "#000", color: "#fff" }}>
							<th className='py-2 px-3 text-left font-bold uppercase'>
								Category
							</th>
							{hasActuals && (
								<th
									className='py-2 px-3 text-right font-bold uppercase'
									style={{ backgroundColor: "#1e3a5f" }}
								>
									Actual Avg
								</th>
							)}
							{hasPredictions && (
								<>
									<th
										className='py-2 px-3 text-right font-bold uppercase'
										style={{ backgroundColor: "#7f1d1d" }}
									>
										Static (v1)
									</th>
									<th
										className='py-2 px-3 text-right font-bold uppercase'
										style={{ backgroundColor: "#14532d" }}
									>
										Adaptive
									</th>
								</>
							)}
							{hasActuals && (
								<>
									<th className='py-2 px-3 text-right font-bold uppercase'>
										S_MAE
									</th>
									<th className='py-2 px-3 text-right font-bold uppercase'>
										A_MAE
									</th>
									<th className='py-2 px-3 text-center font-bold uppercase'>
										Closer
									</th>
								</>
							)}
							<th className='py-2 px-3 text-left font-bold uppercase'>
								Status
							</th>
						</tr>
					</thead>
					<tbody>
						{categories.map((cat, i) => {
							const catColor =
								CATEGORY_COLORS[cat.category] || "#000";
							const pred = predMap[cat.category];
							const isAdaptiveWinner =
								pred?.winner === "adaptive";
							return (
								<tr
									key={i}
									style={{ borderBottom: "1px solid #e5e5e5" }}
								>
									<td className='py-2.5 px-3'>
										<div className='flex items-center gap-2'>
											<div
												className='w-2.5 h-2.5 flex-shrink-0'
												style={{ backgroundColor: catColor }}
											/>
											<span
												className='font-bold'
												style={{ color: catColor }}
											>
												{cat.category}
											</span>
											{pred?.record_count && (
												<span
													className='text-xs'
													style={{ color: "#999" }}
												>
													({pred.record_count})
												</span>
											)}
										</div>
									</td>
									{hasActuals && (
										<td
											className='py-2.5 px-3 text-right font-bold'
											style={{
												color: "#2563eb",
												backgroundColor: "#eff6ff",
											}}
										>
											{pred?.actual_avg != null
												? `~${pred.actual_avg.toFixed(0)}`
												: "--"}
										</td>
									)}
									{hasPredictions && (
										<>
											<td
												className='py-2.5 px-3 text-right font-bold'
												style={{
													color: "#dc2626",
													backgroundColor: "#fef2f2",
												}}
											>
												{pred
													? `~${pred.static_units.toFixed(0)}`
													: "--"}
											</td>
											<td
												className='py-2.5 px-3 text-right font-bold'
												style={{
													color: "#16a34a",
													backgroundColor: "#f0fdf4",
												}}
											>
												{pred
													? `~${pred.adaptive_units.toFixed(0)}`
													: "--"}
											</td>
										</>
									)}
									{hasActuals && (
										<>
											<td
												className='py-2.5 px-3 text-right'
												style={{ color: "#dc2626" }}
											>
												{pred?.static_mae != null
													? pred.static_mae.toFixed(1)
													: "--"}
											</td>
											<td
												className='py-2.5 px-3 text-right'
												style={{ color: "#16a34a" }}
											>
												{pred?.adaptive_mae != null
													? pred.adaptive_mae.toFixed(1)
													: "--"}
											</td>
											<td className='py-2.5 px-3 text-center'>
												{pred?.winner && (
													<span
														className='text-xs font-bold px-2 py-0.5 inline-block'
														style={{
															backgroundColor: isAdaptiveWinner
																? "#f0fdf4"
																: "#fef2f2",
															color: isAdaptiveWinner
																? "#16a34a"
																: "#dc2626",
															border: `1px solid ${isAdaptiveWinner ? "#16a34a" : "#dc2626"}`,
														}}
													>
														{isAdaptiveWinner ? "ADAPTIVE" : "STATIC"}
													</span>
												)}
											</td>
										</>
									)}
									<td className='py-2.5 px-3'>
										<span
											className='text-xs font-bold px-2 py-0.5 inline-block'
											style={{
												backgroundColor: cat.status.bg,
												color: cat.status.color,
												border: `1px solid ${cat.status.color}`,
											}}
										>
											{cat.status.label}
										</span>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			{hasActuals && (
				<div
					className='mt-3 p-3 text-xs'
					style={{
						backgroundColor: "#f0fdf4",
						border: "1px solid #16a34a",
					}}
				>
					<strong>
						Adaptive model wins {adaptiveWins}/{totalCats} categories.
					</strong>{" "}
					Predictions are per-record averages compared against actual
					sales data. <strong>MAE</strong> = Mean Absolute Error
					(lower is better).
				</div>
			)}

			{hasPredictions && !hasActuals && (
				<div
					className='mt-3 p-3 text-xs'
					style={{
						backgroundColor: "#eff6ff",
						border: "1px solid #2563eb",
					}}
				>
					<strong>Static (v1)</strong> was trained once on
					pre-September data and never updated.
					<strong> Adaptive</strong> retrains on all data including
					recent months.
				</div>
			)}
		</div>
	);
}
