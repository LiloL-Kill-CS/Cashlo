import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useInventory } from '@/hooks/useInventory';
import { formatDate } from '@/lib/db';
import { remainingSupplyServings, quantityPerServing, roundSupplyQuantity } from '@/lib/inventoryQuantities';
import styles from '@/styles/Inventory.module.css';

const number = value => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 6 }).format(Number(value) || 0);
const unitLabel = unit => unit === 'gram' ? 'g' : unit;
const blankItem = { name: '', unit: 'ml', pack_size: '750', servings_per_pack: '', usage_label: '', initial_packs: '1', min_stock_level: '0', common_dose: '15', common_dose_edited: false, common_tolerance: '3', menus: [] };

function portionsForMenu(stock, dose) {
    const perPortion = Number(dose);
    if (!Number.isFinite(perPortion) || perPortion <= 0) return 0;
    let count = Math.max(0, Math.floor(Number(stock) / perPortion));
    if (roundSupplyQuantity((count + 1) * perPortion) <= Number(stock)) count += 1;
    if (roundSupplyQuantity(count * perPortion) > Number(stock)) count -= 1;
    return count;
}

function InventoryDialog({ title, onClose, busy, children }) {
    const container = useRef(null);
    useEffect(() => {
        const previous = document.activeElement;
        container.current?.querySelector('input, select, textarea, button')?.focus();
        return () => previous?.focus();
    }, []);
    return <div className={styles.overlay} onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
        <section ref={container} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="inventory-dialog-title" onKeyDown={event => {
            if (event.key === 'Escape' && !busy) onClose();
            if (event.key !== 'Tab') return;
            const elements = [...container.current.querySelectorAll('button, input, select, textarea, a[href]')].filter(element => !element.disabled);
            const first = elements[0], last = elements.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>
            <div className={styles.dialogHeader}><h2 id="inventory-dialog-title">{title}</h2><button type="button" aria-label="Tutup" onClick={onClose} disabled={busy} className={styles.iconButton}>×</button></div>
            {children}
        </section>
    </div>;
}

export default function InventoryPage() {
    const { user, loading: authLoading } = useAuth();
    const ownerId = user?.owner_id || user?.id;
    const inventory = useInventory(authLoading ? null : ownerId, user?.role, authLoading ? null : ownerId);
    const { warehouses, stocks, logs, supplies, supplyLogs, menuProducts = [], supplyMenus = [], loading, suppliesLoading, supplyError, selectedWarehouseId, setSelectedWarehouseId,
        saveSupply, restockSupply, consumeSupply, consumeSupplyMenu, consumeSupplyQuantity, adjustSupply, updateStock, addWarehouse, updateWarehouse } = inventory;
    const [tab, setTab] = useState('supplies');
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [modal, setModal] = useState(null);
    const [form, setForm] = useState({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const submitLock = useRef(false);
    const nextMenuRowId = useRef(0);
    const admin = user?.role === 'admin';
    useEffect(() => { if (!authLoading && !user) window.location.href = '/'; }, [user, authLoading]);
    const items = supplies || [];
    const low = item => Number(item.stock) <= Number(item.min_stock_level || 0);
    const matches = item => item.name?.toLowerCase().includes(search.toLowerCase().trim());
    const filtered = items.filter(item => matches(item) && (filter === 'all' || (filter === 'low' ? low(item) : Number(item.stock) > 0)));
    const menusFor = item => item ? supplyMenus.filter(link => String(link.supply_id) === String(item.id)) : [];
    const open = (mode, item = null) => {
        setError(''); setNotice(''); setModal({ mode, item });
        if (mode === 'item') setForm(item ? {
            ...item,
            servings_per_pack: item.servings_per_pack || '',
            usage_label: item.usage_label || '',
            common_dose: '15',
            common_dose_edited: false,
            common_tolerance: item.unit === 'ml' ? '3' : '0',
            menus: menusFor(item).map(link => ({ rowId: ++nextMenuRowId.current, product_id: String(link.product_id), quantity_per_serving: String(link.quantity_per_serving), quantity_tolerance: String(link.quantity_tolerance ?? 0) })),
        } : { ...blankItem });
        else if (mode === 'warehouse') setForm(item ? { name: item.name, address: item.address || '' } : { name: '', address: '' });
        else setForm({ amount: mode === 'adjust' ? item.stock : mode === 'product' ? item.quantity : '1', notes: '', product_id: mode === 'consume' ? String(menusFor(item)[0]?.product_id || '') : '' });
    };
    const close = () => { if (!submitLock.current) { setModal(null); setError(''); } };
    const change = event => {
        const { name, value } = event.target;
        setForm(previous => {
            if (name === 'unit') return {
                ...previous, unit: value,
                common_tolerance: value === 'ml' ? '3' : '0',
                menus: (previous.menus || []).map(row => ({ ...row, quantity_tolerance: value === 'ml' ? row.quantity_tolerance : '0' })),
            };
            if (name === 'common_dose') return { ...previous, common_dose: value, common_dose_edited: true };
            const next = { ...previous, [name]: value };
            if ((name === 'pack_size' || name === 'servings_per_pack') && !previous.common_dose_edited) {
                const dose = Number(next.pack_size) > 0 && Number(next.servings_per_pack) > 0
                    ? roundSupplyQuantity(Number(next.pack_size) / Number(next.servings_per_pack)) : 0;
                if (dose > 0) next.common_dose = String(dose);
            }
            return next;
        });
    };
    const suggestedDose = Number(form.pack_size) > 0 && Number(form.servings_per_pack) > 0
        ? roundSupplyQuantity(Number(form.pack_size) / Number(form.servings_per_pack)) : 0;
    const commonDose = Number(form.common_dose);
    const commonTolerance = Number(form.common_tolerance);
    const validCommonDose = form.common_dose !== '' && form.common_tolerance !== '' && Number.isFinite(commonDose) && commonDose > 0 && Number.isFinite(commonTolerance) && commonTolerance >= 0 && commonTolerance < commonDose;
    const selectedMenuIds = new Set((form.menus || []).map(row => String(row.product_id)));
    const availableMenuProducts = menuProducts.filter(product => !selectedMenuIds.has(String(product.id)));
    const initialRowDose = validCommonDose ? commonDose : suggestedDose;
    const initialRowTolerance = form.unit === 'ml' && initialRowDose > commonTolerance && commonTolerance >= 0 ? commonTolerance : 0;
    const addMenuRow = () => {
        const nextProduct = availableMenuProducts[0];
        if (!nextProduct) return;
        setForm(previous => ({ ...previous, menus: [...(previous.menus || []), {
            rowId: ++nextMenuRowId.current,
            product_id: String(nextProduct.id),
            quantity_per_serving: initialRowDose > 0 ? String(initialRowDose) : '',
            quantity_tolerance: String(initialRowTolerance),
        }] }));
    };
    const connectAllMenus = () => {
        if (!validCommonDose || (form.menus || []).length + availableMenuProducts.length > 100) return;
        setForm(previous => ({ ...previous, menus: [...(previous.menus || []), ...availableMenuProducts.map(product => ({
            rowId: ++nextMenuRowId.current,
            product_id: String(product.id),
            quantity_per_serving: String(commonDose),
            quantity_tolerance: String(commonTolerance),
        }))] }));
    };
    const applyCommonDose = () => {
        if (!validCommonDose) return;
        setForm(previous => ({ ...previous, menus: (previous.menus || []).map(row => ({
            ...row, quantity_per_serving: String(commonDose), quantity_tolerance: String(commonTolerance),
        })) }));
    };
    const updateMenuRow = (rowId, field, value) => setForm(previous => ({ ...previous,
        menus: (previous.menus || []).map(row => row.rowId === rowId ? { ...row, [field]: value } : row),
    }));
    const removeMenuRow = rowId => setForm(previous => ({ ...previous,
        menus: (previous.menus || []).filter(row => row.rowId !== rowId),
    }));
    const invalidMenuRows = (form.menus || []).some(row => {
        const dose = Number(row.quantity_per_serving), tolerance = Number(row.quantity_tolerance);
        return !row.product_id || !Number.isFinite(dose) || dose <= 0 || !Number.isFinite(tolerance) || tolerance < 0 || tolerance >= dose;
    });
    const submit = async event => {
        event.preventDefault();
        if (submitLock.current) return;
        submitLock.current = true; setBusy(true); setError('');
        try {
            const item = modal.item;
            if (modal.mode === 'item') await saveSupply({ ...form, id: item?.id, name: form.name.trim(), servings_per_pack: form.servings_per_pack === '' ? null : Number(form.servings_per_pack),
                menus: (form.menus || []).map(row => ({ product_id: row.product_id, quantity_per_serving: Number(row.quantity_per_serving), quantity_tolerance: Number(row.quantity_tolerance) })) });
            else if (modal.mode === 'restock') await restockSupply(item.id, Number(form.amount), form.notes);
            else if (modal.mode === 'consume') {
                if (menusFor(item).length) await consumeSupplyMenu(item.id, form.product_id, Number(form.amount), form.notes);
                else if (item.servings_per_pack) await consumeSupply(item.id, Number(form.amount), form.notes);
                else await consumeSupplyQuantity(item.id, Number(form.amount), form.notes);
            } else if (modal.mode === 'adjust') await adjustSupply(item.id, Number(form.amount), form.notes);
            else if (modal.mode === 'product') await updateStock(item.id, selectedWarehouseId, Number(form.amount), 'opname', form.notes);
            else if (modal.mode === 'warehouse') {
                if (item) await updateWarehouse(item.id, form); else await addWarehouse(form);
            }
            setNotice(modal.mode === 'item' ? 'Item tersimpan. Gunakan item ini lagi saat stok habis.' : 'Perubahan berhasil disimpan.');
            setModal(null);
        } catch (err) { setError(err.message || 'Gagal menyimpan. Silakan coba lagi.'); }
        finally { submitLock.current = false; setBusy(false); }
    };
    const selected = modal?.item;
    const amount = Number(form.amount);
    const selectedMenus = menusFor(selected);
    const selectedMenu = selectedMenus.find(link => String(link.product_id) === String(form.product_id));
    const perServing = selectedMenu ? Number(selectedMenu.quantity_per_serving) : selected?.servings_per_pack ? quantityPerServing(selected.pack_size, selected.servings_per_pack) : 0;
    const menuTolerance = selectedMenu ? Number(selectedMenu.quantity_tolerance || 0) : 0;
    const batchMin = Math.max(0, perServing - menuTolerance) * amount;
    const batchMax = (perServing + menuTolerance) * amount;
    const delta = modal?.mode === 'restock' ? amount * Number(selected?.pack_size) : modal?.mode === 'consume' ? selectedMenus.length ? roundSupplyQuantity(amount * Number(selectedMenu?.quantity_per_serving || 0)) : selected.servings_per_pack ? roundSupplyQuantity(amount * Number(selected.pack_size) / selected.servings_per_pack) : amount : 0;
    const preview = roundSupplyQuantity(modal?.mode === 'adjust' ? amount : Number(selected?.stock) + (modal?.mode === 'restock' ? delta : -delta));
    const invalidUsage = modal?.mode === 'consume' && (!Number.isFinite(preview) || preview < 0 || (selectedMenus.length > 0 && !selectedMenu));
    const titles = { item: selected ? 'Edit item tersimpan' : 'Tambah item inventory', restock: 'Isi ulang stok', consume: 'Catat pemakaian', adjust: 'Hitung ulang stok', product: 'Hitung ulang stok menu', warehouse: selected ? 'Edit lokasi' : 'Tambah lokasi' };
    if (!authLoading && !user) return null;

    return <div className="app-container">
        <Sidebar activePage="inventory" userRole={user?.role} />
        <main className={`main-content ${styles.main}`}>
            <header className={styles.header}><div><div className={styles.eyebrow}>OPERASIONAL KEDAI</div><h1>Inventory</h1><p>Beli sekali, simpan itemnya. Pantau sisa bahan setiap hari.</p></div>{admin && <button className={styles.primary} onClick={() => open('item')}>+ Tambah item</button>}</header>
            <div className={styles.body}>
                {notice && <div role="status" className={styles.success}>{notice}</div>}
                {supplyError && <div role="alert" className={styles.error}>{supplyError}<button className={styles.secondary} onClick={() => inventory.loadSupplies().catch(() => {})}>Coba lagi</button></div>}
                <section className={styles.stats} aria-label="Ringkasan inventory">
                    <div><span>Item tersimpan</span><strong>{items.length}</strong><small>Siap dipakai kembali</small></div>
                    <div><span>Perlu isi ulang</span><strong className={items.some(low) ? styles.warningText : ''}>{items.filter(low).length}</strong><small>Mencapai batas minimum</small></div>
                    <div><span>Takaran tersimpan</span><strong>{items.filter(item => item.servings_per_pack || menusFor(item).length).length}</strong><small>Takaran bahan untuk porsi atau menu</small></div>
                </section>
                <nav className={styles.tabs} aria-label="Bagian inventory">{[['supplies', 'Bahan & perlengkapan'], ['history', 'Riwayat bahan'], ['products', 'Stok menu'], ['locations', 'Lokasi']].map(([value, label]) => <button key={value} aria-current={tab === value ? 'page' : undefined} className={tab === value ? styles.tabActive : ''} onClick={() => { setTab(value); setSearch(''); }}>{label}</button>)}</nav>
                {(authLoading || ((['supplies', 'history'].includes(tab) ? suppliesLoading : loading) && !modal)) ? <div className={styles.empty} role="status">Memuat inventory…</div> : <>
                    {tab === 'supplies' && <>
                        <div className={styles.toolbar}><label className={styles.search}><span aria-hidden="true">⌕</span><input aria-label="Cari bahan atau perlengkapan" placeholder="Cari syrup, gula, cup…" value={search} onChange={event => setSearch(event.target.value)} /></label><div className={styles.filters} aria-label="Filter stok">{[['all', 'Semua'], ['low', 'Perlu isi ulang'], ['available', 'Tersedia']].map(([value, label]) => <button key={value} className={filter === value ? styles.filterActive : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
                        {items.length === 0 && !supplyError && <section className={styles.onboarding}><div><div className={styles.eyebrow}>MULAI DARI BAHAN PERTAMA</div><h2>Sisa syrup, tanpa menebak.</h2><p>Simpan ukuran kemasan, lalu hubungkan ke satu atau beberapa menu dan isi takaran masing-masing. Catat menu yang dibuat; stok bahan langsung berkurang. Saat membeli lagi, cukup isi ulang item yang sama.</p>{admin && <button className={styles.primary} onClick={() => open('item')}>+ Tambah bahan pertama</button>}</div><div className={styles.example}><span>CONTOH TAKARAN</span><strong>750 ml ÷ 50 kopi</strong><p>15 ml untuk setiap kopi</p><div>30 kopi dicatat <b>→ 300 ml tersisa</b></div><small>Contoh perhitungan, bukan stok kedai Anda.</small></div></section>}
                        {items.length > 0 && filtered.length === 0 && <div className={styles.empty}>Tidak ada item yang cocok. Coba ubah pencarian atau filter.</div>}
                        <section className={styles.grid} aria-label="Daftar bahan dan perlengkapan">{filtered.map(item => {
                            const quantity = Number(item.stock) || 0, pack = Number(item.pack_size) || 1;
                            const linkedMenus = menusFor(item);
                            const portions = !linkedMenus.length && item.servings_per_pack ? remainingSupplyServings(item) : null;
                            return <article key={item.id} className={styles.item} aria-label={item.name}>
                                <div className={styles.itemTop}><span className={styles.itemIcon} aria-hidden="true">{['ml', 'l'].includes(item.unit) ? '◒' : item.unit === 'pcs' ? '▤' : '◈'}</span><span className={low(item) ? styles.lowBadge : styles.goodBadge}>{quantity === 0 ? 'Habis' : low(item) ? 'Stok menipis' : 'Tersedia'}</span></div>
                                <h2>{item.name}</h2><p className={styles.pack}>{number(pack)} {unitLabel(item.unit)} / kemasan{!linkedMenus.length && item.servings_per_pack ? ` · ${number(item.servings_per_pack)} ${item.usage_label || 'porsi'}` : ''}</p>
                                <div className={styles.quantity}><strong>{number(quantity)}</strong><span>{unitLabel(item.unit)} {linkedMenus.length ? 'sisa tercatat' : 'tersisa'}</span></div>
                                <div className={styles.meter} role="meter" aria-label={`Sisa ${item.name} dibanding satu kemasan`} aria-valuemin={0} aria-valuemax={pack} aria-valuenow={Math.min(quantity, pack)} aria-valuetext={`${number(quantity)} ${unitLabel(item.unit)} ${linkedMenus.length ? 'sisa tercatat' : 'tersisa'}`}><span className={low(item) ? styles.meterLow : ''} style={{ width: `${Math.min(100, quantity / pack * 100)}%` }} /></div>
                                {linkedMenus.length ? <div className={styles.menuCapacity}><span>Jika stok ini hanya dipakai untuk satu menu (perkiraan nominal):</span><ul>{linkedMenus.map(link => {
                                    const dose = Number(link.quantity_per_serving), tolerance = Number(link.quantity_tolerance || 0);
                                    return <li key={link.product_id}><b>{link.product_name || menuProducts.find(product => String(product.id) === String(link.product_id))?.name || 'Menu'}</b><span>≈ {number(portionsForMenu(quantity, dose))} porsi · {number(Math.max(0, dose - tolerance))}–{number(dose + tolerance)} {unitLabel(item.unit)} / porsi</span></li>;
                                })}</ul></div>
                                    : <div className={styles.capacity}>{portions !== null ? <><b>≈ {number(portions)} {item.usage_label || 'porsi'}</b><span>{number(quantityPerServing(item.pack_size, item.servings_per_pack))} {unitLabel(item.unit)} / porsi</span></> : <><b>{number(quantity / pack)} kemasan</b><span>Catat pemakaian dalam {unitLabel(item.unit)}</span></>}</div>}
                                {admin && <><div className={styles.itemActions}><button className={styles.secondary} onClick={() => open('restock', item)}>+ Isi ulang</button><button className={styles.primary} disabled={quantity === 0} onClick={() => open('consume', item)}>Catat pakai</button></div><div className={styles.itemFooter}><button onClick={() => open('item', item)}>Edit item</button><button onClick={() => open('adjust', item)}>Hitung ulang</button></div></>}
                            </article>;
                        })}</section>
                        {items.length > 0 && <p className={styles.footnote}>Perkiraan porsi tiap menu memakai stok bahan yang sama, jadi jangan dijumlahkan. Sisa tercatat berkurang menurut takaran nominal; pemakaian fisik bisa berbeda sesuai variasi. Catat menu yang dibuat di sini; penjualan kasir belum mengurangi bahan otomatis.</p>}
                    </>}
                    {tab === 'history' && <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Riwayat bahan</h2><p>50 perubahan terakhir · isi ulang, pemakaian, dan hitung ulang</p></div></div><div className={styles.tableWrap}><table><thead><tr><th>Waktu</th><th>Item</th><th>Menu</th><th>Aktivitas</th><th>Perubahan</th><th>Sisa</th><th>Catatan</th></tr></thead><tbody>{(supplyLogs || []).map(log => <tr key={log.id}><td>{formatDate(log.created_at)}</td><td>{log.supply_name}</td><td>{log.product_name || '—'}</td><td>{{ restock: 'Isi ulang', consume: 'Pemakaian', consume_menu: 'Pemakaian menu', consume_quantity: 'Pemakaian', adjust: 'Hitung ulang', initial: 'Stok awal' }[log.action] || log.action}</td><td className={log.change_amount > 0 ? styles.positive : ''}>{log.change_amount > 0 ? '+' : ''}{number(log.change_amount)} {unitLabel(log.unit)}</td><td>{number(log.stock_after)} {unitLabel(log.unit)}</td><td>{log.note || '—'}</td></tr>)}</tbody></table></div>{!(supplyLogs || []).length && <div className={styles.empty}>Belum ada perubahan bahan. Riwayat akan muncul setelah item ditambahkan atau stok dicatat.</div>}</section>}
                    {tab === 'products' && <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Stok menu</h2><p>Stok produk jual per lokasi. Bahan kedai ada di tab Bahan & perlengkapan.</p></div><label>Lokasi<select className="input" value={selectedWarehouseId || ''} onChange={event => setSelectedWarehouseId(event.target.value)}>{warehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label></div><div className={styles.tableWrap}><table><thead><tr><th>Menu</th><th>Stok</th><th>Aksi</th></tr></thead><tbody>{stocks.map(item => <tr key={item.id}><td>{item.name}</td><td>{number(item.quantity)}</td><td>{admin && <button className={styles.secondary} onClick={() => open('product', item)}>Hitung ulang</button>}</td></tr>)}</tbody></table></div>{!stocks.length && <div className={styles.empty}>Belum ada stok menu di lokasi ini.</div>}<details className={styles.productHistory}><summary>Riwayat stok menu</summary><div className={styles.tableWrap}><table><thead><tr><th>Waktu</th><th>Menu</th><th>Perubahan</th><th>Sisa</th></tr></thead><tbody>{logs.map(log => <tr key={log.id}><td>{formatDate(log.created_at)}</td><td>{log.products?.name || '—'}</td><td>{number(log.change_amount)}</td><td>{number(log.final_stock)}</td></tr>)}</tbody></table></div></details></section>}
                    {tab === 'locations' && <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Lokasi stok menu</h2><p>Bahan & perlengkapan dicatat untuk seluruh kedai.</p></div>{admin && <button className={styles.secondary} onClick={() => open('warehouse')}>+ Tambah lokasi</button>}</div>{warehouses.map(warehouse => <div className={styles.location} key={warehouse.id}><div><h3>{warehouse.name} {warehouse.is_primary && <span className={styles.goodBadge}>Utama</span>}</h3><p>{warehouse.address || 'Alamat belum ditambahkan'}</p></div>{admin && <button className={styles.secondary} onClick={() => open('warehouse', warehouse)}>Edit lokasi</button>}</div>)}</section>}
                </>}
            </div>
        </main>
        {modal && <InventoryDialog title={titles[modal.mode]} onClose={close} busy={busy}><form onSubmit={submit}><div className={styles.formBody}>
            {modal.mode === 'item' ? <>
                <label>Nama item<input className="input" name="name" placeholder="Contoh: Syrup vanilla" maxLength={120} required value={form.name} onChange={change} /></label>
                <div className={styles.formGrid}><label>Satuan<select className="input" name="unit" value={form.unit} disabled={!!selected && Number(selected.stock) > 0} onChange={change}>{[...new Set(['ml', 'g', 'pcs', ...(selected?.unit ? [selected.unit] : [])])].map(unit => <option key={unit} value={unit}>{unitLabel(unit)}</option>)}</select></label><label>Isi satu kemasan<input className="input" type="number" name="pack_size" min="0.000001" step="any" required value={form.pack_size} onChange={change} /></label></div>
                <label>Porsi per kemasan <span>(opsional, untuk saran takaran)</span><input className="input" type="number" name="servings_per_pack" placeholder="Contoh: 50" min="1" step="1" value={form.servings_per_pack} onChange={change} /><small>Misalnya 750 ml untuk 50 porsi memberi saran 15 ml per porsi. Setiap menu tetap bisa punya takaran berbeda.</small></label>
                {suggestedDose > 0 && <div className={styles.preview}><span>Saran takaran dari kemasan</span><strong>{number(suggestedDose)} {unitLabel(form.unit)} / porsi</strong></div>}
                <section className={styles.menuEditor} aria-label="Menu yang memakai bahan ini">
                    <div className={styles.menuEditorHeader}><div><h3>Hubungkan ke menu</h3><p>Satu bahan bisa dipakai beberapa menu dengan takaran berbeda. Isi takaran umum sekali, lalu terapkan bila sesuai.</p></div></div>
                    <div className={styles.commonDose}>
                        <label>Takaran umum ({unitLabel(form.unit)} / porsi)<input className="input" type="number" name="common_dose" min="0.000001" step="any" value={form.common_dose} onChange={change} /></label>
                        <label>Variasi umum (± {unitLabel(form.unit)} / porsi)<input className="input" type="number" name="common_tolerance" min="0" step="any" value={form.common_tolerance} onChange={change} /></label>
                    </div>
                    {!validCommonDose && <p className={styles.warningText}>Takaran umum harus lebih besar dari 0; variasi harus 0 atau lebih kecil daripada takaran.</p>}
                    <div className={styles.menuTools}>
                        <button type="button" className={styles.secondary} onClick={addMenuRow} disabled={busy || availableMenuProducts.length === 0 || (form.menus || []).length >= 100}>+ Hubungkan menu</button>
                        <button type="button" className={styles.secondary} onClick={connectAllMenus} disabled={busy || !validCommonDose || availableMenuProducts.length === 0 || (form.menus || []).length + availableMenuProducts.length > 100}>Hubungkan semua menu</button>
                        <button type="button" className={styles.secondary} onClick={applyCommonDose} disabled={busy || !validCommonDose || !(form.menus || []).length}>Terapkan ke semua menu terhubung</button>
                    </div>
                    {menuProducts.length === 0 && <p className={styles.help}>Belum ada menu tersimpan. <Link href="/products" className={styles.inlineLink}>Tambah menu dahulu</Link>, lalu hubungkan bahan ini kapan saja.</p>}
                    {(form.menus || []).map((row, index) => {
                        const usedByOtherRows = new Set((form.menus || []).filter(other => other.rowId !== row.rowId).map(other => String(other.product_id)));
                        return <div key={row.rowId} className={styles.menuRow}>
                            <label>Menu {index + 1}<select className="input" aria-label={`Menu ${index + 1}`} required value={row.product_id} onChange={event => updateMenuRow(row.rowId, 'product_id', event.target.value)}>{menuProducts.filter(product => String(product.id) === String(row.product_id) || !usedByOtherRows.has(String(product.id))).map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
                            <label>Takaran menu {index + 1} ({unitLabel(form.unit)} / porsi)<input className="input" type="number" min="0.000001" step="any" required value={row.quantity_per_serving} placeholder="Contoh: 15" onChange={event => updateMenuRow(row.rowId, 'quantity_per_serving', event.target.value)} /></label>
                            <label>Variasi menu {index + 1} (± {unitLabel(form.unit)})<input className="input" type="number" min="0" step="any" required value={row.quantity_tolerance} onChange={event => updateMenuRow(row.rowId, 'quantity_tolerance', event.target.value)} /></label>
                            <button type="button" className={styles.removeMenu} aria-label={`Hapus Menu ${index + 1}`} onClick={() => removeMenuRow(row.rowId)}>Hapus</button>
                        </div>;
                    })}
                    {invalidMenuRows && <p role="alert" className={styles.warningText}>Setiap menu perlu takaran positif dan variasi yang lebih kecil dari takaran.</p>}
                </section>
                <div className={styles.formGrid}>{!selected && <label>Jumlah kemasan awal<input className="input" type="number" name="initial_packs" min="0" step="1" required value={form.initial_packs} onChange={change} /><small>Total: {number(Number(form.initial_packs) * Number(form.pack_size))} {unitLabel(form.unit)}</small></label>}<label>Ingatkan saat sisa ({unitLabel(form.unit)})<input className="input" type="number" name="min_stock_level" min="0" step="any" required value={form.min_stock_level} onChange={change} /></label></div>
                <p className={styles.help}>{selected ? 'Mengubah detail tidak mengubah sisa stok. Satuan dikunci selama stok masih ada.' : 'Item dan takaran disimpan untuk pembelian berikutnya. Bisa mulai dari stok nol.'} Catat pemakaian menu secara manual di halaman ini.</p>
            </> : modal.mode === 'warehouse' ? <><label>Nama lokasi<input className="input" name="name" required value={form.name} onChange={change} /></label><label>Alamat <span>(opsional)</span><textarea className="input" name="address" value={form.address} onChange={change} /></label></> : <>
                <div className={styles.selectedItem}><h3>{selected.name}</h3><p>{modal.mode === 'product' ? `Stok saat ini: ${number(selected.quantity)}` : `${number(selected.stock)} ${unitLabel(selected.unit)} ${selectedMenus.length ? 'sisa tercatat' : 'tersisa'}${perServing ? ` · ${number(perServing)} ${unitLabel(selected.unit)} / porsi nominal` : ''}`}</p></div>
                {modal.mode === 'consume' && selectedMenus.length > 0 && <label>Menu yang dibuat<select className="input" aria-label="Menu yang dibuat" name="product_id" required value={form.product_id} onChange={change}>{selectedMenus.map(link => <option key={link.product_id} value={link.product_id}>{link.product_name || menuProducts.find(product => String(product.id) === String(link.product_id))?.name || 'Menu'}</option>)}</select></label>}
                <label>{modal.mode === 'restock' ? 'Tambah berapa kemasan?' : modal.mode === 'consume' ? selectedMenus.length ? 'Jumlah porsi yang dibuat' : selected.servings_per_pack ? `Jumlah ${selected.usage_label || 'porsi'} yang dibuat` : `Jumlah terpakai (${unitLabel(selected.unit)})` : `Jumlah stok sebenarnya${modal.mode === 'adjust' ? ` (${unitLabel(selected.unit)})` : ''}`}<input className="input" type="number" name="amount" required min={['restock', 'consume'].includes(modal.mode) ? (modal.mode === 'restock' || selectedMenus.length || selected.servings_per_pack ? 1 : 0.000001) : 0} step={modal.mode === 'restock' || (modal.mode === 'consume' && (selectedMenus.length || selected.servings_per_pack)) ? 1 : 'any'} value={form.amount} onChange={change} /></label>
                {modal.mode !== 'product' && <div className={styles.preview}><span>{modal.mode === 'restock' ? `+${number(delta)} ${unitLabel(selected.unit)} masuk` : modal.mode === 'consume' ? selectedMenu ? `Stok aplikasi berkurang ${number(delta)} ${unitLabel(selected.unit)} menurut takaran nominal` : `${number(delta)} ${unitLabel(selected.unit)} terpakai` : 'Sisa setelah koreksi'}</span><strong>{number(Math.max(0, preview))} {unitLabel(selected.unit)} {selectedMenu ? 'sisa tercatat' : 'tersisa'}</strong>{selectedMenu && <p>Perkiraan pemakaian untuk {number(amount)} porsi menu ini: {number(batchMin)}–{number(batchMax)} {unitLabel(selected.unit)} (variasi ±{number(menuTolerance)} per porsi). Sisa fisik bisa berbeda.</p>}{invalidUsage && <p className={styles.warningText}>Stok tidak cukup. Kurangi jumlah pemakaian.</p>}</div>}
                <label>Catatan <span>(opsional)</span><textarea className="input" name="notes" rows={2} maxLength={500} placeholder="Contoh: shift pagi" value={form.notes} onChange={change} /></label>
                {modal.mode === 'consume' && <p className={styles.help}>Catat pemakaian yang belum dicatat sebelumnya untuk menghindari pengurangan dua kali.</p>}
            </>}
            {error && <div className={styles.error} role="alert">{error}</div>}
        </div><div className={styles.formFooter}><button type="button" className={styles.secondary} disabled={busy} onClick={close}>Batal</button><button type="submit" className={styles.primary} disabled={busy || invalidUsage || (modal.mode === 'item' && invalidMenuRows)}>{busy ? 'Menyimpan…' : modal.mode === 'restock' ? 'Simpan isi ulang' : modal.mode === 'consume' ? 'Simpan pemakaian' : 'Simpan'}</button></div></form></InventoryDialog>}
    </div>;
}

export const getServerSideProps = async () => ({ props: {} });
