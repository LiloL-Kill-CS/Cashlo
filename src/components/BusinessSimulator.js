import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/db';

export default function BusinessSimulator({ currentRevenue, currentProfit, currentExpenses }) {
    const [scenarios, setScenarios] = useState({
        trafficGrowth: 0, // Percentage -50 to +50
        priceIncrease: 0, // Percentage 0 to +50
        costReduction: 0  // Percentage 0 to +50
    });

    const [projection, setProjection] = useState({
        revenue: 0,
        profit: 0,
        margin: 0
    });

    useEffect(() => {
        calculateProjection();
    }, [scenarios, currentRevenue, currentProfit, currentExpenses]);

    const calculateProjection = () => {
        // 1. Traffic Impact (Linear impact on Revenue and COGS)
        const trafficMultiplier = 1 + (scenarios.trafficGrowth / 100);

        // 2. Price Impact (Impacts Revenue only, assumes -0.5 elasticity usually, but kept simple here)
        // Simple Model: Revenue * PriceIncrease
        const priceMultiplier = 1 + (scenarios.priceIncrease / 100);

        // Base Cogs (Approximate)
        const currentCOGS = currentRevenue - currentProfit; // Gross Profit = Rev - COGS
        const projectedCOGS = currentCOGS * trafficMultiplier * (1 - (scenarios.costReduction / 100));

        // Projected Revenue
        // (Base Revenue * Traffic) * Price
        const projectedRevenue = (currentRevenue * trafficMultiplier) * priceMultiplier;

        // Projected Gross Profit
        const projectedProfit = projectedRevenue - projectedCOGS;

        // Projected Net (considering fixed expenses don't change with traffic typically, unless variablized)
        // We'll focus on Gross Profit for this high-level sim

        setProjection({
            revenue: projectedRevenue,
            profit: projectedProfit,
            diffRevenue: projectedRevenue - currentRevenue,
            diffProfit: projectedProfit - currentProfit
        });
    };

    return (
        <div className="card">
            <header className="card-header mb-md">
                <h3 className="text-lg font-bold flex items-center gap-sm">
                    🔮 Business Scenario Simulator (What-If)
                </h3>
                <p className="text-sm text-secondary">
                    Palantir-style Decision Modeling: Simulate changes to forecast outcomes.
                </p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
                {/* Controls */}
                <div className="space-y-md">
                    <div>
                        <div className="flex justify-between mb-xs">
                            <label className="text-sm font-bold">📢 Pertumbuhan Pelanggan (Traffic)</label>
                            <span className="badge badge-primary">{scenarios.trafficGrowth > 0 ? '+' : ''}{scenarios.trafficGrowth}%</span>
                        </div>
                        <input
                            type="range" min="-50" max="50" step="5"
                            value={scenarios.trafficGrowth}
                            onChange={(e) => setScenarios({ ...scenarios, trafficGrowth: Number(e.target.value) })}
                            className="w-full accent-primary"
                        />
                        <p className="text-xs text-secondary">Simulasi kenaikan/penurunan jumlah pengunjung.</p>
                    </div>

                    <div>
                        <div className="flex justify-between mb-xs">
                            <label className="text-sm font-bold">💰 Kenaikan Harga Jual</label>
                            <span className="badge badge-warning">{scenarios.priceIncrease > 0 ? '+' : ''}{scenarios.priceIncrease}%</span>
                        </div>
                        <input
                            type="range" min="0" max="50" step="5"
                            value={scenarios.priceIncrease}
                            onChange={(e) => setScenarios({ ...scenarios, priceIncrease: Number(e.target.value) })}
                            className="w-full accent-warning"
                        />
                        <p className="text-xs text-secondary">Simulasi menaikkan harga rata-rata produk.</p>
                    </div>

                    <div>
                        <div className="flex justify-between mb-xs">
                            <label className="text-sm font-bold">📉 Efisiensi Biaya (Cost Reduction)</label>
                            <span className="badge badge-success">{scenarios.costReduction > 0 ? '-' : ''}{scenarios.costReduction}%</span>
                        </div>
                        <input
                            type="range" min="0" max="30" step="1"
                            value={scenarios.costReduction}
                            onChange={(e) => setScenarios({ ...scenarios, costReduction: Number(e.target.value) })}
                            className="w-full accent-success"
                        />
                        <p className="text-xs text-secondary">Simulasi negosiasi supplier atau hemat bahan baku.</p>
                    </div>
                </div>

                {/* Results Visualization */}
                <div style={{ background: 'var(--color-bg-secondary)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <h4 className="font-bold text-center mb-lg">PROJECTED OUTCOME</h4>

                    <div className="grid grid-cols-2 gap-md mb-md">
                        <div className="text-center p-sm" style={{ background: 'var(--color-bg-primary)', borderRadius: '8px' }}>
                            <div className="text-xs text-secondary">Projected Revenue</div>
                            <div className="font-bold text-lg">{formatCurrency(projection.revenue)}</div>
                            <div className={`text-xs ${projection.diffRevenue >= 0 ? 'text-success' : 'text-error'}`}>
                                {projection.diffRevenue >= 0 ? '+' : ''}{formatCurrency(projection.diffRevenue)}
                            </div>
                        </div>

                        <div className="text-center p-sm" style={{ background: 'var(--color-bg-primary)', borderRadius: '8px', border: '1px solid var(--color-primary)' }}>
                            <div className="text-xs text-secondary">Projected Profit</div>
                            <div className="font-bold text-lg" style={{ color: 'var(--color-primary)' }}>{formatCurrency(projection.profit)}</div>
                            <div className={`text-xs ${projection.diffProfit >= 0 ? 'text-success' : 'text-error'}`}>
                                {projection.diffProfit >= 0 ? '+' : ''}{formatCurrency(projection.diffProfit)}
                            </div>
                        </div>
                    </div>

                    <div className="text-xs text-center text-secondary italic">
                        *Estimasi berdasarkan data bulan berjalan. Elastisitas harga dianggap statis.
                    </div>
                </div>
            </div>
        </div>
    );
}
