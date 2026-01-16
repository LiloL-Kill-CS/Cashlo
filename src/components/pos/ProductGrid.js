import { formatCurrency } from '@/lib/db';

export default function ProductGrid({
    products,
    categories,
    selectedCategory,
    onCategoryChange,
    onProductClick,
    searchQuery,
    onSearchChange
}) {
    // Filter products by category and search
    const filteredProducts = products.filter(product => {
        const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
        const matchesSearch = !searchQuery ||
            product.name.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    return (
        <div className="product-section">
            {/* Search Bar */}
            <div className="search-bar">
                <span className="search-bar-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                </span>
                <input
                    type="text"
                    className="input"
                    placeholder="Cari produk..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    id="product-search"
                />
            </div>

            {/* Category Tabs */}
            <div className="category-tabs">
                <button
                    className={`category-tab ${selectedCategory === 'all' ? 'active' : ''}`}
                    onClick={() => onCategoryChange('all')}
                >
                    Semua
                </button>
                {categories.map(cat => (
                    <button
                        key={cat.id}
                        className={`category-tab ${selectedCategory === cat.id ? 'active' : ''}`}
                        onClick={() => onCategoryChange(cat.id)}
                    >
                        {cat.name}
                    </button>
                ))}
            </div>

            {/* Product Grid */}
            <div className="product-grid">
                {filteredProducts.map(product => (
                    <button
                        key={product.id}
                        className="product-btn"
                        onClick={() => onProductClick(product)}
                    >
                        <span className="name">{product.name}</span>
                        <span className="price">{formatCurrency(product.sell_price)}</span>
                    </button>
                ))}

                {filteredProducts.length === 0 && (
                    <div style={{
                        gridColumn: '1 / -1',
                        textAlign: 'center',
                        padding: '48px',
                        color: 'var(--color-text-muted)'
                    }}>
                        <p>Tidak ada produk ditemukan</p>
                    </div>
                )}
            </div>
        </div>
    );
}
