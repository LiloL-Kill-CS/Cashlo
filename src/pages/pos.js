import { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import ProductGrid from '@/components/pos/ProductGrid';
import Cart from '@/components/pos/Cart';
import PaymentModal from '@/components/pos/PaymentModal';
import ModifierModal from '@/components/pos/ModifierModal';
import HoldOrderModal from '@/components/pos/HoldOrderModal';
import ReceiptModal from '@/components/pos/ReceiptModal';
import { useProducts } from '@/hooks/useProducts';
import { useCart } from '@/hooks/useCart';
import { useTransactions } from '@/hooks/useTransactions';
import { useHeldOrders } from '@/hooks/useHeldOrders';
import { useAuth } from '@/hooks/useAuth';
import { useCustomers } from '@/hooks/useCustomers';

export default function POSPage() {
    const { user, loading: authLoading } = useAuth();
    const { products, categories, loading: productsLoading } = useProducts(user?.id, user?.role);
    const { customers, searchCustomers } = useCustomers(user?.id, user?.role);
    const {
        items, addItem, updateQuantity, removeItem, clearCart, setCartItems,
        subtotal, totalCost, totalProfit, itemCount
    } = useCart();
    const { createTransaction } = useTransactions(user?.id, user?.role);
    const { heldOrders, holdOrder, recallOrder, deleteHeldOrder } = useHeldOrders(user?.id);

    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [customerQuery, setCustomerQuery] = useState('');
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showModifierModal, setShowModifierModal] = useState(false);
    const [showHoldModal, setShowHoldModal] = useState(false);
    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const [showCustomerModal, setShowCustomerModal] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [lastTransaction, setLastTransaction] = useState(null);
    const [isCartExpanded, setIsCartExpanded] = useState(false);

    // Cart auto-expand on mobile
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth > 768) setIsCartExpanded(false);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (window.innerWidth <= 768 && items.length > 0) {
            setIsCartExpanded(true);
        }
    }, [items.length]);

    // Redirect if not logged in
    useEffect(() => {
        if (!authLoading && !user) {
            window.location.href = '/';
        }
    }, [user, authLoading]);

    // Customer search debounce
    useEffect(() => {
        const timeout = setTimeout(() => {
            if (showCustomerModal) searchCustomers(customerQuery);
        }, 500);
        return () => clearTimeout(timeout);
    }, [customerQuery, showCustomerModal, searchCustomers]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setShowPaymentModal(false);
                setShowModifierModal(false);
                setShowHoldModal(false);
                setShowReceiptModal(false);
                setShowCustomerModal(false);
            }
            if (e.key === 'Enter' && !showPaymentModal && items.length > 0) {
                setShowPaymentModal(true);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [items, showPaymentModal]);

    const handleProductClick = (product) => {
        const modifiers = product.modifiers ? JSON.parse(product.modifiers) : [];
        if (modifiers.length > 0) {
            setSelectedProduct(product);
            setShowModifierModal(true);
        } else {
            addItem({
                id: product.id,
                product_id: product.id,
                name: product.name,
                sell_price: product.sell_price || 0,
                cost_price: product.cost_price || 0,
                qty: 1,
                modifiers: []
            });
        }
    };

    const handleModifierConfirm = (selectedModifiers) => {
        if (selectedProduct) {
            const modifierTotal = selectedModifiers.reduce((sum, m) => sum + (m.price_add || 0), 0);
            addItem({
                id: selectedProduct.id + '-' + Date.now(),
                product_id: selectedProduct.id,
                name: selectedProduct.name,
                sell_price: (selectedProduct.sell_price || 0) + modifierTotal,
                cost_price: selectedProduct.cost_price || 0,
                qty: 1,
                modifiers: selectedModifiers
            });
        }
        setShowModifierModal(false);
        setSelectedProduct(null);
    };

    const handleHoldOrder = async (orderName) => {
        if (items.length === 0) return;
        await holdOrder(orderName, items);
        clearCart();
        setShowHoldModal(false);
    };

    const handleRecallOrder = (order) => {
        setCartItems(order.items);
        recallOrder(order.id);
        setShowHoldModal(false);
    };

    const handleCustomerSelect = (customer) => {
        setSelectedCustomer(customer);
        setShowCustomerModal(false);
    };

    const handlePaymentConfirm = async ({ paymentMethod, cashReceived, pointsRedeemed }) => {
        try {
            const transaction = await createTransaction(
                items,
                user?.id || 'guest',
                paymentMethod,
                cashReceived,
                selectedCustomer?.id,
                pointsRedeemed
            );
            setLastTransaction(transaction);
            clearCart();
            setSelectedCustomer(null);
            setShowPaymentModal(false);
            setShowReceiptModal(true);
        } catch (error) {
            console.error('Error creating transaction:', error);
            alert('Gagal menyimpan transaksi');
        }
    };

    if (authLoading || productsLoading) {
        return (
            <div className="app-container">
                <Sidebar activePage="pos" />
                <main className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="animate-pulse text-muted">Memuat...</div>
                </main>
            </div>
        );
    }

    return (
        <div className="app-container">
            <Sidebar activePage="pos" />

            <main className="main-content">
                <header className="page-header">
                    <div>
                        <h1 className="page-title">Kasir</h1>
                        <p className="text-secondary text-sm">Selamat datang, {user?.name || 'User'}</p>
                    </div>
                </header>

                <div className="pos-container">
                    <ProductGrid
                        products={products}
                        categories={categories}
                        selectedCategory={selectedCategory}
                        onCategoryChange={setSelectedCategory}
                        onProductClick={handleProductClick}
                        searchQuery={searchQuery}
                        onSearchChange={setSearchQuery}
                    />

                    <Cart
                        items={items}
                        onUpdateQuantity={updateQuantity}
                        onRemoveItem={removeItem}
                        onClear={clearCart}
                        onHold={() => setShowHoldModal(true)}
                        onPay={() => setShowPaymentModal(true)}
                        onRecall={() => setShowHoldModal(true)}
                        onSelectCustomer={() => setShowCustomerModal(true)}
                        selectedCustomer={selectedCustomer}
                        subtotal={subtotal}
                        itemCount={itemCount}
                        heldOrdersCount={heldOrders.length}
                        isExpanded={isCartExpanded}
                        onToggle={() => setIsCartExpanded(!isCartExpanded)}
                    />

                    <button className="mobile-cart-toggle" onClick={() => setIsCartExpanded(!isCartExpanded)}>
                        {itemCount > 0 && <div className="cart-badge">{itemCount}</div>}
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="9" cy="21" r="1"></circle>
                            <circle cx="20" cy="21" r="1"></circle>
                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                        </svg>
                    </button>
                </div>
            </main>

            {/* Modals */}
            {showPaymentModal && (
                <PaymentModal
                    total={subtotal}
                    customer={selectedCustomer}
                    onConfirm={handlePaymentConfirm}
                    onCancel={() => setShowPaymentModal(false)}
                />
            )}

            {showCustomerModal && (
                <div className="modal-overlay" onClick={() => setShowCustomerModal(false)}>
                    <div className="modal" style={{ width: '400px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Pilih Pelanggan</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowCustomerModal(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <input
                                type="text"
                                className="input mb-md"
                                placeholder="Cari nama atau no. HP..."
                                value={customerQuery}
                                onChange={e => setCustomerQuery(e.target.value)}
                                autoFocus
                            />
                            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                {customers.map(c => (
                                    <div
                                        key={c.id}
                                        className="p-md border-bottom cursor-pointer hover:bg-tertiary"
                                        onClick={() => handleCustomerSelect(c)}
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}
                                    >
                                        <div>
                                            <div style={{ fontWeight: 'bold' }}>{c.name}</div>
                                            <div className="text-secondary text-xs">{c.phone}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="badge badge-primary">{c.points} pts</div>
                                            <div className="text-xs text-secondary mt-xs">{c.membership_tiers?.name}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showModifierModal && selectedProduct && (
                <ModifierModal
                    product={selectedProduct}
                    onConfirm={handleModifierConfirm}
                    onCancel={() => {
                        setShowModifierModal(false);
                        setSelectedProduct(null);
                    }}
                />
            )}

            {showHoldModal && (
                <HoldOrderModal
                    heldOrders={heldOrders}
                    onRecall={handleRecallOrder}
                    onDelete={deleteHeldOrder}
                    onHoldCurrent={handleHoldOrder}
                    onCancel={() => setShowHoldModal(false)}
                    hasCurrentOrder={items.length > 0}
                />
            )}

            {showReceiptModal && lastTransaction && (
                <ReceiptModal
                    transaction={lastTransaction}
                    onClose={() => setShowReceiptModal(false)}
                    onNewOrder={() => setShowReceiptModal(false)}
                />
            )}
        </div>
    );
}
