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

export default function POSPage() {
    const { user, loading: authLoading } = useAuth();
    const { products, categories, loading: productsLoading } = useProducts();
    const {
        items,
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
        setCartItems,
        subtotal,
        totalCost,
        totalProfit,
        itemCount
    } = useCart();
    const { createTransaction } = useTransactions();
    const { heldOrders, holdOrder, recallOrder, deleteHeldOrder } = useHeldOrders(user?.id);

    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showModifierModal, setShowModifierModal] = useState(false);
    const [showHoldModal, setShowHoldModal] = useState(false);
    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [lastTransaction, setLastTransaction] = useState(null);
    const [isCartExpanded, setIsCartExpanded] = useState(false);

    // Auto-expand cart on mobile when items are added
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

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setShowPaymentModal(false);
                setShowModifierModal(false);
                setShowHoldModal(false);
                setShowReceiptModal(false);
            }
            if (e.key === 'Enter' && !showPaymentModal && items.length > 0) {
                setShowPaymentModal(true);
            }
            if (e.key === 'h' && e.ctrlKey) {
                e.preventDefault();
                if (items.length > 0) {
                    setShowHoldModal(true);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [items, showPaymentModal]);

    const handleProductClick = (product) => {
        const modifiers = JSON.parse(product.modifiers || '[]');
        if (modifiers.length > 0) {
            setSelectedProduct(product);
            setShowModifierModal(true);
        } else {
            addItem(product, []);
        }
    };

    const handleModifierConfirm = (modifiers) => {
        if (selectedProduct) {
            addItem(selectedProduct, modifiers);
        }
        setShowModifierModal(false);
        setSelectedProduct(null);
    };

    const handlePaymentConfirm = async ({ paymentMethod, cashReceived }) => {
        try {
            const transaction = await createTransaction(
                items,
                user?.id || 'guest',
                paymentMethod,
                cashReceived
            );
            setLastTransaction(transaction);
            clearCart();
            setShowPaymentModal(false);
            setShowReceiptModal(true);
        } catch (error) {
            console.error('Error creating transaction:', error);
            alert('Gagal menyimpan transaksi');
        }
    };

    const handleHoldOrder = async (name) => {
        await holdOrder(name, items);
        clearCart();
        setShowHoldModal(false);
    };

    const handleRecallOrder = async (orderId) => {
        const recalledItems = await recallOrder(orderId);
        if (recalledItems) {
            setCartItems(recalledItems);
        }
        setShowHoldModal(false);
    };

    if (authLoading || productsLoading) {
        return (
            <div className="app-container">
                <Sidebar activePage="pos" />
                <main className="main-content" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <div className="animate-pulse text-muted">Memuat...</div>
                </main>
            </div>
        );
    }

    return (
        <div className="app-container">
            <Sidebar activePage="pos" />

            <main className="main-content">
                {/* Header */}
                <header className="page-header">
                    <div>
                        <h1 className="page-title">Kasir</h1>
                        <p className="text-secondary text-sm">
                            Selamat datang, {user?.name || 'Pengguna'}
                        </p>
                    </div>
                    <div className="text-right">
                        <div className="text-sm text-muted">
                            {new Date().toLocaleDateString('id-ID', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            })}
                        </div>
                    </div>
                </header>

                {/* POS Content */}
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
                        subtotal={subtotal}
                        itemCount={itemCount}
                        heldOrdersCount={heldOrders.length}
                        isExpanded={isCartExpanded}
                        onToggle={() => setIsCartExpanded(!isCartExpanded)}
                    />

                    {/* Mobile Cart Toggle FAB */}
                    <button
                        className="mobile-cart-toggle"
                        onClick={() => setIsCartExpanded(!isCartExpanded)}
                    >
                        {itemCount > 0 && (
                            <div className="cart-badge">{itemCount}</div>
                        )}
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                    onConfirm={handlePaymentConfirm}
                    onCancel={() => setShowPaymentModal(false)}
                />
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
