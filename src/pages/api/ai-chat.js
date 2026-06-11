import { createClient } from '@supabase/supabase-js';
import { generateAIContext, calculateDailyPrediction, PALANGKA_RAYA_CONTEXT } from '@/lib/regionalIntelligence';
import { getSessionUser } from '@/lib/session';

// Initialize Supabase for server-side
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Server-side: use the service-role key (bypasses RLS). Queries below already
// filter by userId/owner_id, so scoping is enforced manually.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Auth gate: identity comes from the signed session cookie, NOT the request
    // body. Prevents anyone from POSTing another business's userId.
    const session = getSessionUser(req);
    if (!session) {
        return res.status(401).json({ error: 'Tidak terautentikasi' });
    }
    const userId = session.owner_id || session.id;

    const { message, image, contextMessages, generateTitle } = req.body;

    if (!message && !image) {
        return res.status(400).json({ error: 'Message or image required' });
    }

    // Initialize Supabase with global Anon Key (assuming RLS allows or is handled by manual filters)
    // Note: In an Ideal World Class app, we'd use Service Role here to ensure rights, 
    // but we use the shared client for consistency.
    const supabaseContext = supabase;


    try {
        // Fetch business data for context
        const businessContext = await getBusinessContext(userId);

        // Build prompt with business context
        const systemPrompt = buildSystemPrompt(businessContext);

        // Call Gemma 4 API with optional image and context
        const aiResponse = await callGemma4API(systemPrompt, message, image, contextMessages);

        // Generate title if requested (first message of new conversation)
        let title = undefined;
        if (generateTitle && message) {
            title = await generateConversationTitle(message);
        }

        return res.status(200).json({ response: aiResponse, title });
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
        .eq('owner_id', userId)
        .gte('datetime', startOfDay)
        .neq('status', 'voided');

    // Get this month's transactions
    const { data: monthTxns } = await supabase
        .from('transactions')
        .select('*')
        .eq('owner_id', userId)
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
        .eq('owner_id', userId)
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
        lowStockList,
        userId
    };
}

function buildSystemPrompt(ctx) {
    // Get today's prediction
    const todayPrediction = calculateDailyPrediction(new Date(), {
        avg_daily_revenue: ctx.monthCount > 0 ? ctx.monthRevenue / Math.max(new Date().getDate(), 1) : 2000000,
        transaction_count: ctx.monthCount
    });

    // Get current date info
    const today = new Date();
    const dayOfWeek = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][today.getDay()];
    const isPaydayWeek = today.getDate() >= 25 || today.getDate() <= 5;
    const month = today.getMonth() + 1;
    const isDrySeason = [5, 6, 7, 8, 9, 10].includes(month);

    // Find upcoming events
    const upcomingEvents = PALANGKA_RAYA_CONTEXT.events
        .filter(e => new Date(e.date) >= today)
        .slice(0, 3)
        .map(e => `${e.name} (${e.date}): ${e.impact > 1 ? '+' : ''}${Math.round((e.impact - 1) * 100)}% impact`);

    return `Kamu adalah AI Business Intelligence Assistant untuk aplikasi POS "Cashlo" yang beroperasi di PALANGKA RAYA, Kalimantan Tengah.

═══════════════════════════════════════════════════════════
📊 DATA BISNIS REAL-TIME
═══════════════════════════════════════════════════════════
HARI INI (${dayOfWeek}, ${today.toLocaleDateString('id-ID')}):
- Transaksi: ${ctx.todayCount}
- Omzet: Rp ${ctx.todayRevenue.toLocaleString('id-ID')}
- Profit: Rp ${ctx.todayProfit.toLocaleString('id-ID')}

BULAN INI:
- Total Transaksi: ${ctx.monthCount}
- Total Omzet: Rp ${ctx.monthRevenue.toLocaleString('id-ID')}
- Gross Profit: Rp ${ctx.monthProfit.toLocaleString('id-ID')}
- Pengeluaran: Rp ${ctx.monthExpenses.toLocaleString('id-ID')}
- Net Profit: Rp ${ctx.netProfit.toLocaleString('id-ID')}

PRODUK TERLARIS:
${ctx.topProducts.length > 0 ? ctx.topProducts.join('\n') : 'Belum ada data'}

STOK MENIPIS:
${ctx.lowStockList.length > 0 ? ctx.lowStockList.join('\n') : 'Semua stok aman'}

═══════════════════════════════════════════════════════════
🗺️ REGIONAL INTELLIGENCE: PALANGKA RAYA
═══════════════════════════════════════════════════════════
DEMOGRAFI:
- Populasi: ~300.000 jiwa (2024)
- Etnis utama: Dayak (40%), Jawa (25%), Banjar (15%)
- Agama: Islam (75%), Kristen (20%), Hindu Kaharingan (5%)

EKONOMI LOKAL:
- UMK 2024: Rp ${PALANGKA_RAYA_CONTEXT.economy.minimum_wage_2024.toLocaleString('id-ID')}
- Industri utama: Pemerintahan, Pertambangan, Perkebunan Sawit, Pendidikan
- Rata-rata pengeluaran makan: Rp 1.850.000/bulan per keluarga

POLA KONSUMEN PALANGKA RAYA:
- Peak hours: Makan siang (11:30-13:30), Makan malam (18:00-21:00)
- Weekend: Penjualan naik 25-35% vs weekday
- Payday pemerintah (tgl 25-28): Penjualan naik 40-45%
- ${isDrySeason ? 'MUSIM KERING: Minuman dingin lebih laku' : 'MUSIM HUJAN: Makanan hangat lebih laku, delivery meningkat'}

STATUS HARI INI:
- ${isPaydayWeek ? '💰 MINGGU PAYDAY - Ekspektasi penjualan tinggi!' : 'Minggu normal'}
- Musim: ${isDrySeason ? 'Kering/Panas' : 'Hujan'}
- Prediksi omzet: Rp ${todayPrediction.predicted_revenue.mid.toLocaleString('id-ID')} (confidence: ${todayPrediction.confidence}%)
${todayPrediction.factors.length > 0 ? '- Faktor: ' + todayPrediction.factors.map(f => `${f.name} ${f.impact}`).join(', ') : ''}

EVENT MENDATANG:
${upcomingEvents.length > 0 ? upcomingEvents.join('\n') : 'Tidak ada event khusus dalam waktu dekat'}

═══════════════════════════════════════════════════════════
📝 INSTRUKSI AI
═══════════════════════════════════════════════════════════
1. Jawab dalam Bahasa Indonesia yang ramah dan profesional
2. Gunakan data bisnis DAN intelligence regional untuk analisis
3. Berikan insight spesifik untuk PASAR PALANGKA RAYA
4. Rekomendasikan strategi berdasarkan pola lokal (payday, musim, event)
5. Gunakan emoji untuk membuat respons menarik
6. Format angka dengan pemisah ribuan Indonesia
7. Jawab singkat dan actionable (maksimal 3-4 paragraf)
8. Jika ada prediksi, sebutkan tingkat confidence
9. Hubungkan data bisnis dengan konteks regional

═══════════════════════════════════════════════════════════
🤖 AGENT ACTION PROTOCOLS (PALANTIR-STYLE)
═══════════════════════════════════════════════════════════
Kamu memiliki kemampuan untuk MENGEKSEKUSI tindakan nyata.
Jika user meminta untuk melakukan sesuatu yang terdaftar di bawah, JANGAN balas dengan teks biasa.
Balas HANYA dengan JSON block berikut:

1. MENAMBAH SUPPLY BARU:
User: "Tolong tambahkan stok Cup Plastik 16oz, satuan pcs, min stok 50"
Response:
{
  "action": "add_supply",
  "params": {
    "name": "Cup Plastik 16oz",
    "unit": "pcs",
    "min_stock": 50,
    "owner_id": "${ctx.userId || 'USER_ID_PLACEHOLDER'}"
  }
}

2. UPDATE HARGA (Simulasi):
User: "Naikkan harga Kopi Susu jadi 20.000"
Response:
{ "action": "update_price", "params": { "item": "Kopi Susu", "price": 20000 } }

PENTING:
- Jika output JSON, JANGAN tambah teks lain di luar bracket JSON.
- Pastikan JSON valid.
- Gunakan kemampuan ini untuk membantu operasional user secara langsung.`;
}

async function callGemma4API(systemPrompt, userMessage, imageBase64, contextMessages) {
    const apiKey = process.env.HUGGINGFACE_API_KEY;

    if (!apiKey) {
        return generateFallbackResponse(userMessage);
    }

    const hasImage = !!imageBase64;

    // Use vision-capable models when image is present
    const models = hasImage
        ? [
            'google/gemma-3-27b-it',            // Gemma 3 27B - vision capable
            'meta-llama/Llama-3.2-11B-Vision-Instruct', // Llama vision fallback
        ]
        : [
            'google/gemma-4-12B-it',
            'google/gemma-3-27b-it',
            'Qwen/Qwen2.5-72B-Instruct',
        ];

    let lastError = null;

    for (const model of models) {
        try {
            // Build messages array
            const msgs = [{ role: 'system', content: systemPrompt }];

            if (contextMessages && contextMessages.length > 0) {
                for (let i = 0; i < contextMessages.length; i++) {
                    const cm = contextMessages[i];
                    const isLast = i === contextMessages.length - 1;

                    // Attach image to the LAST user message only
                    if (isLast && cm.role === 'user' && hasImage) {
                        msgs.push({
                            role: 'user',
                            content: [
                                { type: 'text', text: cm.content || 'Analisis gambar ini' },
                                { type: 'image_url', image_url: { url: imageBase64 } }
                            ]
                        });
                    } else {
                        msgs.push({ role: cm.role, content: cm.content || '' });
                    }
                }
            } else if (hasImage) {
                msgs.push({
                    role: 'user',
                    content: [
                        { type: 'text', text: userMessage || 'Analisis gambar ini' },
                        { type: 'image_url', image_url: { url: imageBase64 } }
                    ]
                });
            } else {
                msgs.push({ role: 'user', content: userMessage });
            }

            const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: msgs,
                    max_tokens: 1024,
                    temperature: 0.7
                })
            });

            const data = await response.json();

            if (data.error) {
                console.warn(`Model ${model} failed:`, data.error);
                lastError = data.error;
                continue;
            }

            const content = data.choices?.[0]?.message?.content || 'Maaf, saya tidak bisa memproses permintaan Anda.';

            // Check for Action Protocol
            try {
                if (content.trim().startsWith('{') && content.includes('"action":')) {
                    const actionRequest = JSON.parse(content);
                    return await executeAction(actionRequest);
                }
            } catch (e) {
                console.log('Not an action or parsing failed', e);
            }

            return content;
        } catch (fetchError) {
            console.warn(`Model ${model} fetch error:`, fetchError.message);
            lastError = fetchError.message;
            continue;
        }
    }

    throw new Error(lastError || 'All AI models unavailable');
}

// Generate a short conversation title from user's first message
async function generateConversationTitle(userMessage) {
    const apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!apiKey) return userMessage.slice(0, 40);

    try {
        const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'google/gemma-4-12B-it',
                messages: [
                    { role: 'system', content: 'Kamu adalah pembuat judul percakapan. Berikan HANYA judul singkat 3-6 kata dalam bahasa Indonesia yang mendeskripsikan topik/tujuan dari pertanyaan user. Tanpa tanda kutip, tanpa emoji, tanpa penjelasan. Contoh: Analisis Penjualan Hari Ini, Strategi Meningkatkan Profit, Rekomendasi Restock Produk' },
                    { role: 'user', content: userMessage }
                ],
                max_tokens: 20,
                temperature: 0.3
            })
        });

        const data = await response.json();
        const title = data.choices?.[0]?.message?.content?.trim();
        if (title && title.length > 0 && title.length < 60) {
            return title.replace(/^["']|["']$/g, ''); // Remove quotes if any
        }
    } catch (e) {
        console.warn('Title generation failed:', e.message);
    }

    // Fallback: use first words
    return userMessage.length > 40 ? userMessage.slice(0, 40) + '...' : userMessage;
}

// ============================================
// ACTION AGENT EXECUTOR (Palantir Style)
// ============================================
async function executeAction(request) {
    const { action, params } = request;

    switch (action) {
        case 'add_supply':
            // Action: Auto-create a supply item
            const { name, unit, min_stock, owner_id } = params;

            // Check if already exists
            const { data: existing } = await supabase
                .from('supplies')
                .select('id')
                .eq('name', name)
                .eq('owner_id', owner_id)
                .single();

            if (existing) {
                return `⚠️ Supply "${name}" sudah ada di database.`;
            }

            const { error } = await supabase.from('supplies').insert({
                name,
                unit,
                min_stock_level: min_stock || 10,
                stock: 0,
                owner_id
            });

            if (error) return `❌ Gagal menambahkan supply: ${error.message}`;
            return `✅ **ACTION EXECUTED**: Berhasil menambahkan supply baru "${name}" (Min: ${min_stock} ${unit}).`;

        case 'update_price':
            // Mock action for price update
            return `⚠️ Fitur update harga via AI butuh konfirmasi manual. Saya telah mencatat saran perubahan harga untuk "${params.item}".`;

        default:
            return `❓ Action "${action}" tidak dikenali.`;
    }
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

