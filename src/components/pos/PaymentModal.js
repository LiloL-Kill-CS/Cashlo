import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/db';
import { useLoyalty } from '@/hooks/useLoyalty';

export default function PaymentModal({
    total,
    customer,
    onConfirm,
    onCancel
}) {
    const { rewards } = useLoyalty();
    const [cashReceived, setCashReceived] = useState('');
    const [displayCash, setDisplayCash] = useState(''); // Formatted display value
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [selectedReward, setSelectedReward] = useState(null);

    // Format number with thousand separators (Indonesian style: 1.000.000)
    const formatWithSeparator = (value) => {
        if (!value) return '';
        const num = parseInt(value.toString().replace(/\./g, ''), 10);
        if (isNaN(num)) return '';
        return num.toLocaleString('id-ID');
    };

    // Handle cash input with formatting
    const handleCashInput = (e) => {
        const rawValue = e.target.value.replace(/\./g, ''); // Remove existing separators
        const numericValue = rawValue.replace(/\D/g, ''); // Remove non-digits
        setCashReceived(numericValue);
        setDisplayCash(formatWithSeparator(numericValue));
    };

    // Handle quick amount button clicks
    const handleQuickAmount = (amount) => {
        setCashReceived(amount.toString());
        setDisplayCash(formatWithSeparator(amount));
    };

    // Calculate totals with discount
    const discount = selectedReward ? parseInt(selectedReward.reward_value) : 0;
    const finalTotal = Math.max(0, total - discount);

    const cash = parseInt(cashReceived) || 0;
    const change = cash - finalTotal;
    const canPay = paymentMethod === 'qr' || cash >= finalTotal;

    // Filter applicable rewards
    const availableRewards = customer ? rewards.filter(r => r.points_cost <= customer.points && r.reward_type === 'discount_amount') : [];

    // Quick amount buttons
    const quickAmounts = [
        finalTotal,
        Math.ceil(finalTotal / 10000) * 10000,
        Math.ceil(finalTotal / 50000) * 50000,
        100000,
        200000,
        500000
    ].filter((v, i, a) => a.indexOf(v) === i && v >= finalTotal).slice(0, 6);

    const handleConfirm = () => {
        if (canPay) {
            onConfirm({
                paymentMethod,
                cashReceived: paymentMethod === 'cash' ? cash : finalTotal,
                change: paymentMethod === 'cash' ? change : 0,
                pointsRedeemed: selectedReward ? selectedReward.points_cost : 0,
                rewardId: selectedReward ? selectedReward.id : null
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
                    {/* Customer Info & Points */}
                    {customer && (
                        <div style={{ marginBottom: 'var(--spacing-md)', padding: 'var(--spacing-md)', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                            <div className="flex justify-between items-center mb-sm">
                                <span style={{ fontWeight: '600' }}>👤 {customer.name}</span>
                                <span className="badge badge-primary">{customer.points} Poin</span>
                            </div>

                            {/* Reward Selection */}
                            {availableRewards.length > 0 ? (
                                <div>
                                    <label className="text-secondary text-xs block mb-xs">Tukarkan Poin (Diskon):</label>
                                    <div className="flex gap-sm overflow-x-auto pb-xs">
                                        <button
                                            className={`btn btn-sm ${selectedReward === null ? 'btn-primary' : 'btn-outline'}`}
                                            onClick={() => setSelectedReward(null)}
                                        >
                                            Tidak
                                        </button>
                                        {availableRewards.map(r => (
                                            <button
                                                key={r.id}
                                                className={`btn btn-sm ${selectedReward?.id === r.id ? 'btn-primary' : 'btn-outline'}`}
                                                onClick={() => setSelectedReward(selectedReward?.id === r.id ? null : r)}
                                            >
                                                {r.name} (-{r.points_cost} pts)
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-xs text-secondary italic mt-xs">Poin belum cukup untuk menukar hadiah.</div>
                            )}
                        </div>
                    )}

                    {/* Total Amount */}
                    <div style={{
                        textAlign: 'center',
                        padding: 'var(--spacing-xl)',
                        background: 'var(--color-bg-tertiary)',
                        borderRadius: 'var(--radius-lg)',
                        marginBottom: 'var(--spacing-lg)'
                    }}>
                        <div className="text-secondary text-sm" style={{ marginBottom: '8px' }}>
                            Total Pembayaran {selectedReward && <span className="text-success">(Hemat {formatCurrency(discount)})</span>}
                        </div>
                        <div style={{
                            fontSize: '36px',
                            fontWeight: '800',
                            letterSpacing: '-0.02em'
                        }}>
                            {formatCurrency(finalTotal)}
                        </div>
                        {selectedReward && (
                            <div className="text-sm text-secondary" style={{ textDecoration: 'line-through' }}>
                                {formatCurrency(total)}
                            </div>
                        )}
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
                                    type="text"
                                    inputMode="numeric"
                                    className="input input-lg"
                                    value={displayCash}
                                    onChange={handleCashInput}
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
                                        onClick={() => handleQuickAmount(amount)}
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
