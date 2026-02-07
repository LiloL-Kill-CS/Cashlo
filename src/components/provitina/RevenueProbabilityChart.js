import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

export default function RevenueProbabilityChart({ prediction }) {
    const mean = prediction.predicted_revenue.mid;
    const sigma = (prediction.predicted_revenue.high - prediction.predicted_revenue.low) / 4; // Approx standard deviation

    // Generate data points for Gaussian distribution
    const labels = [];
    const dataPoints = [];

    // Create range from -3 sigma to +3 sigma
    for (let i = -30; i <= 30; i++) {
        const x = mean + (i / 10) * sigma;
        // Gaussian function
        const y = (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - mean) / sigma, 2));

        labels.push((x / 1000000).toFixed(1) + 'M'); // Format as millions
        dataPoints.push(y);
    }

    const data = {
        labels: labels,
        datasets: [
            {
                label: 'Probability Density',
                data: dataPoints,
                borderColor: '#0EA5E9',
                backgroundColor: (context) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
                    gradient.addColorStop(0, 'rgba(14, 165, 233, 0.5)');
                    gradient.addColorStop(1, 'rgba(14, 165, 233, 0.0)');
                    return gradient;
                },
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 6,
            }
        ]
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                mode: 'index',
                intersect: false,
                callbacks: {
                    label: function (context) {
                        return 'Probability Density: ' + (context.raw * 1000000).toFixed(4); // Arbitrary scaling for tooltip
                    }
                }
            },
            annotation: {
                // Annotations would act as vertical lines for VaR etc. (requires plugin), simplified for now
            }
        },
        scales: {
            x: {
                grid: {
                    display: false,
                    drawBorder: false
                },
                ticks: {
                    color: '#64748B',
                    maxTicksLimit: 8,
                    callback: function (val, index) {
                        return this.getLabelForValue(val);
                    }
                },
                title: {
                    display: true,
                    text: 'Revenue Potential (Millions IDR)',
                    color: '#94A3B8',
                    font: { size: 10 }
                }
            },
            y: {
                display: false // Hide y-axis for cleaner look
            }
        },
        interaction: {
            mode: 'nearest',
            axis: 'x',
            intersect: false
        }
    };

    return (
        <div style={{ position: 'relative', height: '100%', width: '100%' }}>
            <Line data={data} options={options} />

            {/* Overlay Stats */}
            <div style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                background: 'rgba(255,255,255,0.9)',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                fontSize: '11px',
                color: '#0F172A',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
            }}>
                <div><strong>σ (Sigma):</strong> Rp {(sigma / 1000).toFixed(0)}k</div>
                <div><strong>Peak Prob:</strong> {(mean / 1000000).toFixed(2)}M</div>
            </div>
        </div>
    );
}
