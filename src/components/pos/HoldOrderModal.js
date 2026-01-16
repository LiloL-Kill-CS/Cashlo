import { useState } from 'react';
import { formatDate } from '@/lib/db';

export default function HoldOrderModal({
    heldOrders,
    onRecall,
    onDelete,
    onHoldCurrent,
    onCancel,
    hasCurrentOrder
}) {
    const [holdName, setHoldName] = useState('');
    const [view, setView] = useState(hasCurrentOrder ? 'hold' : 'recall');

    const handleHold = () => {
        if (holdName.trim()) {
            onHoldCurrent(holdName.trim());
        }
    };

    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="modal" style={{ width: '100%', maxWidth: '500px', maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="modal-title">
                        {view === 'hold' ? 'Tahan Pesanan' : 'Pesanan Ditahan'}
                    </h3>
                    <button className="btn btn-ghost btn-icon" onClick={onCancel}>✕</button>
                </div>

                <div className="modal-body" style={{ maxHeight: '60vh', overflow: 'auto' }}>
                    {/* View Toggle */}
                    {hasCurrentOrder && heldOrders.length > 0 && (
                        <div style={{ display: 'flex', gap: '8px', marginBottom: 'var(--spacing-lg)' }}>
                            <button
                                className={`btn ${view === 'hold' ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setView('hold')}
                                style={{ flex: 1 }}
                            >
                                Tahan Pesanan Ini
                            </button>
                            <button
                                className={`btn ${view === 'recall' ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setView('recall')}
                                style={{ flex: 1 }}
                            >
                                Lihat Ditahan ({heldOrders.length})
                            </button>
                        </div>
                    )}

                    {/* Hold Current Order */}
                    {view === 'hold' && hasCurrentOrder && (
                        <div>
                            <p className="text-secondary mb-md">
                                Beri nama untuk pesanan ini agar mudah dicari nanti:
                            </p>
                            <input
                                type="text"
                                className="input input-lg mb-md"
                                placeholder="Contoh: Meja 5, Pak Budi..."
                                value={holdName}
                                onChange={e => setHoldName(e.target.value)}
                                autoFocus
                            />
                            <button
                                className="btn btn-primary w-full btn-lg"
                                onClick={handleHold}
                                disabled={!holdName.trim()}
                            >
                                ⏸️ Tahan Pesanan
                            </button>
                        </div>
                    )}

                    {/* Recall Orders */}
                    {view === 'recall' && (
                        <div>
                            {heldOrders.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}>
                                    <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>📋</div>
                                    <p className="text-muted">Tidak ada pesanan yang ditahan</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {heldOrders.map(order => {
                                        const items = JSON.parse(order.items || '[]');
                                        return (
                                            <div
                                                key={order.id}
                                                style={{
                                                    background: 'var(--color-bg-tertiary)',
                                                    borderRadius: 'var(--radius-md)',
                                                    padding: 'var(--spacing-md)'
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                    <div>
                                                        <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                                                            {order.name}
                                                        </div>
                                                        <div className="text-sm text-secondary">
                                                            {items.length} item • {formatDate(order.created_at)}
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button
                                                            className="btn btn-primary btn-sm"
                                                            onClick={() => onRecall(order.id)}
                                                        >
                                                            Panggil
                                                        </button>
                                                        <button
                                                            className="btn btn-ghost btn-sm"
                                                            onClick={() => onDelete(order.id)}
                                                        >
                                                            🗑️
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-ghost" onClick={onCancel}>
                        Tutup
                    </button>
                </div>
            </div>
        </div>
    );
}
