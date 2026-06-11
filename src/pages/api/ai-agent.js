// Server-side agent: use the service-role client (bypasses RLS). Actions are
// scoped by owner_id passed in the request/tool params.
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { getSessionUser } from '@/lib/session';
import { callChat, generateImage } from '@/lib/aiModels';
import { fetchWeatherData } from '@/lib/regionalIntelligence';
import { fetchAirQuality, computeCityIntel } from '@/lib/cityIntel';

// ============================================
// CASHLO AUTONOMOUS AI AGENT
// Tool-Calling Agent with Reasoning Loop
// ============================================

const MAX_TOOL_ITERATIONS = 5;

// ─── TOOL REGISTRY ───
const TOOLS = {
    // ══════ CITY INTEL (Palantir) ══════
    get_city_intel: {
        description: 'Ambil INTEL KOTA Palangka Raya real-time: indeks permintaan hari ini, cuaca, kualitas udara & risiko kabut asap, proyeksi omzet, sinyal PELUANG/ANCAMAN, dan BATTLE PLAN untuk mengalahkan kompetitor. WAJIB dipakai saat user tanya strategi, "hari ini ramai?", prediksi, cara kalahkan kompetitor, atau rekomendasi promo.',
        parameters: {},
        requiresConfirmation: false,
        execute: async (params, userId) => {
            const since = new Date(); since.setDate(since.getDate() - 30);
            const [{ data: txns }, { data: comps }, weather, air] = await Promise.all([
                supabase.from('transactions').select('subtotal, datetime').eq('owner_id', userId).gte('datetime', since.toISOString()).neq('status', 'voided'),
                supabase.from('competitors').select('name, last_promo, price_level').eq('owner_id', userId),
                fetchWeatherData(),
                fetchAirQuality(),
            ]);
            let avg = 2000000;
            if (txns && txns.length) {
                const days = new Set(txns.map(t => (t.datetime || '').slice(0, 10))).size || 1;
                avg = Math.round(txns.reduce((s, t) => s + (t.subtotal || 0), 0) / days);
            }
            const intel = computeCityIntel({ weather: weather?.[0], air, avgDailyRevenue: avg, competitors: comps || [] });
            return {
                indeks_permintaan: `${intel.demand.index}/100 (${intel.demand.label})`,
                proyeksi_omzet: `Rp ${intel.projection.revenue.toLocaleString('id-ID')}`,
                proyeksi_profit: `Rp ${intel.projection.profit.toLocaleString('id-ID')}`,
                cuaca: `${intel.environment.weather_desc}, ${Math.round(intel.environment.temperature || 0)}°C`,
                kabut_asap: `${intel.environment.haze?.label} (AQI ${intel.environment.us_aqi ?? '-'})`,
                sinyal: intel.signals.map(s => `[${s.type === 'opportunity' ? 'PELUANG' : 'ANCAMAN'}] ${s.title}: ${s.detail}`),
                battle_plan: intel.battle_plan.map(b => `[${b.priority}] ${b.action} — ${b.why}`),
                kompetitor_dipantau: (comps || []).map(c => c.name),
                event_mendatang: intel.upcoming_events.map(e => `${e.name} (${e.date})`),
            };
        }
    },

    // ══════ READ TOOLS ══════
    get_sales_today: {
        description: 'Ambil data penjualan hari ini: jumlah transaksi, omzet, profit',
        parameters: {},
        requiresConfirmation: false,
        execute: async (params, userId) => {
            const today = new Date();
            const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
            const { data } = await supabase
                .from('transactions')
                .select('*')
                .eq('owner_id', userId)
                .gte('datetime', startOfDay)
                .neq('status', 'voided');

            const revenue = data?.reduce((s, t) => s + (t.subtotal || 0), 0) || 0;
            const profit = data?.reduce((s, t) => s + (t.total_profit || 0), 0) || 0;
            const count = data?.length || 0;

            // Top items today
            const itemMap = {};
            data?.forEach(txn => {
                try {
                    const items = JSON.parse(txn.items || '[]');
                    items.forEach(item => {
                        if (!itemMap[item.name]) itemMap[item.name] = { qty: 0, revenue: 0 };
                        itemMap[item.name].qty += item.qty || 0;
                        itemMap[item.name].revenue += item.total_sell || 0;
                    });
                } catch (e) { }
            });

            const topItems = Object.entries(itemMap)
                .sort((a, b) => b[1].qty - a[1].qty)
                .slice(0, 10)
                .map(([name, d]) => `${name}: ${d.qty} terjual (Rp ${d.revenue.toLocaleString('id-ID')})`);

            return {
                transaksi: count,
                omzet: revenue,
                omzet_formatted: `Rp ${revenue.toLocaleString('id-ID')}`,
                profit: profit,
                profit_formatted: `Rp ${profit.toLocaleString('id-ID')}`,
                produk_terlaris: topItems
            };
        }
    },

    get_sales_period: {
        description: 'Ambil data penjualan untuk periode tertentu. Parameter: start_date (YYYY-MM-DD), end_date (YYYY-MM-DD)',
        parameters: { start_date: 'string', end_date: 'string' },
        requiresConfirmation: false,
        execute: async (params, userId) => {
            const { start_date, end_date } = params;
            const start = new Date(start_date).toISOString();
            const end = new Date(end_date + 'T23:59:59').toISOString();

            const { data } = await supabase
                .from('transactions')
                .select('*')
                .eq('owner_id', userId)
                .gte('datetime', start)
                .lte('datetime', end)
                .neq('status', 'voided');

            const revenue = data?.reduce((s, t) => s + (t.subtotal || 0), 0) || 0;
            const profit = data?.reduce((s, t) => s + (t.total_profit || 0), 0) || 0;

            return {
                periode: `${start_date} s/d ${end_date}`,
                transaksi: data?.length || 0,
                omzet: revenue,
                omzet_formatted: `Rp ${revenue.toLocaleString('id-ID')}`,
                profit: profit,
                profit_formatted: `Rp ${profit.toLocaleString('id-ID')}`
            };
        }
    },

    get_top_products: {
        description: 'Ambil daftar produk terlaris bulan ini berdasarkan jumlah terjual',
        parameters: {},
        requiresConfirmation: false,
        execute: async (params, userId) => {
            const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
            const { data } = await supabase
                .from('transactions')
                .select('items')
                .eq('owner_id', userId)
                .gte('datetime', startOfMonth)
                .neq('status', 'voided');

            const productSales = {};
            data?.forEach(txn => {
                try {
                    const items = JSON.parse(txn.items || '[]');
                    items.forEach(item => {
                        if (!productSales[item.name]) productSales[item.name] = { qty: 0, revenue: 0, profit: 0 };
                        productSales[item.name].qty += item.qty || 0;
                        productSales[item.name].revenue += item.total_sell || 0;
                        productSales[item.name].profit += (item.total_sell || 0) - ((item.cost_price || 0) * (item.qty || 0));
                    });
                } catch (e) { }
            });

            return Object.entries(productSales)
                .sort((a, b) => b[1].qty - a[1].qty)
                .slice(0, 15)
                .map(([name, d], i) => ({
                    rank: i + 1,
                    nama: name,
                    terjual: d.qty,
                    omzet: `Rp ${d.revenue.toLocaleString('id-ID')}`,
                    profit: `Rp ${d.profit.toLocaleString('id-ID')}`
                }));
        }
    },

    get_low_stock: {
        description: 'Ambil daftar produk dengan stok menipis (di bawah minimum)',
        parameters: {},
        requiresConfirmation: false,
        execute: async (params, userId) => {
            const { data: products } = await supabase
                .from('products')
                .select('id, name, sell_price')
                .eq('owner_id', userId)
                .eq('is_active', true);

            const { data: stocks } = await supabase
                .from('product_stocks')
                .select('product_id, quantity, min_stock_level')
                .eq('owner_id', userId);

            const productMap = {};
            products?.forEach(p => { productMap[p.id] = p; });

            const lowStock = [];
            stocks?.forEach(s => {
                const prod = productMap[s.product_id];
                if (prod && s.quantity <= (s.min_stock_level || 5)) {
                    lowStock.push({
                        nama: prod.name,
                        stok_saat_ini: s.quantity,
                        minimum: s.min_stock_level || 5,
                        status: s.quantity === 0 ? 'HABIS' : 'MENIPIS'
                    });
                }
            });

            return lowStock.length > 0
                ? lowStock
                : { message: 'Semua stok dalam kondisi aman.' };
        }
    },

    get_all_products: {
        description: 'Ambil daftar semua produk aktif dengan harga dan kategori',
        parameters: {},
        requiresConfirmation: false,
        execute: async (params, userId) => {
            const { data } = await supabase
                .from('products')
                .select('id, name, category, sell_price, cost_price')
                .eq('owner_id', userId)
                .eq('is_active', true)
                .order('name');

            return data?.map(p => ({
                id: p.id,
                nama: p.name,
                kategori: p.category || 'Tanpa Kategori',
                harga_jual: `Rp ${(p.sell_price || 0).toLocaleString('id-ID')}`,
                harga_modal: `Rp ${(p.cost_price || 0).toLocaleString('id-ID')}`,
                margin: p.sell_price && p.cost_price
                    ? `${Math.round(((p.sell_price - p.cost_price) / p.sell_price) * 100)}%`
                    : '-'
            })) || [];
        }
    },

    get_product_detail: {
        description: 'Ambil detail lengkap satu produk berdasarkan nama. Parameter: product_name (string)',
        parameters: { product_name: 'string' },
        requiresConfirmation: false,
        execute: async (params, userId) => {
            const { product_name } = params;
            const { data } = await supabase
                .from('products')
                .select('*')
                .eq('owner_id', userId)
                .eq('is_active', true)
                .ilike('name', `%${product_name}%`)
                .limit(1)
                .single();

            if (!data) return { error: `Produk "${product_name}" tidak ditemukan` };

            // Get stock
            const { data: stockData } = await supabase
                .from('product_stocks')
                .select('quantity, min_stock_level')
                .eq('product_id', data.id);

            const totalStock = stockData?.reduce((s, st) => s + (st.quantity || 0), 0) || 0;

            return {
                id: data.id,
                nama: data.name,
                kategori: data.category,
                harga_jual: data.sell_price,
                harga_modal: data.cost_price,
                stok: totalStock,
                margin: data.sell_price && data.cost_price
                    ? `${Math.round(((data.sell_price - data.cost_price) / data.sell_price) * 100)}%`
                    : '-'
            };
        }
    },

    get_customers: {
        description: 'Ambil daftar pelanggan terdaftar dengan poin dan total belanja',
        parameters: {},
        requiresConfirmation: false,
        execute: async (params, userId) => {
            const { data } = await supabase
                .from('customers')
                .select('id, name, phone, email, points, total_spend')
                .eq('owner_id', userId)
                .order('total_spend', { ascending: false })
                .limit(20);

            return data?.map(c => ({
                nama: c.name,
                telepon: c.phone || '-',
                poin: c.points || 0,
                total_belanja: `Rp ${(c.total_spend || 0).toLocaleString('id-ID')}`
            })) || [];
        }
    },

    get_expenses: {
        description: 'Ambil daftar pengeluaran bulan ini. Optional parameter: start_date, end_date',
        parameters: { start_date: 'string (optional)', end_date: 'string (optional)' },
        requiresConfirmation: false,
        execute: async (params, userId) => {
            const now = new Date();
            const startDate = params.start_date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
            const endDate = params.end_date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            const { data } = await supabase
                .from('expenses')
                .select('*')
                .eq('owner_id', userId)
                .gte('date', startDate)
                .lte('date', endDate)
                .order('date', { ascending: false });

            const total = data?.reduce((s, e) => s + parseFloat(e.amount || 0), 0) || 0;

            return {
                total: `Rp ${total.toLocaleString('id-ID')}`,
                jumlah_item: data?.length || 0,
                detail: data?.slice(0, 15).map(e => ({
                    tanggal: e.date,
                    kategori: e.category || '-',
                    deskripsi: e.description || '-',
                    jumlah: `Rp ${parseFloat(e.amount || 0).toLocaleString('id-ID')}`
                })) || []
            };
        }
    },

    get_supplies: {
        description: 'Ambil daftar supply/bahan baku dengan level stok',
        parameters: {},
        requiresConfirmation: false,
        execute: async (params, userId) => {
            const { data } = await supabase
                .from('supplies')
                .select('*')
                .eq('owner_id', userId)
                .order('name');

            return data?.map(s => ({
                nama: s.name,
                stok: s.stock || 0,
                satuan: s.unit || '-',
                minimum: s.min_stock_level || 0,
                status: (s.stock || 0) <= (s.min_stock_level || 0) ? '⚠️ MENIPIS' : '✅ Aman'
            })) || [];
        }
    },

    // ══════ WRITE TOOLS ══════
    update_product_price: {
        description: 'Update harga jual produk. Parameter: product_name (string), new_price (number)',
        parameters: { product_name: 'string', new_price: 'number' },
        requiresConfirmation: true,
        execute: async (params, userId) => {
            const { product_name, new_price } = params;

            const { data: product } = await supabase
                .from('products')
                .select('id, name, sell_price')
                .eq('owner_id', userId)
                .ilike('name', `%${product_name}%`)
                .limit(1)
                .single();

            if (!product) return { success: false, error: `Produk "${product_name}" tidak ditemukan` };

            const oldPrice = product.sell_price;
            const { error } = await supabase
                .from('products')
                .update({ sell_price: new_price, updated_at: new Date().toISOString() })
                .eq('id', product.id)
                .eq('owner_id', userId);

            if (error) return { success: false, error: error.message };

            return {
                success: true,
                message: `Harga "${product.name}" diubah: Rp ${oldPrice?.toLocaleString('id-ID')} → Rp ${new_price.toLocaleString('id-ID')}`
            };
        }
    },

    update_stock: {
        description: 'Update jumlah stok produk (restock/opname). Parameter: product_name (string), new_quantity (number), type (restock|opname), notes (string)',
        parameters: { product_name: 'string', new_quantity: 'number', type: 'string', notes: 'string' },
        requiresConfirmation: true,
        execute: async (params, userId) => {
            const { product_name, new_quantity, type, notes } = params;

            const { data: product } = await supabase
                .from('products')
                .select('id, name')
                .eq('owner_id', userId)
                .ilike('name', `%${product_name}%`)
                .limit(1)
                .single();

            if (!product) return { success: false, error: `Produk "${product_name}" tidak ditemukan` };

            // Get primary warehouse
            const { data: warehouse } = await supabase
                .from('warehouses')
                .select('id')
                .eq('owner_id', userId)
                .eq('is_primary', true)
                .limit(1)
                .single();

            if (!warehouse) return { success: false, error: 'Warehouse utama tidak ditemukan' };

            // Get current stock
            const { data: currentStock } = await supabase
                .from('product_stocks')
                .select('quantity')
                .eq('product_id', product.id)
                .eq('warehouse_id', warehouse.id)
                .maybeSingle();

            const oldQty = currentStock?.quantity || 0;
            const changeAmount = new_quantity - oldQty;

            // Upsert stock
            const { error: stockError } = await supabase
                .from('product_stocks')
                .upsert({
                    product_id: product.id,
                    warehouse_id: warehouse.id,
                    quantity: new_quantity
                }, { onConflict: 'product_id, warehouse_id' });

            if (stockError) return { success: false, error: stockError.message };

            // Log
            await supabase.from('inventory_logs').insert([{
                product_id: product.id,
                warehouse_id: warehouse.id,
                change_amount: changeAmount,
                final_stock: new_quantity,
                type: type || 'restock',
                notes: notes || `AI Agent: stok diubah ${oldQty} → ${new_quantity}`,
                created_by: userId
            }]);

            return {
                success: true,
                message: `Stok "${product.name}" diubah: ${oldQty} → ${new_quantity} (${changeAmount > 0 ? '+' : ''}${changeAmount})`
            };
        }
    },

    add_product: {
        description: 'Tambah produk baru. Parameter: name (string), sell_price (number), cost_price (number, optional), category (string, optional)',
        parameters: { name: 'string', sell_price: 'number', cost_price: 'number', category: 'string' },
        requiresConfirmation: true,
        execute: async (params, userId) => {
            const { name, sell_price, cost_price, category } = params;

            // Check duplicate
            const { data: existing } = await supabase
                .from('products')
                .select('id')
                .eq('owner_id', userId)
                .ilike('name', name)
                .limit(1);

            if (existing && existing.length > 0) {
                return { success: false, error: `Produk "${name}" sudah ada` };
            }

            const id = `prod-${Date.now()}`;
            const { error } = await supabase.from('products').insert([{
                id,
                name,
                sell_price,
                cost_price: cost_price || 0,
                category: category || null,
                owner_id: userId,
                is_active: true,
                modifiers: '[]',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }]);

            if (error) return { success: false, error: error.message };

            return {
                success: true,
                message: `Produk baru "${name}" (Rp ${sell_price.toLocaleString('id-ID')}) berhasil ditambahkan`
            };
        }
    },

    add_expense: {
        description: 'Catat pengeluaran baru. Parameter: description (string), amount (number), category (string, optional), date (YYYY-MM-DD, optional)',
        parameters: { description: 'string', amount: 'number', category: 'string', date: 'string' },
        requiresConfirmation: true,
        execute: async (params, userId) => {
            const { description, amount, category, date } = params;
            const now = new Date();
            const expenseDate = date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            const { error } = await supabase.from('expenses').insert([{
                description,
                amount,
                category: category || 'Operasional',
                date: expenseDate,
                owner_id: userId
            }]);

            if (error) return { success: false, error: error.message };

            return {
                success: true,
                message: `Pengeluaran "${description}" sebesar Rp ${amount.toLocaleString('id-ID')} berhasil dicatat (${expenseDate})`
            };
        }
    },

    add_customer: {
        description: 'Daftarkan pelanggan baru. Parameter: name (string), phone (string, optional), email (string, optional)',
        parameters: { name: 'string', phone: 'string', email: 'string' },
        requiresConfirmation: true,
        execute: async (params, userId) => {
            const { name, phone, email } = params;

            if (phone) {
                const { data: existing } = await supabase
                    .from('customers')
                    .select('id')
                    .eq('phone', phone)
                    .eq('owner_id', userId);

                if (existing && existing.length > 0) {
                    return { success: false, error: `Pelanggan dengan nomor ${phone} sudah terdaftar` };
                }
            }

            const { error } = await supabase.from('customers').insert([{
                name,
                phone: phone || null,
                email: email || null,
                owner_id: userId,
                points: 0,
                total_spend: 0,
                created_at: new Date().toISOString()
            }]);

            if (error) return { success: false, error: error.message };

            return {
                success: true,
                message: `Pelanggan "${name}" berhasil didaftarkan`
            };
        }
    },

    add_supply: {
        description: 'Tambah item supply/bahan baku baru. Parameter: name (string), unit (string), min_stock (number, optional)',
        parameters: { name: 'string', unit: 'string', min_stock: 'number' },
        requiresConfirmation: true,
        execute: async (params, userId) => {
            const { name, unit, min_stock } = params;

            const { data: existing } = await supabase
                .from('supplies')
                .select('id')
                .eq('name', name)
                .eq('owner_id', userId)
                .limit(1);

            if (existing && existing.length > 0) {
                return { success: false, error: `Supply "${name}" sudah ada` };
            }

            const { error } = await supabase.from('supplies').insert([{
                name,
                unit: unit || 'pcs',
                min_stock_level: min_stock || 10,
                stock: 0,
                owner_id: userId
            }]);

            if (error) return { success: false, error: error.message };

            return {
                success: true,
                message: `Supply "${name}" (${unit || 'pcs'}, min: ${min_stock || 10}) berhasil ditambahkan`
            };
        }
    },

    // ══════ MENU CONTROL TOOLS ══════
    update_product: {
        description: 'Update produk: ganti nama, kategori, harga jual, dan/atau harga modal. Parameter: product_name (string, nama produk saat ini), new_name (string, optional), new_category (string, optional), new_sell_price (number, optional), new_cost_price (number, optional)',
        parameters: { product_name: 'string', new_name: 'string', new_category: 'string', new_sell_price: 'number', new_cost_price: 'number' },
        requiresConfirmation: true,
        execute: async (params, userId) => {
            const { product_name, new_name, new_category, new_sell_price, new_cost_price } = params;
            const { data: products } = await supabase
                .from('products').select('*')
                .eq('owner_id', userId).ilike('name', `%${product_name}%`).limit(1);
            if (!products || products.length === 0) return { success: false, error: `Produk "${product_name}" tidak ditemukan` };

            const updates = { updated_at: new Date().toISOString() };
            if (new_name) updates.name = new_name;
            if (new_category) updates.category = new_category;
            if (typeof new_sell_price === 'number') updates.sell_price = new_sell_price;
            if (typeof new_cost_price === 'number') updates.cost_price = new_cost_price;
            if (Object.keys(updates).length === 1) return { success: false, error: 'Tidak ada perubahan yang diminta' };

            const { error } = await supabase.from('products').update(updates).eq('id', products[0].id);
            if (error) return { success: false, error: error.message };
            return { success: true, message: `Produk "${products[0].name}" berhasil diupdate: ${Object.keys(updates).filter(k => k !== 'updated_at').join(', ')}` };
        }
    },

    set_product_active: {
        description: 'Aktifkan atau nonaktifkan produk dari menu (sembunyikan/tampilkan di kasir). Parameter: product_name (string), active (boolean)',
        parameters: { product_name: 'string', active: 'boolean' },
        requiresConfirmation: true,
        execute: async (params, userId) => {
            const { product_name, active } = params;
            const { data: products } = await supabase
                .from('products').select('id, name')
                .eq('owner_id', userId).ilike('name', `%${product_name}%`).limit(1);
            if (!products || products.length === 0) return { success: false, error: `Produk "${product_name}" tidak ditemukan` };

            const { error } = await supabase.from('products').update({ is_active: !!active, updated_at: new Date().toISOString() }).eq('id', products[0].id);
            if (error) return { success: false, error: error.message };
            return { success: true, message: `Produk "${products[0].name}" sekarang ${active ? 'AKTIF di menu' : 'disembunyikan dari menu'}` };
        }
    },

    get_categories: {
        description: 'Ambil daftar kategori menu',
        parameters: {},
        requiresConfirmation: false,
        execute: async (params, userId) => {
            const { data } = await supabase.from('categories').select('name, "order"').eq('owner_id', userId).order('order');
            return { kategori: data?.map(c => c.name) || [] };
        }
    },

    add_category: {
        description: 'Tambah kategori menu baru. Parameter: name (string)',
        parameters: { name: 'string' },
        requiresConfirmation: true,
        execute: async (params, userId) => {
            const { name } = params;
            const { data: existing } = await supabase.from('categories').select('id').eq('owner_id', userId).ilike('name', name).limit(1);
            if (existing && existing.length > 0) return { success: false, error: `Kategori "${name}" sudah ada` };
            const { data: all } = await supabase.from('categories').select('"order"').eq('owner_id', userId);
            const { error } = await supabase.from('categories').insert([{ id: `cat-${Date.now()}`, name, order: (all?.length || 0) + 1, owner_id: userId }]);
            if (error) return { success: false, error: error.message };
            return { success: true, message: `Kategori "${name}" berhasil ditambahkan` };
        }
    },

    // ══════ REPORT TOOL ══════
    generate_report: {
        description: 'Kumpulkan SEMUA data untuk laporan bisnis lengkap satu periode (penjualan, profit, pengeluaran, produk terlaris, stok menipis, pelanggan top). Gunakan saat user minta "laporan" / "report". Parameter: start_date (YYYY-MM-DD), end_date (YYYY-MM-DD)',
        parameters: { start_date: 'string', end_date: 'string' },
        requiresConfirmation: false,
        execute: async (params, userId) => {
            const { start_date, end_date } = params;
            const start = new Date(start_date).toISOString();
            const end = new Date(end_date + 'T23:59:59').toISOString();

            const [{ data: txns }, { data: expenses }, { data: stocks }, { data: customers }] = await Promise.all([
                supabase.from('transactions').select('*').eq('owner_id', userId).gte('datetime', start).lte('datetime', end).neq('status', 'voided'),
                supabase.from('expenses').select('*').eq('owner_id', userId).gte('date', start_date).lte('date', end_date),
                supabase.from('product_stocks').select('quantity, min_stock_level, products(name)').eq('owner_id', userId),
                supabase.from('customers').select('name, points, total_spend').eq('owner_id', userId).order('total_spend', { ascending: false }).limit(5),
            ]);

            const revenue = txns?.reduce((s, t) => s + (t.subtotal || 0), 0) || 0;
            const profit = txns?.reduce((s, t) => s + (t.total_profit || 0), 0) || 0;
            const totalExpenses = expenses?.reduce((s, e) => s + parseFloat(e.amount || 0), 0) || 0;

            const productSales = {};
            const byDay = {};
            const byPayment = {};
            txns?.forEach(t => {
                const day = (t.datetime || '').slice(0, 10);
                byDay[day] = (byDay[day] || 0) + (t.subtotal || 0);
                byPayment[t.payment_method || 'lainnya'] = (byPayment[t.payment_method || 'lainnya'] || 0) + (t.subtotal || 0);
                try {
                    JSON.parse(t.items || '[]').forEach(i => {
                        if (!productSales[i.name]) productSales[i.name] = { qty: 0, revenue: 0 };
                        productSales[i.name].qty += i.qty || 0;
                        productSales[i.name].revenue += i.total_sell || 0;
                    });
                } catch (e) { }
            });

            return {
                periode: `${start_date} s/d ${end_date}`,
                transaksi: txns?.length || 0,
                omzet: revenue,
                gross_profit: profit,
                pengeluaran: totalExpenses,
                net_profit: profit - totalExpenses,
                penjualan_per_hari: byDay,
                metode_pembayaran: byPayment,
                produk_terlaris: Object.entries(productSales).sort((a, b) => b[1].qty - a[1].qty).slice(0, 10)
                    .map(([name, d]) => ({ name, qty: d.qty, revenue: d.revenue })),
                stok_menipis: stocks?.filter(s => parseFloat(s.quantity) <= (s.min_stock_level || 10)).map(s => `${s.products?.name}: ${s.quantity}`) || [],
                pelanggan_top: customers || [],
                detail_pengeluaran: expenses?.map(e => `${e.date} ${e.category}: Rp ${parseFloat(e.amount).toLocaleString('id-ID')}`) || []
            };
        }
    },

    // ══════ IMAGE GENERATION TOOLS ══════
    generate_product_image: {
        description: 'Buat foto produk profesional dengan AI (untuk menu, sosmed, promosi). Parameter: product_name (string), style (string, optional: "foto studio"|"aesthetic cafe"|"minimalis")',
        parameters: { product_name: 'string', style: 'string' },
        requiresConfirmation: false,
        execute: async (params, userId) => {
            const { product_name, style } = params;
            const styleMap = {
                'foto studio': 'professional studio product photography, softbox lighting, clean background',
                'aesthetic cafe': 'aesthetic indonesian coffee shop ambience, warm tones, wooden table, natural window light, bokeh',
                'minimalis': 'minimalist product photography, single color background, elegant composition',
            };
            const styleDesc = styleMap[(style || '').toLowerCase()] || styleMap['aesthetic cafe'];
            const prompt = `${product_name}, indonesian cafe menu item, ${styleDesc}, highly detailed, appetizing, commercial photography, 4k`;
            const { dataUrl, model } = await generateImage(prompt, { negativePrompt: 'text, watermark, logo, low quality, blurry, deformed' });
            return { success: true, message: `🎨 Gambar "${product_name}" berhasil dibuat (model: ${model.split('/')[1]})`, image: dataUrl };
        }
    },

    generate_promo_image: {
        description: 'Buat gambar promosi/poster untuk sosmed (Instagram/WhatsApp) berdasarkan tema promo. Parameter: theme (string, deskripsi promo misal "diskon 20% kopi susu akhir pekan"), mood (string, optional: "ceria"|"elegan"|"hangat")',
        parameters: { theme: 'string', mood: 'string' },
        requiresConfirmation: false,
        execute: async (params, userId) => {
            const { theme, mood } = params;
            const moodMap = {
                'ceria': 'vibrant cheerful colors, playful composition, festive',
                'elegan': 'elegant premium dark tones, gold accents, luxurious',
                'hangat': 'warm cozy atmosphere, caramel brown palette, soft light',
            };
            const moodDesc = moodMap[(mood || '').toLowerCase()] || moodMap['hangat'];
            const prompt = `social media promotional image for an indonesian coffee shop, theme: ${theme}, ${moodDesc}, coffee cups and pastry props, professional advertising photography, square composition, no text`;
            const { dataUrl, model } = await generateImage(prompt, { negativePrompt: 'text, letters, words, watermark, low quality, blurry' });
            return { success: true, message: `🎨 Gambar promo "${theme}" berhasil dibuat (model: ${model.split('/')[1]}). Tinggal tambahkan teks promo di Canva/IG Story!`, image: dataUrl };
        }
    }
};

// ─── Build tool descriptions for system prompt ───
function getToolDescriptions() {
    return Object.entries(TOOLS).map(([name, tool]) => {
        const paramStr = Object.keys(tool.parameters).length > 0
            ? `Parameter: ${JSON.stringify(tool.parameters)}`
            : 'Tidak perlu parameter';
        const writeTag = tool.requiresConfirmation ? ' [WRITE - butuh konfirmasi user]' : ' [READ]';
        return `- ${name}${writeTag}: ${tool.description}. ${paramStr}`;
    }).join('\n');
}

// ─── Build agent system prompt ───
function buildAgentPrompt(businessContext) {
    const today = new Date();
    const dayOfWeek = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][today.getDay()];

    return `Kamu adalah CASHLO AI AGENT — asisten otonom untuk aplikasi POS "Cashlo" di Palangka Raya.
Kamu BUKAN chatbot biasa. Kamu adalah AGENT yang bisa mengambil data dan melakukan aksi nyata di database bisnis.

═══ KONTEKS BISNIS SAAT INI ═══
Hari: ${dayOfWeek}, ${today.toLocaleDateString('id-ID')}
Total Produk: ${businessContext.totalProducts}
Omzet Bulan Ini: Rp ${businessContext.monthRevenue?.toLocaleString('id-ID') || '0'}
Transaksi Bulan Ini: ${businessContext.monthCount || 0}

═══ TOOLS YANG TERSEDIA ═══
Kamu memiliki akses ke tools berikut untuk mengambil data dan melakukan aksi:

${getToolDescriptions()}

═══ CARA MENGGUNAKAN TOOLS ═══
Untuk menggunakan tool, output PERSIS format berikut (satu tool per baris):

<tool_call>{"tool":"nama_tool","params":{}}</tool_call>

Contoh penggunaan:
<tool_call>{"tool":"get_sales_today","params":{}}</tool_call>
<tool_call>{"tool":"get_product_detail","params":{"product_name":"Kopi Susu"}}</tool_call>
<tool_call>{"tool":"update_product_price","params":{"product_name":"Kopi Susu","new_price":22000}}</tool_call>
<tool_call>{"tool":"add_expense","params":{"description":"Bayar listrik","amount":500000,"category":"Utilitas"}}</tool_call>

═══ ATURAN PENTING ═══
1. SELALU gunakan tool untuk mendapatkan data terbaru. JANGAN menebak angka.
2. Kamu boleh memanggil BEBERAPA tools sekaligus dalam satu respons.
3. Setelah menerima hasil tool, berikan analisis dan insight yang berguna.
4. Untuk WRITE tools, jelaskan dulu apa yang akan dilakukan sebelum memanggil tool.
5. Jawab dalam Bahasa Indonesia yang ramah dan profesional.
6. Gunakan emoji dan format yang rapi.
7. Jika user meminta sesuatu yang di luar kemampuan tools, jelaskan dengan sopan.
8. JANGAN pernah mengarang data - selalu gunakan tool untuk cek data real.
9. Untuk pertanyaan STRATEGI / prediksi / "hari ini gimana" / cara kalahkan kompetitor: WAJIB panggil get_city_intel dulu, lalu rangkum battle plan-nya jadi 2-3 aksi konkret yang bisa langsung dijalankan hari ini.`;
}

// ─── Parse tool calls from AI response ───
function parseToolCalls(content) {
    const toolCallRegex = /<tool_call>(.*?)<\/tool_call>/gs;
    const calls = [];
    let match;

    while ((match = toolCallRegex.exec(content)) !== null) {
        try {
            const parsed = JSON.parse(match[1]);
            calls.push(parsed);
        } catch (e) {
            console.warn('Failed to parse tool call:', match[1]);
        }
    }

    return calls;
}

// ─── Remove tool call tags from text ───
function stripToolCalls(content) {
    return content.replace(/<tool_call>.*?<\/tool_call>/gs, '').trim();
}

// ─── Get quick business context (lightweight) ───
async function getQuickContext(userId) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [{ data: monthTxns }, { data: products }] = await Promise.all([
        supabase.from('transactions').select('subtotal, total_profit')
            .eq('owner_id', userId).gte('datetime', startOfMonth).neq('status', 'voided'),
        supabase.from('products').select('id').eq('owner_id', userId).eq('is_active', true)
    ]);

    return {
        totalProducts: products?.length || 0,
        monthRevenue: monthTxns?.reduce((s, t) => s + (t.subtotal || 0), 0) || 0,
        monthCount: monthTxns?.length || 0
    };
}

// ─── Call AI model (shared free-model chain in lib/aiModels.js) ───
async function callModel(messages) {
    const { content } = await callChat(messages, { maxTokens: 1536, temperature: 0.4 });
    return content;
}

// ============================================
// MAIN HANDLER — Agent Reasoning Loop
// ============================================
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Auth gate: identity (and thus which business the agent can read/WRITE)
    // comes from the signed session cookie, never the request body.
    const session = getSessionUser(req);
    if (!session) {
        return res.status(401).json({ error: 'Tidak terautentikasi' });
    }
    const userId = session.owner_id || session.id;

    const { message, contextMessages, confirmAction } = req.body;

    const isAdmin = session.role === 'admin';

    // ─── Handle action confirmation ───
    if (confirmAction) {
        if (!isAdmin) {
            return res.status(403).json({ error: 'Hanya admin yang bisa mengkonfirmasi aksi tulis' });
        }
        const { tool, params } = confirmAction;
        const toolDef = TOOLS[tool];
        if (!toolDef) {
            return res.status(400).json({ error: `Unknown tool: ${tool}` });
        }

        try {
            const result = await toolDef.execute(params, userId);
            const images = result.image ? [result.image] : [];
            if (result.image) delete result.image;
            return res.status(200).json({
                response: result.message || JSON.stringify(result),
                actionResult: result,
                images,
                toolsUsed: [{ tool, params, result, confirmed: true }]
            });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    // ─── Normal agent flow ───
    if (!message) {
        return res.status(400).json({ error: 'message required' });
    }

    try {
        const businessContext = await getQuickContext(userId);
        const systemPrompt = buildAgentPrompt(businessContext);

        // Build conversation messages
        const messages = [{ role: 'system', content: systemPrompt }];

        // Add context (previous messages)
        if (contextMessages && contextMessages.length > 0) {
            for (const cm of contextMessages) {
                messages.push({ role: cm.role, content: cm.content || '' });
            }
        }

        // Add current user message
        messages.push({ role: 'user', content: message });

        const toolsUsed = [];
        const pendingActions = [];
        const images = []; // generated images (data URLs) for the client
        let iteration = 0;

        // ─── AGENT LOOP ───
        while (iteration < MAX_TOOL_ITERATIONS) {
            iteration++;

            const aiResponse = await callModel(messages);
            const toolCalls = parseToolCalls(aiResponse);

            if (toolCalls.length === 0) {
                // No more tool calls — return final response
                const finalText = stripToolCalls(aiResponse) || aiResponse;
                return res.status(200).json({
                    response: finalText,
                    toolsUsed,
                    pendingActions,
                    images
                });
            }

            // Execute tool calls
            let toolResultsText = '';

            for (const call of toolCalls) {
                const toolDef = TOOLS[call.tool];
                if (!toolDef) {
                    toolResultsText += `\n[Tool Error] Tool "${call.tool}" tidak ditemukan.\n`;
                    continue;
                }

                const isGenerative = call.tool.startsWith('generate_product_image') || call.tool.startsWith('generate_promo_image');

                if (toolDef.requiresConfirmation || isGenerative) {
                    if (!isAdmin) {
                        toolResultsText += `\n[Tool Error: ${call.tool}] Hanya admin yang boleh menggunakan tool ini. User saat ini berperan kasir.\n`;
                        toolsUsed.push({ tool: call.tool, params: call.params, result: { error: 'admin only' }, confirmed: false });
                        continue;
                    }
                }

                if (toolDef.requiresConfirmation) {
                    // Don't execute — queue for user confirmation
                    pendingActions.push({
                        tool: call.tool,
                        params: call.params,
                        description: toolDef.description
                    });
                    toolResultsText += `\n[Pending Confirmation] Tool "${call.tool}" membutuhkan konfirmasi user. Params: ${JSON.stringify(call.params)}\n`;
                    toolsUsed.push({ tool: call.tool, params: call.params, result: 'PENDING_CONFIRMATION', confirmed: false });
                } else {
                    // Execute READ tool immediately
                    try {
                        const result = await toolDef.execute(call.params || {}, userId);
                        // Generated images: hand to client, NEVER into the model
                        // context (base64 would blow the prompt size).
                        if (result && result.image) {
                            images.push(result.image);
                            delete result.image;
                            result.image_note = 'Gambar berhasil dibuat dan sudah ditampilkan ke user.';
                        }
                        toolResultsText += `\n[Tool Result: ${call.tool}]\n${JSON.stringify(result, null, 2)}\n`;
                        toolsUsed.push({ tool: call.tool, params: call.params, result, confirmed: true });
                    } catch (e) {
                        toolResultsText += `\n[Tool Error: ${call.tool}] ${e.message}\n`;
                        toolsUsed.push({ tool: call.tool, params: call.params, result: { error: e.message }, confirmed: true });
                    }
                }
            }

            // Feed results back to AI for next iteration
            const textBeforeTools = stripToolCalls(aiResponse);
            if (textBeforeTools) {
                messages.push({ role: 'assistant', content: textBeforeTools });
            }
            messages.push({ role: 'assistant', content: `Saya telah menggunakan tools. Berikut hasilnya:${toolResultsText}` });
            messages.push({ role: 'user', content: 'Berdasarkan data dari tools di atas, berikan analisis dan jawaban lengkap ke user. Jangan panggil tool lagi kecuali benar-benar perlu data tambahan.' });
        }

        // Max iterations reached
        return res.status(200).json({
            response: 'Agent telah mencapai batas iterasi. Silakan coba pertanyaan yang lebih spesifik.',
            toolsUsed,
            pendingActions,
            images
        });

    } catch (error) {
        console.error('Agent Error:', error);
        return res.status(500).json({ error: error.message || 'Agent error' });
    }
}
