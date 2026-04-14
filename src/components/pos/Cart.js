import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/db';
import { useDynamicPricing } from '@/hooks/useDynamicPricing';

export default function Cart({
    items,
    onUpdateQuantity,
    onRemoveItem,
    onClear,
    onHold,
    onPay,
    subtotal,
    itemCount,
    heldOrdersCount = 0,
    onRecall,
    isExpanded,
    onToggle,
    selectedCustomer,
    onSelectCustomer
}) {
    const [isMobile, setIsMobile] = useState(false);
    const { activePromo, calculateTotal } = useDynamicPricing();

    // Calculate final total with standard logic + dynamic pricing
    const finalTotal = activePromo
        ? subtotal - (subtotal * (activePromo.value / 100))
        : subtotal;

    // ... (keep useEffect) ...

    return (
        <div className={`cart-section ${isExpanded ? 'expanded' : ''}`}>
            {/* ... (Header) ... */}
            <div className="cart-header" onClick={onToggle}>
                {/* ... (Customer Selector - keep same) ... */}
                <div style={{ marginTop: '0', marginBottom: '12px' }} onClick={e => e.stopPropagation()}>
                    {selectedCustomer ? (
                        <div
                            className="flex justify-between items-center p-sm bg-primary-light rounded cursor-pointer"
                            style={{ background: 'var(--color-bg-secondary)', padding: '8px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            onClick={onSelectCustomer}
                        >
                            <div className="flex items-center gap-xs" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <span>👤 {selectedCustomer.name}</span>
                                <span className="badge badge-primary scale-75">{selectedCustomer.points} pts</span>
                            </div>
                            <span className="text-secondary">✕</span>
                        </div>
                    ) : (
                        <button
                            className="btn btn-primary w-full"
                            style={{
                                width: '100%',
                                animation: 'aiAgentPulse 2s infinite',
                                fontWeight: '700'
                            }}
                            onClick={onSelectCustomer}
                        >
                            👥 Pilih Pelanggan (Member)
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-md" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                        <div style={{ flex: 1 }}>
                            <h2 className="cart-title" style={{ margin: 0 }}>Pesanan</h2>
                            {activePromo && (
                                <div className="text-xs text-primary animate-pulse font-bold mt-xs">
                                    {activePromo.name} (-{activePromo.value}%)
                                </div>
                            )}
                        </div>
                        {itemCount > 0 && (
                            <span className="cart-count">{itemCount} item</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Cart Items */}
            <div className="cart-items">
                {items.length === 0 ? (
                    <div className="cart-empty">
                        <div className="cart-empty-icon">🛒</div>
                        <p>Belum ada pesanan</p>
                        <p style={{ fontSize: '13px', marginTop: '8px' }}>
                            Tap produk untuk menambahkan
                        </p>
                    </div>
                ) : (
                    items.map(item => (
                        <div key={item.id} className="cart-item">
                            <div className="cart-item-info">
                                <div className="cart-item-name">{item.name}</div>
                                {item.modifiers && item.modifiers.length > 0 && (
                                    <div className="cart-item-modifiers">
                                        {item.modifiers.map(m => m.name).join(', ')}
                                    </div>
                                )}
                                <div className="cart-item-price">
                                    {formatCurrency(item.sell_price)} × {item.qty} = {formatCurrency(item.sell_price * item.qty)}
                                </div>
                            </div>
                            <div className="cart-item-qty">
                                <button onClick={() => onUpdateQuantity(item.id, -1)}>−</button>
                                <span>{item.qty}</span>
                                <button onClick={() => onUpdateQuantity(item.id, 1)}>+</button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Cart Footer */}
            <div className="cart-footer">
                <div className="cart-totals">
                    <div className="cart-total-row">
                        <span className="text-secondary">Subtotal</span>
                        <span>{formatCurrency(subtotal)}</span>
                    </div>
                    {activePromo && (
                        <div className="cart-total-row text-primary">
                            <span>Diskon ({activePromo.condition})</span>
                            <span>-{formatCurrency(subtotal * (activePromo.value / 100))}</span>
                        </div>
                    )}
                    <div className="cart-total-row total">
                        <span>Total</span>
                        <span>{formatCurrency(finalTotal)}</span>
                    </div>
                </div>

                <div className="cart-actions">
                    <button
                        className="btn btn-secondary"
                        onClick={onHold}
                        disabled={items.length === 0}
                    >
                        ⏸️ Tahan
                    </button>
                    <button
                        className="btn btn-ghost"
                        onClick={onClear}
                        disabled={items.length === 0}
                    >
                        🗑️ Hapus
                    </button>
                    <button
                        className="btn btn-primary btn-xl btn-pay"
                        onClick={() => onPay(finalTotal)}
                        disabled={items.length === 0}
                    >
                        💳 Bayar {items.length > 0 ? formatCurrency(finalTotal) : ''}
                    </button>
                </div>
            </div>
        </div >
    );
}
