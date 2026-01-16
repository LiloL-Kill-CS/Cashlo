import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/db';

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
    onToggle
}) {
    const [isMobile, setIsMobile] = useState(false);

    // Check if mobile on mount and resize
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth <= 768);
        };

        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    return (
        <div className={`cart-section ${isExpanded ? 'expanded' : ''}`}>
            {/* Cart Header */}
            <div className="cart-header" onClick={onToggle}>
                <div className="flex items-center gap-md">
                    <h2 className="cart-title">Pesanan</h2>
                    {itemCount > 0 && (
                        <span className="cart-count">{itemCount} item</span>
                    )}
                    {isMobile && (
                        <span className="show-mobile-only" style={{
                            marginLeft: 'auto',
                            fontSize: '12px',
                            color: 'var(--color-text-muted)'
                        }}>
                            {isExpanded ? '▼ Tutup' : '▲ Buka'}
                        </span>
                    )}
                </div>
                {heldOrdersCount > 0 && (
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            onRecall();
                        }}
                    >
                        📋 {heldOrdersCount} Ditahan
                    </button>
                )}
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
                    <div className="cart-total-row total">
                        <span>Total</span>
                        <span>{formatCurrency(subtotal)}</span>
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
                        onClick={onPay}
                        disabled={items.length === 0}
                    >
                        💳 Bayar {items.length > 0 ? formatCurrency(subtotal) : ''}
                    </button>
                </div>
            </div>
        </div>
    );
}
