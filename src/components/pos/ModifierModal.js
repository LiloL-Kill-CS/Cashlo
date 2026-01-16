import { useState } from 'react';

export default function ModifierModal({
    product,
    onConfirm,
    onCancel
}) {
    const modifiers = JSON.parse(product.modifiers || '[]');
    const [selectedModifiers, setSelectedModifiers] = useState([]);

    const toggleModifier = (modifier) => {
        setSelectedModifiers(current => {
            const exists = current.find(m => m.name === modifier.name);
            if (exists) {
                return current.filter(m => m.name !== modifier.name);
            }
            return [...current, modifier];
        });
    };

    const handleConfirm = () => {
        onConfirm(selectedModifiers);
    };

    // If no modifiers, directly add product
    if (modifiers.length === 0) {
        onConfirm([]);
        return null;
    }

    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="modal" style={{ width: '100%', maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="modal-title">{product.name}</h3>
                    <button className="btn btn-ghost btn-icon" onClick={onCancel}>✕</button>
                </div>

                <div className="modal-body">
                    <p className="text-secondary mb-md">Pilih opsi tambahan:</p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {modifiers.map(mod => (
                            <button
                                key={mod.name}
                                className={`btn ${selectedModifiers.find(m => m.name === mod.name) ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => toggleModifier(mod)}
                                style={{
                                    justifyContent: 'space-between',
                                    padding: 'var(--spacing-md) var(--spacing-lg)'
                                }}
                            >
                                <span>{mod.name}</span>
                                {mod.price > 0 && (
                                    <span className="text-sm">+Rp {mod.price.toLocaleString()}</span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-ghost" onClick={() => onConfirm([])}>
                        Tanpa Opsi
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleConfirm}
                    >
                        Tambahkan
                    </button>
                </div>
            </div>
        </div>
    );
}
