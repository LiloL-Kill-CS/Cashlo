import { createClient } from '@supabase/supabase-js';

// Initialize Supabase for server-side
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { message, userId } = req.body;

    if (!message || !userId) {
        return res.status(400).json({ error: 'Message and userId required' });
    }

    try {
        // Fetch business data for context
        const businessContext = await getBusinessContext(userId);

        // Build prompt with business context
        const systemPrompt = buildSystemPrompt(businessContext);

        // Call Hugging Face API (FREE)
        const aiResponse = await callHuggingFaceAPI(systemPrompt, message);

        return res.status(200).json({ response: aiResponse });
    } catch (error) {
        console.error('AI Chat Error:', error);
        return res.status(500).json({ error: error.message || 'AI service error' });
    }
}

async function getBusinessContext(userId) {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
    const now = new Date().toISOString();

    // Get today's transactions
    const { data: todayTxns } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .gte('datetime', startOfDay)
        .neq('status', 'voided');

    // Get this month's transactions
    const { data: monthTxns } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .gte('datetime', startOfMonth)
        .neq('status', 'voided');

    // Get products
    const { data: products } = await supabase
        .from('products')
        .select('*')
        .eq('owner_id', userId)
        .eq('is_active', true);

    // Get low stock items
    const { data: stocks } = await supabase
        .from('product_stocks')
        .select('*, products(name)')
        .lte('quantity', 10);

    // Get expenses this month
    const { data: expenses } = await supabase
        .from('expenses')
        .select('*')
        .eq('owner_id', userId)
        .gte('date', startOfMonth.split('T')[0]);

    // Calculate stats
    const todayRevenue = todayTxns?.reduce((sum, t) => sum + (t.subtotal || 0), 0) || 0;
    const todayProfit = todayTxns?.reduce((sum, t) => sum + (t.total_profit || 0), 0) || 0;
    const todayCount = todayTxns?.length || 0;

    const monthRevenue = monthTxns?.reduce((sum, t) => sum + (t.subtotal || 0), 0) || 0;
    const monthProfit = monthTxns?.reduce((sum, t) => sum + (t.total_profit || 0), 0) || 0;
    const monthCount = monthTxns?.length || 0;
    const monthExpenses = expenses?.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0) || 0;

    // Top products analysis
    const productSales = {};
    monthTxns?.forEach(txn => {
        try {
            const items = JSON.parse(txn.items || '[]');
            items.forEach(item => {
                if (!productSales[item.name]) {
                    productSales[item.name] = { qty: 0, revenue: 0 };
                }
                productSales[item.name].qty += item.qty || 0;
                productSales[item.name].revenue += item.total_sell || 0;
            });
        } catch (e) { }
    });

    const topProducts = Object.entries(productSales)
        .sort((a, b) => b[1].qty - a[1].qty)
        .slice(0, 5)
        .map(([name, data]) => `${name}: ${data.qty} terjual (Rp ${data.revenue.toLocaleString('id-ID')})`);

    const lowStockList = stocks?.slice(0, 5).map(s => `${s.products?.name}: ${s.quantity} unit`) || [];

    return {
        todayRevenue,
        todayProfit,
        todayCount,
        monthRevenue,
        monthProfit,
        monthCount,
        monthExpenses,
        netProfit: monthProfit - monthExpenses,
        totalProducts: products?.length || 0,
        topProducts,
        lowStockList
    };
}

function buildSystemPrompt(ctx) {
    return `Kamu adalah AI Business Assistant untuk aplikasi POS "Cashlo". Jawab dalam Bahasa Indonesia yang ramah dan profesional.

DATA BISNIS SAAT INI:
- Hari Ini: ${ctx.todayCount} transaksi, Omzet Rp ${ctx.todayRevenue.toLocaleString('id-ID')}, Profit Rp ${ctx.todayProfit.toLocaleString('id-ID')}
- Bulan Ini: ${ctx.monthCount} transaksi, Omzet Rp ${ctx.monthRevenue.toLocaleString('id-ID')}, Gross Profit Rp ${ctx.monthProfit.toLocaleString('id-ID')}
- Pengeluaran Bulan Ini: Rp ${ctx.monthExpenses.toLocaleString('id-ID')}
- Net Profit Bulan Ini: Rp ${ctx.netProfit.toLocaleString('id-ID')}
- Total Produk Aktif: ${ctx.totalProducts}

PRODUK TERLARIS BULAN INI:
${ctx.topProducts.length > 0 ? ctx.topProducts.join('\n') : 'Belum ada data'}

STOK MENIPIS:
${ctx.lowStockList.length > 0 ? ctx.lowStockList.join('\n') : 'Semua stok aman'}

INSTRUKSI:
- Jawab pertanyaan tentang bisnis berdasarkan data di atas
- Berikan saran yang actionable dan spesifik
- Gunakan emoji untuk membuat respons lebih menarik
- Format angka dengan pemisah ribuan Indonesia (titik)
- Jika ditanya sesuatu di luar data, jelaskan dengan sopan
- Jawab singkat dan to the point (maksimal 3-4 paragraf)`;
}

async function callHuggingFaceAPI(systemPrompt, userMessage) {
    const apiKey = process.env.HUGGINGFACE_API_KEY;

    if (!apiKey) {
        // Fallback response when no API key
        return generateFallbackResponse(userMessage);
    }

    // Use OpenAI-compatible endpoint
    const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'mistralai/Mistral-7B-Instruct-v0.2',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ],
            max_tokens: 500,
            temperature: 0.7
        })
    });

    const data = await response.json();

    if (data.error) {
        // Model might be loading, return friendly message
        if (data.error.includes && data.error.includes('loading')) {
            return '⏳ Model sedang loading, coba lagi dalam beberapa detik...';
        }
        throw new Error(data.error.message || data.error || 'Hugging Face API error');
    }

    // OpenAI format response
    return data.choices?.[0]?.message?.content || 'Maaf, saya tidak bisa memproses permintaan Anda.';
}

function generateFallbackResponse(message) {
    // Simple keyword-based fallback when no API key
    const lower = message.toLowerCase();

    if (lower.includes('profit') || lower.includes('untung')) {
        return '📊 Untuk melihat profit, silakan cek Dashboard atau halaman Laporan. Tambahkan HUGGINGFACE_API_KEY untuk analisis AI lebih detail.';
    }
    if (lower.includes('stok') || lower.includes('restock')) {
        return '📦 Cek halaman Inventory untuk melihat status stok. Produk dengan stok ≤5 akan ditandai merah.';
    }
    if (lower.includes('laris') || lower.includes('terlaris')) {
        return '🏆 Produk terlaris bisa dilihat di Dashboard.';
    }

    return '🤖 Untuk AI penuh GRATIS, daftar di https://huggingface.co → Settings → Access Tokens → New Token. Lalu tambahkan HUGGINGFACE_API_KEY di Vercel.';
}

