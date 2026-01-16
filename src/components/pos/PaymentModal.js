import { useState } from 'react';
import { formatCurrency } from '@/lib/db';

export default function PaymentModal({
    total,
    onConfirm,
    onCancel
}) {
    const [cashReceived, setCashReceived] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('cash');

    const cash = parseInt(cashReceived) || 0;
    const change = cash - total;
    const canPay = paymentMethod === 'qr' || cash >= total;

    // Quick amount buttons
    const quickAmounts = [
        total,
        Math.ceil(total / 10000) * 10000,
        Math.ceil(total / 50000) * 50000,
        100000,
        200000,
        500000
    ].filter((v, i, a) => a.indexOf(v) === i && v >= total).slice(0, 6);

    const handleConfirm = () => {
        if (canPay) {
            onConfirm({
                paymentMethod,
                cashReceived: paymentMethod === 'cash' ? cash : total,
                change: paymentMethod === 'cash' ? change : 0
            });
        }
    };

    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="modal" style={{ width: '100%', maxWidth: '480px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="modal-title">Pembayaran</h3>
                    <button className="btn btn-ghost btn-icon" onClick={onCancel}>✕</button>
                </div>

                <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>
                    {/* Total Amount */}
                    <div style={{
                        textAlign: 'center',
                        padding: 'var(--spacing-xl)',
                        background: 'var(--color-bg-tertiary)',
                        borderRadius: 'var(--radius-lg)',
                        marginBottom: 'var(--spacing-lg)'
                    }}>
                        <div className="text-secondary text-sm" style={{ marginBottom: '8px' }}>
                            Total Pembayaran
                        </div>
                        <div style={{
                            fontSize: '36px',
                            fontWeight: '800',
                            letterSpacing: '-0.02em'
                        }}>
                            {formatCurrency(total)}
                        </div>
                    </div>

                    {/* Payment Method */}
                    <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <label className="text-secondary text-sm" style={{ display: 'block', marginBottom: '8px' }}>
                            Metode Pembayaran
                        </label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                className={`btn ${paymentMethod === 'cash' ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setPaymentMethod('cash')}
                                style={{ flex: 1 }}
                            >
                                💵 Tunai
                            </button>
                            <button
                                className={`btn ${paymentMethod === 'qr' ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setPaymentMethod('qr')}
                                style={{ flex: 1 }}
                            >
                                📱 QRIS
                            </button>
                        </div>
                    </div>

                    {paymentMethod === 'cash' && (
                        <>
                            {/* Cash Input */}
                            <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                                <label className="text-secondary text-sm" style={{ display: 'block', marginBottom: '8px' }}>
                                    Uang Diterima
                                </label>
                                <input
                                    type="number"
                                    className="input input-lg"
                                    value={cashReceived}
                                    onChange={e => setCashReceived(e.target.value)}
                                    placeholder="Masukkan nominal..."
                                    autoFocus
                                    style={{
                                        fontSize: '24px',
                                        fontWeight: '600',
                                        textAlign: 'center'
                                    }}
                                />
                            </div>

                            {/* Quick Amounts */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(3, 1fr)',
                                gap: '8px',
                                marginBottom: 'var(--spacing-lg)'
                            }}>
                                {quickAmounts.map(amount => (
                                    <button
                                        key={amount}
                                        className="btn btn-secondary"
                                        onClick={() => setCashReceived(amount.toString())}
                                    >
                                        {formatCurrency(amount)}
                                    </button>
                                ))}
                            </div>

                            {/* Change Display */}
                            {cash > 0 && (
                                <div style={{
                                    textAlign: 'center',
                                    padding: 'var(--spacing-md)',
                                    background: change >= 0 ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
                                    borderRadius: 'var(--radius-md)'
                                }}>
                                    <div className="text-sm" style={{
                                        marginBottom: '4px',
                                        color: change >= 0 ? 'var(--color-success)' : 'var(--color-error)'
                                    }}>
                                        {change >= 0 ? 'Kembalian' : 'Kurang'}
                                    </div>
                                    <div style={{
                                        fontSize: '24px',
                                        fontWeight: '700',
                                        color: change >= 0 ? 'var(--color-success)' : 'var(--color-error)'
                                    }}>
                                        {formatCurrency(Math.abs(change))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {paymentMethod === 'qr' && (
                        <div style={{
                            textAlign: 'center',
                            padding: 'var(--spacing-xl)',
                            background: 'var(--color-bg-tertiary)',
                            borderRadius: 'var(--radius-lg)'
                        }}>
                            <div style={{
                                fontSize: '48px',
                                marginBottom: 'var(--spacing-md)'
                            }}>
                                📱
                            </div>
                            <h4 style={{ marginBottom: '8px' }}>Pembayaran QRIS</h4>
                            <p className="text-secondary text-sm">
                                Pastikan customer sudah membayar via QRIS
                            </p>
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-ghost" onClick={onCancel}>
                        Batal
                    </button>
                    <button
                        className="btn btn-success btn-lg"
                        onClick={handleConfirm}
                        disabled={!canPay}
                        style={{ minWidth: '200px' }}
                    >
                        ✓ Konfirmasi Pembayaran
                    </button>
                </div>
            </div>
        </div>
    );
}
