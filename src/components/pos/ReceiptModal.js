import { formatCurrency } from '@/lib/db';

export default function ReceiptModal({
    transaction,
    onClose,
    onNewOrder
}) {
    const items = JSON.parse(transaction.items || '[]');

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" style={{ width: '100%', maxWidth: '360px' }} onClick={e => e.stopPropagation()}>
                <div className="modal-body" style={{ padding: 'var(--spacing-xl)' }}>
                    {/* Success Icon */}
                    <div style={{
                        textAlign: 'center',
                        marginBottom: 'var(--spacing-lg)'
                    }}>
                        <div style={{
                            width: '80px',
                            height: '80px',
                            borderRadius: '50%',
                            background: 'var(--color-success-bg)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 16px',
                            fontSize: '40px'
                        }}>
                            ✓
                        </div>
                        <h3 style={{ marginBottom: '4px' }}>Pembayaran Berhasil!</h3>
                        <p className="text-secondary text-sm">{transaction.id}</p>
                    </div>

                    {/* Receipt Details */}
                    <div style={{
                        background: 'var(--color-bg-tertiary)',
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--spacing-md)',
                        marginBottom: 'var(--spacing-lg)'
                    }}>
                        {items.map((item, idx) => (
                            <div key={idx} style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginBottom: '8px',
                                paddingBottom: '8px',
                                borderBottom: idx < items.length - 1 ? '1px solid var(--color-border)' : 'none'
                            }}>
                                <div>
                                    <div style={{ fontWeight: '500' }}>{item.name}</div>
                                    <div className="text-sm text-muted">
                                        {item.qty} × {formatCurrency(item.sell_price)}
                                    </div>
                                </div>
                                <div style={{ fontWeight: '500' }}>
                                    {formatCurrency(item.total_sell)}
                                </div>
                            </div>
                        ))}

                        <div style={{
                            borderTop: '2px solid var(--color-border)',
                            marginTop: '8px',
                            paddingTop: '12px'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span className="text-secondary">Total</span>
                                <span style={{ fontWeight: '700', fontSize: '18px' }}>
                                    {formatCurrency(transaction.subtotal)}
                                </span>
                            </div>
                            {transaction.payment_method === 'cash' && (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span className="text-muted text-sm">Tunai</span>
                                        <span className="text-sm">{formatCurrency(transaction.cash_received)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span className="text-muted text-sm">Kembalian</span>
                                        <span className="text-sm">{formatCurrency(transaction.change)}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Profit Info (for admin) */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: 'var(--spacing-lg)',
                        marginBottom: 'var(--spacing-lg)'
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <div className="text-muted text-xs">Keuntungan</div>
                            <div style={{ color: 'var(--color-success)', fontWeight: '600' }}>
                                +{formatCurrency(transaction.total_profit)}
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            className="btn btn-secondary"
                            onClick={() => window.print()}
                            style={{ flex: 1 }}
                        >
                            🖨️ Cetak
                        </button>
                        <button
                            className="btn btn-primary btn-lg"
                            onClick={onNewOrder}
                            style={{ flex: 2 }}
                        >
                            Pesanan Baru
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
