/**
 * PALANTIR-STYLE: Predictive Alerts API
 * AI-powered predictive analytics for business forecasting.
 * Generates actionable alerts based on pattern analysis.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { userId } = req.query;

    if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
    }

    try {
        const alerts = await generatePredictiveAlerts(userId);
        res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            alerts
        });
    } catch (error) {
        console.error('Predictive Alerts Error:', error);
        res.status(500).json({ error: 'Failed to generate predictive alerts' });
    }
}

async function generatePredictiveAlerts(userId) {
    const alerts = [];
    const now = new Date();

    // ═══════════════════════════════════════
    // FETCH DATA
    // ═══════════════════════════════════════

    // Last 30 days transactions
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: transactions } = await supabase
        .from('transactions')
        .select('*')
        .eq('owner_id', userId)
        .gte('datetime', thirtyDaysAgo.toISOString())
        .order('datetime', { ascending: false });

    // Low stock items
    const { data: stocks } = await supabase
        .from('supplies')
        .select('*')
        .eq('owner_id', userId);

    // Products
    const { data: products } = await supabase
        .from('products')
        .select('*')
        .eq('owner_id', userId);

    // ═══════════════════════════════════════
    // PREDICTION 1: Weekend Rush Forecast
    // ═══════════════════════════════════════
    const dayOfWeek = now.getDay();
    const isWeekendSoon = dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 4;

    if (isWeekendSoon) {
        // Analyze weekend patterns
        const weekendTxns = (transactions || []).filter(t => {
            const d = new Date(t.datetime);
            return d.getDay() === 0 || d.getDay() === 6;
        });
        const avgWeekendRevenue = weekendTxns.length > 0
            ? weekendTxns.reduce((sum, t) => sum + t.subtotal, 0) / Math.ceil(weekendTxns.length / 2)
            : 0;

        if (avgWeekendRevenue > 0) {
            alerts.push({
                id: 'weekend-forecast',
                type: 'forecast',
                severity: 'info',
                priority: 3,
                title: '📊 Weekend Rush Prediction',
                description: `Proyeksi pendapatan weekend: ${formatIDR(avgWeekendRevenue)}. Berdasarkan rata-rata 4 weekend terakhir.`,
                action: 'Pastikan stok bahan baku mencukupi!',
                confidence: 0.75,
                eta: getNextWeekend()
            });
        }
    }

    // ═══════════════════════════════════════
    // PREDICTION 2: Stock Depletion Warning
    // ═══════════════════════════════════════
    const lowStockItems = (stocks || []).filter(s => s.quantity <= s.min_stock_level * 1.5);

    for (const item of lowStockItems.slice(0, 3)) {
        // Calculate depletion rate (simplified)
        const daysToDeplete = item.quantity / (item.min_stock_level / 7);

        if (daysToDeplete < 5) {
            alerts.push({
                id: `stock-deplete-${item.id}`,
                type: 'warning',
                severity: 'warning',
                priority: 1,
                title: `⚠️ ${item.name} akan habis`,
                description: `Stok tersisa: ${item.quantity} ${item.unit}. Diperkirakan habis dalam ${Math.ceil(daysToDeplete)} hari.`,
                action: 'Segera order ulang ke supplier.',
                confidence: 0.85,
                eta: new Date(now.getTime() + daysToDeplete * 24 * 60 * 60 * 1000).toISOString()
            });
        }
    }

    // ═══════════════════════════════════════
    // PREDICTION 3: Revenue Trend Alert
    // ═══════════════════════════════════════
    if ((transactions || []).length >= 14) {
        const last7Days = transactions.filter(t =>
            new Date(t.datetime) > new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        );
        const prev7Days = transactions.filter(t => {
            const d = new Date(t.datetime);
            return d > new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) &&
                d <= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        });

        const last7Revenue = last7Days.reduce((sum, t) => sum + t.subtotal, 0);
        const prev7Revenue = prev7Days.reduce((sum, t) => sum + t.subtotal, 0);

        if (prev7Revenue > 0) {
            const changePercent = ((last7Revenue - prev7Revenue) / prev7Revenue) * 100;

            if (changePercent < -20) {
                alerts.push({
                    id: 'revenue-decline',
                    type: 'critical',
                    severity: 'critical',
                    priority: 0,
                    title: '🚨 Revenue Decline Detected',
                    description: `Pendapatan 7 hari terakhir turun ${Math.abs(changePercent).toFixed(1)}% dibanding minggu sebelumnya.`,
                    action: 'Pertimbangkan promo atau evaluasi menu.',
                    confidence: 0.9,
                    data: { change: changePercent, current: last7Revenue, previous: prev7Revenue }
                });
            } else if (changePercent > 30) {
                alerts.push({
                    id: 'revenue-surge',
                    type: 'opportunity',
                    severity: 'success',
                    priority: 2,
                    title: '📈 Revenue Surge!',
                    description: `Pendapatan naik ${changePercent.toFixed(1)}% dibanding minggu sebelumnya!`,
                    action: 'Pastikan supply chain siap menghadapi lonjakan demand.',
                    confidence: 0.9,
                    data: { change: changePercent, current: last7Revenue, previous: prev7Revenue }
                });
            }
        }
    }

    // ═══════════════════════════════════════
    // PREDICTION 4: Product Performance Alert
    // ═══════════════════════════════════════
    if ((transactions || []).length > 0) {
        const productSales = {};

        transactions.forEach(t => {
            const items = JSON.parse(t.items || '[]');
            items.forEach(item => {
                if (!productSales[item.product_id]) {
                    productSales[item.product_id] = { name: item.name, qty: 0, revenue: 0 };
                }
                productSales[item.product_id].qty += item.quantity;
                productSales[item.product_id].revenue += item.quantity * item.price;
            });
        });

        // Find underperforming products
        const productList = Object.entries(productSales);
        if (productList.length >= 5) {
            const avgQty = productList.reduce((sum, [, p]) => sum + p.qty, 0) / productList.length;
            const underperformers = productList
                .filter(([, p]) => p.qty < avgQty * 0.3)
                .map(([id, p]) => ({ id, ...p }));

            if (underperformers.length > 0) {
                alerts.push({
                    id: 'underperforming-products',
                    type: 'insight',
                    severity: 'info',
                    priority: 4,
                    title: '📉 Produk Tidak Laku',
                    description: `${underperformers.length} produk terjual jauh dibawah rata-rata: ${underperformers.slice(0, 3).map(p => p.name).join(', ')}`,
                    action: 'Pertimbangkan promo bundling atau evaluasi harga.',
                    confidence: 0.8,
                    data: { products: underperformers }
                });
            }
        }
    }

    // ═══════════════════════════════════════
    // PREDICTION 5: Payday Pattern
    // ═══════════════════════════════════════
    const dayOfMonth = now.getDate();
    if (dayOfMonth >= 23 && dayOfMonth <= 27) {
        alerts.push({
            id: 'payday-coming',
            type: 'opportunity',
            severity: 'success',
            priority: 2,
            title: '💰 Payday Opportunity',
            description: 'Gajian! Biasanya ada lonjakan pembelian premium.',
            action: 'Promote menu premium dan tambahan topping.',
            confidence: 0.7,
            eta: new Date(now.getFullYear(), now.getMonth(), 25).toISOString()
        });
    }

    // ═══════════════════════════════════════
    // PREDICTION 6: End of Month Alert
    // ═══════════════════════════════════════
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (dayOfMonth >= lastDayOfMonth - 3) {
        alerts.push({
            id: 'month-end',
            type: 'reminder',
            severity: 'info',
            priority: 5,
            title: '📅 Month-End Reminder',
            description: 'Akhir bulan segera. Waktu untuk closing dan laporan.',
            action: 'Review expenses, profit margins, dan inventory levels.',
            confidence: 1,
            eta: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
        });
    }

    // Sort by priority
    alerts.sort((a, b) => a.priority - b.priority);

    return alerts;
}

function formatIDR(amount) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(amount);
}

function getNextWeekend() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
    const nextSaturday = new Date(now);
    nextSaturday.setDate(now.getDate() + daysUntilSaturday);
    return nextSaturday.toISOString();
}
