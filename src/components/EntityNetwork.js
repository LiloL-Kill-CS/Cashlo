/**
 * PALANTIR-STYLE: Entity Network / Ontology Graph
 * Visual connections between Products, Suppliers, Categories, and Customers.
 * Inspired by Palantir Foundry's Ontology visualization.
 */
import { useState, useEffect, useRef } from 'react';
import { formatCurrency } from '@/lib/db';

// Node types with styling
const NODE_TYPES = {
    product: { color: '#3b82f6', icon: '📦', radius: 30 },
    supplier: { color: '#10b981', icon: '🏭', radius: 35 },
    category: { color: '#f59e0b', icon: '🏷️', radius: 40 },
    customer: { color: '#8b5cf6', icon: '👤', radius: 25 }
};

export default function EntityNetwork({
    products = [],
    transactions = [],
    suppliers = []
}) {
    const canvasRef = useRef(null);
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);
    const [selectedNode, setSelectedNode] = useState(null);
    const [hoveredNode, setHoveredNode] = useState(null);
    const [viewMode, setViewMode] = useState('category'); // category, supplier, customer

    useEffect(() => {
        buildGraph();
    }, [products, transactions, suppliers, viewMode]);

    useEffect(() => {
        drawGraph();
    }, [nodes, edges, selectedNode, hoveredNode]);

    const buildGraph = () => {
        const graphNodes = [];
        const graphEdges = [];

        if (viewMode === 'category') {
            // Group products by category
            const categories = {};
            products.forEach(p => {
                const cat = p.category || 'Lainnya';
                if (!categories[cat]) {
                    categories[cat] = { name: cat, products: [], totalSold: 0 };
                }
                categories[cat].products.push(p);
            });

            // Add category nodes in center
            const catList = Object.values(categories);
            catList.forEach((cat, idx) => {
                const angle = (2 * Math.PI * idx) / catList.length;
                const radius = 100;
                graphNodes.push({
                    id: `cat-${cat.name}`,
                    type: 'category',
                    label: cat.name,
                    x: 200 + Math.cos(angle) * radius,
                    y: 150 + Math.sin(angle) * radius,
                    data: { productCount: cat.products.length }
                });

                // Add product nodes around category
                cat.products.slice(0, 5).forEach((prod, pIdx) => {
                    const pAngle = angle + (pIdx - 2) * 0.3;
                    const pRadius = 180;
                    graphNodes.push({
                        id: `prod-${prod.id}`,
                        type: 'product',
                        label: prod.name.length > 12 ? prod.name.slice(0, 12) + '...' : prod.name,
                        x: 200 + Math.cos(pAngle) * pRadius,
                        y: 150 + Math.sin(pAngle) * pRadius,
                        data: prod
                    });
                    graphEdges.push({
                        from: `cat-${cat.name}`,
                        to: `prod-${prod.id}`,
                        strength: 1
                    });
                });
            });
        } else if (viewMode === 'supplier') {
            // Group products by supplier
            const supplierMap = {};
            products.forEach(p => {
                const sup = p.supplier_name || 'Tidak Ada Supplier';
                if (!supplierMap[sup]) {
                    supplierMap[sup] = [];
                }
                supplierMap[sup].push(p);
            });

            const supList = Object.entries(supplierMap);
            supList.forEach(([supName, prods], idx) => {
                const angle = (2 * Math.PI * idx) / supList.length;
                const radius = 100;
                graphNodes.push({
                    id: `sup-${supName}`,
                    type: 'supplier',
                    label: supName.length > 12 ? supName.slice(0, 12) + '...' : supName,
                    x: 200 + Math.cos(angle) * radius,
                    y: 150 + Math.sin(angle) * radius,
                    data: { productCount: prods.length }
                });

                prods.slice(0, 4).forEach((prod, pIdx) => {
                    const pAngle = angle + (pIdx - 1.5) * 0.35;
                    const pRadius = 180;
                    graphNodes.push({
                        id: `prod-${prod.id}`,
                        type: 'product',
                        label: prod.name.length > 10 ? prod.name.slice(0, 10) + '...' : prod.name,
                        x: 200 + Math.cos(pAngle) * pRadius,
                        y: 150 + Math.sin(pAngle) * pRadius,
                        data: prod
                    });
                    graphEdges.push({
                        from: `sup-${supName}`,
                        to: `prod-${prod.id}`,
                        strength: 1
                    });
                });
            });
        } else if (viewMode === 'customer') {
            // Analyze customer purchasing patterns from transactions
            const customerBuys = {};
            transactions.slice(0, 50).forEach(txn => {
                const items = JSON.parse(txn.items || '[]');
                items.forEach(item => {
                    if (!customerBuys[item.product_id]) {
                        customerBuys[item.product_id] = {
                            name: item.name,
                            buyers: new Set(),
                            count: 0
                        };
                    }
                    customerBuys[item.product_id].buyers.add(txn.cashier_name || 'Unknown');
                    customerBuys[item.product_id].count++;
                });
            });

            // Top 8 popular products
            const topProducts = Object.entries(customerBuys)
                .sort(([, a], [, b]) => b.count - a.count)
                .slice(0, 8);

            // Add center node
            graphNodes.push({
                id: 'center-store',
                type: 'category',
                label: '🏪 Toko',
                x: 200,
                y: 150,
                data: { totalTxn: transactions.length }
            });

            topProducts.forEach(([prodId, data], idx) => {
                const angle = (2 * Math.PI * idx) / topProducts.length;
                const radius = 120;
                graphNodes.push({
                    id: `prod-${prodId}`,
                    type: 'product',
                    label: data.name.length > 10 ? data.name.slice(0, 10) + '...' : data.name,
                    x: 200 + Math.cos(angle) * radius,
                    y: 150 + Math.sin(angle) * radius,
                    data: { soldCount: data.count, buyers: data.buyers.size }
                });
                graphEdges.push({
                    from: 'center-store',
                    to: `prod-${prodId}`,
                    strength: data.count / 10
                });
            });
        }

        setNodes(graphNodes);
        setEdges(graphEdges);
    };

    const drawGraph = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        // Set canvas size
        canvas.width = 400 * dpr;
        canvas.height = 300 * dpr;
        ctx.scale(dpr, dpr);

        // Clear
        ctx.fillStyle = 'transparent';
        ctx.fillRect(0, 0, 400, 300);

        // Draw edges
        edges.forEach(edge => {
            const fromNode = nodes.find(n => n.id === edge.from);
            const toNode = nodes.find(n => n.id === edge.to);
            if (!fromNode || !toNode) return;

            ctx.beginPath();
            ctx.moveTo(fromNode.x, fromNode.y);
            ctx.lineTo(toNode.x, toNode.y);
            ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)';
            ctx.lineWidth = Math.min(edge.strength, 3);
            ctx.stroke();
        });

        // Draw nodes
        nodes.forEach(node => {
            const config = NODE_TYPES[node.type];
            const isHovered = hoveredNode?.id === node.id;
            const isSelected = selectedNode?.id === node.id;
            const radius = config.radius * (isHovered ? 1.2 : 1);

            // Glow effect for hovered/selected
            if (isHovered || isSelected) {
                ctx.shadowColor = config.color;
                ctx.shadowBlur = 15;
            }

            // Node circle
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius / 2, 0, 2 * Math.PI);
            ctx.fillStyle = isSelected ? config.color : config.color + '40';
            ctx.fill();
            ctx.strokeStyle = config.color;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Icon
            ctx.font = `${radius / 2.5}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(config.icon, node.x, node.y);

            // Label
            ctx.font = '10px Inter, sans-serif';
            ctx.fillStyle = '#888';
            ctx.fillText(node.label, node.x, node.y + radius / 2 + 10);
        });
    };

    const handleCanvasClick = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Find clicked node
        const clicked = nodes.find(node => {
            const config = NODE_TYPES[node.type];
            const dist = Math.sqrt(Math.pow(node.x - x, 2) + Math.pow(node.y - y, 2));
            return dist < config.radius / 2;
        });

        setSelectedNode(clicked || null);
    };

    const handleCanvasMove = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const hovered = nodes.find(node => {
            const config = NODE_TYPES[node.type];
            const dist = Math.sqrt(Math.pow(node.x - x, 2) + Math.pow(node.y - y, 2));
            return dist < config.radius / 2;
        });

        setHoveredNode(hovered || null);
        canvas.style.cursor = hovered ? 'pointer' : 'default';
    };

    return (
        <div className="card">
            <header className="card-header mb-md">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
                    <div>
                        <h3 className="text-lg font-bold">🕸️ Entity Network Graph</h3>
                        <p className="text-xs text-secondary">Palantir-style Ontology Visualization</p>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                        {['category', 'supplier', 'customer'].map(mode => (
                            <button
                                key={mode}
                                className={`btn btn-sm ${viewMode === mode ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => setViewMode(mode)}
                            >
                                {mode === 'category' && '🏷️ Kategori'}
                                {mode === 'supplier' && '🏭 Supplier'}
                                {mode === 'customer' && '👤 Pembeli'}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <div style={{
                display: 'flex',
                gap: 'var(--spacing-md)',
                flexWrap: 'wrap'
            }}>
                {/* Canvas */}
                <div style={{
                    flex: '1 1 300px',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '8px',
                    padding: 'var(--spacing-sm)'
                }}>
                    <canvas
                        ref={canvasRef}
                        onClick={handleCanvasClick}
                        onMouseMove={handleCanvasMove}
                        style={{
                            width: '100%',
                            height: '300px',
                            borderRadius: '8px'
                        }}
                    />
                </div>

                {/* Node Details Panel */}
                <div style={{
                    flex: '0 0 200px',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '8px',
                    padding: 'var(--spacing-md)'
                }}>
                    <div className="text-sm font-bold mb-sm">📋 Detail Node</div>
                    {selectedNode ? (
                        <div>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--spacing-sm)',
                                marginBottom: 'var(--spacing-md)'
                            }}>
                                <span style={{ fontSize: '24px' }}>
                                    {NODE_TYPES[selectedNode.type].icon}
                                </span>
                                <div>
                                    <div className="font-bold">{selectedNode.label}</div>
                                    <div className="text-xs text-secondary">
                                        {selectedNode.type.toUpperCase()}
                                    </div>
                                </div>
                            </div>

                            {/* Node-specific data */}
                            {selectedNode.data && (
                                <div className="text-sm" style={{
                                    background: 'var(--color-bg-primary)',
                                    padding: 'var(--spacing-sm)',
                                    borderRadius: '6px'
                                }}>
                                    {selectedNode.data.productCount && (
                                        <div>Produk: {selectedNode.data.productCount}</div>
                                    )}
                                    {selectedNode.data.sell_price && (
                                        <div>Harga: {formatCurrency(selectedNode.data.sell_price)}</div>
                                    )}
                                    {selectedNode.data.stock && (
                                        <div>Stok: {selectedNode.data.stock}</div>
                                    )}
                                    {selectedNode.data.soldCount && (
                                        <div>Terjual: {selectedNode.data.soldCount}x</div>
                                    )}
                                    {selectedNode.data.buyers && (
                                        <div>Pembeli: {selectedNode.data.buyers} orang</div>
                                    )}
                                </div>
                            )}

                            {/* Connected nodes */}
                            <div className="text-xs text-secondary mt-md">
                                Koneksi: {edges.filter(e =>
                                    e.from === selectedNode.id || e.to === selectedNode.id
                                ).length} node
                            </div>
                        </div>
                    ) : (
                        <div className="text-sm text-secondary" style={{ textAlign: 'center', padding: 'var(--spacing-lg)' }}>
                            Klik node untuk melihat detail
                        </div>
                    )}
                </div>
            </div>

            {/* Legend */}
            <div style={{
                display: 'flex',
                gap: 'var(--spacing-md)',
                marginTop: 'var(--spacing-md)',
                flexWrap: 'wrap',
                justifyContent: 'center'
            }}>
                {Object.entries(NODE_TYPES).map(([type, config]) => (
                    <div key={type} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--spacing-xs)',
                        fontSize: '12px'
                    }}>
                        <span style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            background: config.color
                        }}></span>
                        <span>{config.icon}</span>
                        <span className="text-secondary">{type}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
