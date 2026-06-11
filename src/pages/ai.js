import { useState, useRef, useEffect, useCallback } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Head from 'next/head';
import { useAuth } from '@/hooks/useAuth';

const SUGGESTED_PROMPTS = [
    { icon: '📊', text: 'Bagaimana performa bisnis hari ini?', desc: 'Analisis real-time' },
    { icon: '📈', text: 'Produk apa yang paling laris bulan ini?', desc: 'Tren penjualan' },
    { icon: '💡', text: 'Produk mana yang perlu dinaikkan harganya?', desc: 'Pricing strategy' },
    { icon: '📦', text: 'Cek stok yang menipis dan buat restock otomatis', desc: 'Agent autonomous' },
];

const TOOL_LABELS = {
    get_sales_today: { icon: '📊', label: 'Data Penjualan Hari Ini' },
    get_sales_period: { icon: '📅', label: 'Data Penjualan Periode' },
    get_top_products: { icon: '🏆', label: 'Produk Terlaris' },
    get_low_stock: { icon: '📦', label: 'Stok Menipis' },
    get_all_products: { icon: '🛍️', label: 'Daftar Produk' },
    get_product_detail: { icon: '🔍', label: 'Detail Produk' },
    get_customers: { icon: '👥', label: 'Data Pelanggan' },
    get_expenses: { icon: '💰', label: 'Data Pengeluaran' },
    get_supplies: { icon: '🏭', label: 'Data Supply' },
    update_product_price: { icon: '✏️', label: 'Update Harga Produk' },
    update_stock: { icon: '📦', label: 'Update Stok' },
    add_product: { icon: '➕', label: 'Tambah Produk' },
    add_expense: { icon: '💸', label: 'Catat Pengeluaran' },
    add_customer: { icon: '👤', label: 'Daftarkan Pelanggan' },
    add_supply: { icon: '🏭', label: 'Tambah Supply' },
    update_product: { icon: '✏️', label: 'Update Produk' },
    set_product_active: { icon: '👁️', label: 'Tampilkan/Sembunyikan Menu' },
    get_categories: { icon: '📂', label: 'Daftar Kategori' },
    add_category: { icon: '📂', label: 'Tambah Kategori' },
    generate_report: { icon: '📑', label: 'Laporan Bisnis Lengkap' },
    generate_product_image: { icon: '🎨', label: 'Buat Foto Produk AI' },
    generate_promo_image: { icon: '🎨', label: 'Buat Gambar Promo AI' },
};

const STORAGE_KEY = 'cashlo_ai_conversations';
const MAX_CONTEXT_MESSAGES = 20; // Send last 20 messages as context

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatMessageContent(text) {
    if (!text) return '';
    let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/^[•\-]\s(.+)$/gm, '<div style="display:flex;gap:8px;margin:2px 0"><span style="color:var(--color-text-muted)">•</span><span>$1</span></div>');
    formatted = formatted.replace(/\n/g, '<br/>');
    return formatted;
}

function truncateTitle(text) {
    if (!text) return 'Chat baru';
    return text.length > 40 ? text.slice(0, 40) + '...' : text;
}

function loadConversations() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveConversations(convos) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(convos));
    } catch { /* quota exceeded — silently fail */ }
}

export default function AIPage() {
    const { user, loading: authLoading } = useAuth();

    // Conversations state
    const [conversations, setConversations] = useState([]);
    const [activeConvoId, setActiveConvoId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [attachments, setAttachments] = useState([]);
    const [dragActive, setDragActive] = useState(false);
    const [historySidebarOpen, setHistorySidebarOpen] = useState(true);
    const [agentStatus, setAgentStatus] = useState(null); // 'thinking' | 'tools' | null

    const messagesEndRef = useRef(null);
    const textareaRef = useRef(null);
    const fileInputRef = useRef(null);

    const TEXT_EXTENSIONS = ['txt','csv','json','xml','md','log','js','ts','py','html','css','sql','yml','yaml','ini','env','jsx','tsx','java','c','cpp','h','rb','php','sh','bat','toml','cfg'];
    const IMAGE_TYPES = ['image/png','image/jpeg','image/gif','image/webp','image/bmp','image/svg+xml'];

    const getFileIcon = (name, type) => {
        if (IMAGE_TYPES.includes(type)) return '🖼️';
        const ext = name.split('.').pop()?.toLowerCase();
        if (['csv','xlsx','xls'].includes(ext)) return '📊';
        if (['json','xml','yml','yaml'].includes(ext)) return '📋';
        if (['pdf'].includes(ext)) return '📄';
        if (['doc','docx','txt','md'].includes(ext)) return '📝';
        if (['js','ts','py','java','cpp','rb','php','jsx','tsx'].includes(ext)) return '💻';
        if (['zip','rar','7z','tar','gz'].includes(ext)) return '📦';
        return '📎';
    };

    // ─── Load conversations from localStorage on mount ───
    useEffect(() => {
        if (!authLoading && user) {
            const saved = loadConversations();
            setConversations(saved);
        }
    }, [authLoading, user]);

    // ─── Auth redirect ───
    useEffect(() => {
        if (!authLoading && !user) {
            window.location.href = '/';
        }
    }, [user, authLoading]);

    // ─── Auto-scroll ───
    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

    // ─── Auto-resize textarea ───
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
        }
    }, [input]);

    // ─── Persist messages to conversation ───
    const persistConversation = useCallback((convoId, msgs) => {
        setConversations(prev => {
            const updated = prev.map(c =>
                c.id === convoId
                    ? { ...c, messages: msgs, updatedAt: new Date().toISOString() }
                    : c
            );
            saveConversations(updated);
            return updated;
        });
    }, []);

    // ─── Conversation management ───
    const startNewChat = () => {
        setActiveConvoId(null);
        setMessages([]);
        setInput('');
        setAttachments([]);
        textareaRef.current?.focus();
    };

    const loadConversation = (convo) => {
        setActiveConvoId(convo.id);
        // Restore messages with Date objects for timestamps
        setMessages(convo.messages.map(m => ({
            ...m,
            timestamp: new Date(m.timestamp)
        })));
        setAttachments([]);
    };

    const deleteConversation = (e, convoId) => {
        e.stopPropagation();
        setConversations(prev => {
            const updated = prev.filter(c => c.id !== convoId);
            saveConversations(updated);
            return updated;
        });
        if (activeConvoId === convoId) {
            setActiveConvoId(null);
            setMessages([]);
        }
    };

    // ─── File handling ───
    const compressImage = (file) => {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.onload = () => {
                const MAX_SIZE = 800;
                let { width, height } = img;
                if (width > height && width > MAX_SIZE) {
                    height = (height * MAX_SIZE) / width;
                    width = MAX_SIZE;
                } else if (height > MAX_SIZE) {
                    width = (width * MAX_SIZE) / height;
                    height = MAX_SIZE;
                }
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.src = URL.createObjectURL(file);
        });
    };

    const readFileAsText = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    };

    const readFileAsArrayBuffer = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    };

    // ─── Dynamic library loaders (CDN, on-demand) ───
    const loadPDFJS = async () => {
        if (window.pdfjsLib) return window.pdfjsLib;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            script.onload = () => {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                resolve(window.pdfjsLib);
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    };

    const loadSheetJS = async () => {
        if (window.XLSX) return window.XLSX;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
            script.onload = () => resolve(window.XLSX);
            script.onerror = reject;
            document.head.appendChild(script);
        });
    };

    // ─── Extract text from PDF ───
    const extractPDFText = async (file) => {
        try {
            const pdfjsLib = await loadPDFJS();
            const buffer = await readFileAsArrayBuffer(file);
            const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
            let fullText = '';
            const maxPages = Math.min(pdf.numPages, 30); // Limit to 30 pages
            for (let i = 1; i <= maxPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                const pageText = content.items.map(item => item.str).join(' ');
                fullText += `--- Halaman ${i} ---\n${pageText}\n\n`;
            }
            if (pdf.numPages > 30) {
                fullText += `\n... (${pdf.numPages - 30} halaman lagi tidak ditampilkan)`;
            }
            return fullText.trim();
        } catch (e) {
            console.warn('PDF extraction failed:', e);
            return null;
        }
    };

    // ─── Extract text from Excel ───
    const extractExcelText = async (file) => {
        try {
            const XLSX = await loadSheetJS();
            const buffer = await readFileAsArrayBuffer(file);
            const workbook = XLSX.read(buffer, { type: 'array' });
            let fullText = '';
            for (const sheetName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sheetName];
                const csv = XLSX.utils.sheet_to_csv(sheet);
                fullText += `--- Sheet: ${sheetName} ---\n${csv}\n\n`;
            }
            return fullText.trim();
        } catch (e) {
            console.warn('Excel extraction failed:', e);
            return null;
        }
    };

    const handleFileUpload = async (files) => {
        if (!files || files.length === 0) return;
        const newAttachments = [];
        for (const file of Array.from(files)) {
            const ext = file.name.split('.').pop()?.toLowerCase();

            if (IMAGE_TYPES.includes(file.type)) {
                // Image → compress and base64
                const base64 = await compressImage(file);
                newAttachments.push({ type: 'image', name: file.name, preview: base64, data: base64 });

            } else if (ext === 'pdf') {
                // PDF → extract text with pdf.js
                const text = await extractPDFText(file);
                if (text) {
                    const truncated = text.length > 15000 ? text.slice(0, 15000) + '\n... (truncated)' : text;
                    newAttachments.push({ type: 'text', name: file.name, preview: null, data: truncated });
                } else {
                    newAttachments.push({ type: 'unsupported', name: file.name, preview: null, data: null });
                }

            } else if (['xlsx', 'xls'].includes(ext)) {
                // Excel → extract as CSV with SheetJS
                const text = await extractExcelText(file);
                if (text) {
                    const truncated = text.length > 15000 ? text.slice(0, 15000) + '\n... (truncated)' : text;
                    newAttachments.push({ type: 'text', name: file.name, preview: null, data: truncated });
                } else {
                    newAttachments.push({ type: 'unsupported', name: file.name, preview: null, data: null });
                }

            } else if (TEXT_EXTENSIONS.includes(ext) || file.type.startsWith('text/')) {
                // Plain text files
                try {
                    const text = await readFileAsText(file);
                    const truncated = text.length > 15000 ? text.slice(0, 15000) + '\n... (truncated)' : text;
                    newAttachments.push({ type: 'text', name: file.name, preview: null, data: truncated });
                } catch {
                    newAttachments.push({ type: 'unsupported', name: file.name, preview: null, data: null });
                }

            } else {
                // Truly unsupported
                newAttachments.push({ type: 'unsupported', name: file.name, preview: null, data: null });
            }
        }
        setAttachments(prev => [...prev, ...newAttachments]);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragActive(false);
        handleFileUpload(e.dataTransfer.files);
    };

    const removeAttachment = (idx) => {
        setAttachments(prev => prev.filter((_, i) => i !== idx));
    };

    // ─── Send message with context window ───
    const sendMessage = async (overrideText) => {
        const text = overrideText || input.trim();
        if ((!text && attachments.length === 0) || loading) return;

        const currentAttachments = [...attachments];

        const userMessage = {
            role: 'user',
            content: text,
            attachments: currentAttachments.map(a => ({ type: a.type, name: a.name, preview: a.type === 'image' ? a.preview : null })),
            timestamp: new Date().toISOString()
        };

        // Create or use existing conversation
        let convoId = activeConvoId;
        let isNewConvo = false;
        if (!convoId) {
            convoId = generateId();
            isNewConvo = true;
            const newConvo = {
                id: convoId,
                title: 'Memuat...',
                messages: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            setConversations(prev => {
                const updated = [newConvo, ...prev];
                saveConversations(updated);
                return updated;
            });
            setActiveConvoId(convoId);
        }

        const updatedMessages = [...messages, { ...userMessage, timestamp: new Date() }];
        setMessages(updatedMessages);
        setInput('');
        setAttachments([]);
        setLoading(true);

        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        // Build full message with file content
        let fullMessage = text || '';
        const imageData = currentAttachments.find(a => a.type === 'image')?.data;
        for (const att of currentAttachments) {
            if (att.type === 'text' && att.data) {
                fullMessage += `\n\n📎 File: ${att.name}\n\`\`\`\n${att.data}\n\`\`\``;
            } else if (att.type === 'unsupported') {
                fullMessage += `\n\n📎 File terlampir: ${att.name} (format tidak bisa dibaca langsung)`;
            }
        }

        // Build context window — last N messages for AI
        const contextMessages = messages.slice(-MAX_CONTEXT_MESSAGES).map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content || ''
        }));
        // Add current user message
        contextMessages.push({ role: 'user', content: fullMessage });

        try {
            setAgentStatus('thinking');

            // Use Agent API with tool-calling loop
            const response = await fetch('/api/ai-agent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: fullMessage,
                    userId: user?.id || user?.owner_id,
                    contextMessages: contextMessages
                })
            });

            const data = await response.json();
            const aiMsg = {
                role: 'assistant',
                content: data.error ? `Error: ${data.error}` : data.response,
                toolsUsed: data.toolsUsed || [],
                pendingActions: data.pendingActions || [],
                generatedImages: data.images || [],
                timestamp: new Date()
            };

            const finalMessages = [...updatedMessages, aiMsg];
            setMessages(finalMessages);

            // Generate title for new conversations from the first message
            if (isNewConvo && text) {
                const titleText = text.length > 40 ? text.slice(0, 40) + '...' : text;
                // Try to generate a smart title using the chat API
                try {
                    const titleRes = await fetch('/api/ai-chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            message: text,
                            userId: user?.id || user?.owner_id,
                            generateTitle: true
                        })
                    });
                    const titleData = await titleRes.json();
                    if (titleData.title) {
                        setConversations(prev => {
                            const updated = prev.map(c =>
                                c.id === convoId ? { ...c, title: titleData.title } : c
                            );
                            saveConversations(updated);
                            return updated;
                        });
                    }
                } catch {
                    // Fallback title
                    setConversations(prev => {
                        const updated = prev.map(c =>
                            c.id === convoId ? { ...c, title: titleText } : c
                        );
                        saveConversations(updated);
                        return updated;
                    });
                }
            }

            // Persist to localStorage
            const persistMsgs = finalMessages.map(m => ({
                role: m.role,
                content: m.content,
                toolsUsed: m.toolsUsed?.map(t => ({ tool: t.tool, confirmed: t.confirmed })),
                pendingActions: m.pendingActions,
                attachments: m.attachments?.map(a => ({ type: a.type, name: a.name })),
                timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp
            }));
            persistConversation(convoId, persistMsgs);

        } catch {
            const errMsg = {
                role: 'assistant',
                content: 'Maaf, terjadi kesalahan koneksi. Coba lagi.',
                timestamp: new Date()
            };
            const finalMessages = [...updatedMessages, errMsg];
            setMessages(finalMessages);
        } finally {
            setLoading(false);
            setAgentStatus(null);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    if (authLoading) return null;

    const hasMessages = messages.length > 0;

    // Group conversations by date
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);

    const groupedConvos = {
        today: conversations.filter(c => new Date(c.updatedAt).toDateString() === today.toDateString()),
        yesterday: conversations.filter(c => new Date(c.updatedAt).toDateString() === yesterday.toDateString()),
        week: conversations.filter(c => {
            const d = new Date(c.updatedAt);
            return d > weekAgo && d.toDateString() !== today.toDateString() && d.toDateString() !== yesterday.toDateString();
        }),
        older: conversations.filter(c => new Date(c.updatedAt) <= weekAgo)
    };

    return (
        <div className="app-container">
            <Head>
                <title>Cashlo AI | Business Intelligence Assistant</title>
            </Head>

            <Sidebar activePage="ai" userRole={user?.role} />

            <main className="main-content ai-page">
                {/* ─── History Sidebar ─── */}
                <div className={`ai-history-sidebar ${historySidebarOpen ? 'open' : ''}`}>
                    <div className="ai-history-header">
                        <button className="ai-new-chat-btn" onClick={startNewChat}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            Chat Baru
                        </button>
                        <button className="ai-history-toggle" onClick={() => setHistorySidebarOpen(false)} title="Tutup sidebar">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <line x1="9" y1="3" x2="9" y2="21" />
                            </svg>
                        </button>
                    </div>

                    <div className="ai-history-list">
                        {conversations.length === 0 && (
                            <div className="ai-history-empty">Belum ada riwayat chat</div>
                        )}

                        {groupedConvos.today.length > 0 && (
                            <>
                                <div className="ai-history-section">Hari Ini</div>
                                {groupedConvos.today.map(c => (
                                    <button
                                        key={c.id}
                                        className={`ai-history-item ${activeConvoId === c.id ? 'active' : ''}`}
                                        onClick={() => loadConversation(c)}
                                    >
                                        <span className="ai-history-item-title">{c.title}</span>
                                        <button className="ai-history-item-delete" onClick={(e) => deleteConversation(e, c.id)}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="3 6 5 6 21 6" />
                                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                            </svg>
                                        </button>
                                    </button>
                                ))}
                            </>
                        )}

                        {groupedConvos.yesterday.length > 0 && (
                            <>
                                <div className="ai-history-section">Kemarin</div>
                                {groupedConvos.yesterday.map(c => (
                                    <button
                                        key={c.id}
                                        className={`ai-history-item ${activeConvoId === c.id ? 'active' : ''}`}
                                        onClick={() => loadConversation(c)}
                                    >
                                        <span className="ai-history-item-title">{c.title}</span>
                                        <button className="ai-history-item-delete" onClick={(e) => deleteConversation(e, c.id)}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="3 6 5 6 21 6" />
                                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                            </svg>
                                        </button>
                                    </button>
                                ))}
                            </>
                        )}

                        {groupedConvos.week.length > 0 && (
                            <>
                                <div className="ai-history-section">7 Hari Terakhir</div>
                                {groupedConvos.week.map(c => (
                                    <button
                                        key={c.id}
                                        className={`ai-history-item ${activeConvoId === c.id ? 'active' : ''}`}
                                        onClick={() => loadConversation(c)}
                                    >
                                        <span className="ai-history-item-title">{c.title}</span>
                                        <button className="ai-history-item-delete" onClick={(e) => deleteConversation(e, c.id)}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="3 6 5 6 21 6" />
                                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                            </svg>
                                        </button>
                                    </button>
                                ))}
                            </>
                        )}

                        {groupedConvos.older.length > 0 && (
                            <>
                                <div className="ai-history-section">Lebih Lama</div>
                                {groupedConvos.older.map(c => (
                                    <button
                                        key={c.id}
                                        className={`ai-history-item ${activeConvoId === c.id ? 'active' : ''}`}
                                        onClick={() => loadConversation(c)}
                                    >
                                        <span className="ai-history-item-title">{c.title}</span>
                                        <button className="ai-history-item-delete" onClick={(e) => deleteConversation(e, c.id)}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="3 6 5 6 21 6" />
                                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                            </svg>
                                        </button>
                                    </button>
                                ))}
                            </>
                        )}
                    </div>
                </div>

                {/* ─── Main Chat Area ─── */}
                <div className="ai-main-area">
                    {/* Top bar with toggle */}
                    {!historySidebarOpen && (
                        <div className="ai-topbar">
                            <button className="ai-history-toggle" onClick={() => setHistorySidebarOpen(true)} title="Buka sidebar">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="3" width="18" height="18" rx="2" />
                                    <line x1="9" y1="3" x2="9" y2="21" />
                                </svg>
                            </button>
                            <button className="ai-new-chat-btn" onClick={startNewChat}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="12" y1="5" x2="12" y2="19" />
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                                Chat Baru
                            </button>
                        </div>
                    )}

                    {/* Chat Area */}
                    <div className="ai-chat-area"
                        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                        onDragLeave={() => setDragActive(false)}
                        onDrop={handleDrop}
                    >
                        {dragActive && (
                            <div className="ai-drag-overlay">
                                <div className="ai-drag-content">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="17 8 12 3 7 8" />
                                        <line x1="12" y1="3" x2="12" y2="15" />
                                    </svg>
                                    <span>Drop file di sini</span>
                                </div>
                            </div>
                        )}

                        {/* Welcome Screen */}
                        {!hasMessages && (
                            <div className="ai-welcome">
                                <div className="ai-logo-container">
                                    <div className="ai-logo">
                                        <span className="ai-logo-letter">C</span>
                                        <div className="ai-logo-sparkle ai-sparkle-1">✦</div>
                                        <div className="ai-logo-sparkle ai-sparkle-2">✦</div>
                                        <div className="ai-logo-sparkle ai-sparkle-3">✦</div>
                                    </div>
                                </div>
                                <h1 className="ai-welcome-title">Cashlo AI Agent</h1>
                                <p className="ai-welcome-subtitle">Autonomous Business Agent • Powered by Gemma 4</p>

                                <div className="ai-suggestions">
                                    {SUGGESTED_PROMPTS.map((prompt, idx) => (
                                        <button
                                            key={idx}
                                            className="ai-suggestion-card"
                                            onClick={() => sendMessage(prompt.text)}
                                        >
                                            <span className="ai-suggestion-icon">{prompt.icon}</span>
                                            <div className="ai-suggestion-text">
                                                <div className="ai-suggestion-title">{prompt.text}</div>
                                                <div className="ai-suggestion-desc">{prompt.desc}</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Messages */}
                        {hasMessages && (
                            <div className="ai-messages">
                                {messages.map((msg, idx) => (
                                    <div key={idx} className={`ai-message ai-message-${msg.role}`}>
                                        <div className="ai-message-avatar">
                                            {msg.role === 'assistant' ? (
                                                <div className="ai-avatar-bot">C</div>
                                            ) : (
                                                <div className="ai-avatar-user">
                                                    {user?.username?.[0]?.toUpperCase() || 'U'}
                                                </div>
                                            )}
                                        </div>
                                        <div className="ai-message-content">
                                            <div className="ai-message-header">
                                                <span className="ai-message-name">
                                                    {msg.role === 'assistant' ? 'Cashlo AI' : (user?.username || 'Anda')}
                                                </span>
                                                <span className="ai-message-time">
                                                    {(msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp))
                                                        .toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            {msg.attachments && msg.attachments.length > 0 && (
                                                <div className="ai-message-attachments">
                                                    {msg.attachments.map((att, aidx) => (
                                                        att.type === 'image' && att.preview ? (
                                                            <div key={aidx} className="ai-message-image">
                                                                <img src={att.preview} alt={att.name} />
                                                            </div>
                                                        ) : (
                                                            <div key={aidx} className="ai-file-badge">
                                                                <span className="ai-file-badge-icon">{getFileIcon(att.name, '')}</span>
                                                                <span className="ai-file-badge-name">{att.name}</span>
                                                            </div>
                                                        )
                                                    ))}
                                                </div>
                                            )}
                                            {/* Tool usage cards */}
                                            {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                                                <div className="ai-tools-used">
                                                    {msg.toolsUsed.map((t, tidx) => {
                                                        const label = TOOL_LABELS[t.tool] || { icon: '🔧', label: t.tool };
                                                        return (
                                                            <div key={tidx} className={`ai-tool-card ${t.confirmed ? 'executed' : 'pending'}`}>
                                                                <span className="ai-tool-icon">{label.icon}</span>
                                                                <span className="ai-tool-label">{label.label}</span>
                                                                <span className={`ai-tool-status ${t.confirmed ? 'done' : 'wait'}`}>
                                                                    {t.confirmed ? '✓' : '⏳'}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            <div
                                                className="ai-message-text"
                                                dangerouslySetInnerHTML={{ __html: formatMessageContent(msg.content) }}
                                            />
                                            {/* AI-generated images (download-ready) */}
                                            {msg.generatedImages && msg.generatedImages.length > 0 && (
                                                <div className="ai-generated-images">
                                                    {msg.generatedImages.map((img, gidx) => (
                                                        <div key={gidx} className="ai-generated-image">
                                                            <img src={img} alt={`AI generated ${gidx + 1}`} />
                                                            <a href={img} download={`cashlo-ai-${Date.now()}-${gidx + 1}.png`} className="btn btn-sm btn-outline">
                                                                ⬇️ Download
                                                            </a>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {/* Pending action cards */}
                                            {msg.pendingActions && msg.pendingActions.length > 0 && (
                                                <div className="ai-pending-actions">
                                                    {msg.pendingActions.map((action, aidx) => {
                                                        const label = TOOL_LABELS[action.tool] || { icon: '⚡', label: action.tool };
                                                        return (
                                                            <div key={aidx} className="ai-action-card">
                                                                <div className="ai-action-header">
                                                                    <span className="ai-action-icon">{label.icon}</span>
                                                                    <span className="ai-action-title">{label.label}</span>
                                                                    <span className="ai-action-badge">Perlu Konfirmasi</span>
                                                                </div>
                                                                <div className="ai-action-params">
                                                                    {Object.entries(action.params || {}).map(([k, v]) => (
                                                                        <div key={k} className="ai-action-param">
                                                                            <span className="ai-param-key">{k}:</span>
                                                                            <span className="ai-param-value">{typeof v === 'number' ? v.toLocaleString('id-ID') : String(v)}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                <div className="ai-action-buttons">
                                                                    <button
                                                                        className="ai-action-approve"
                                                                        onClick={async () => {
                                                                            try {
                                                                                const res = await fetch('/api/ai-agent', {
                                                                                    method: 'POST',
                                                                                    headers: { 'Content-Type': 'application/json' },
                                                                                    body: JSON.stringify({
                                                                                        userId: user?.id || user?.owner_id,
                                                                                        confirmAction: { tool: action.tool, params: action.params }
                                                                                    })
                                                                                });
                                                                                const result = await res.json();
                                                                                // Add result message and remove pending action
                                                                                setMessages(prev => {
                                                                                    const updated = [...prev];
                                                                                    // Remove this pending action from the message
                                                                                    if (updated[idx]?.pendingActions) {
                                                                                        updated[idx] = {
                                                                                            ...updated[idx],
                                                                                            pendingActions: updated[idx].pendingActions.filter((_, i) => i !== aidx)
                                                                                        };
                                                                                    }
                                                                                    // Add confirmation result
                                                                                    updated.push({
                                                                                        role: 'assistant',
                                                                                        content: `✅ ${result.response || result.actionResult?.message || 'Aksi berhasil dijalankan'}`,
                                                                                        toolsUsed: [{ tool: action.tool, confirmed: true }],
                                                                                        generatedImages: result.images || [],
                                                                                        timestamp: new Date()
                                                                                    });
                                                                                    return updated;
                                                                                });
                                                                            } catch {
                                                                                setMessages(prev => [...prev, {
                                                                                    role: 'assistant',
                                                                                    content: '❌ Gagal menjalankan aksi. Coba lagi.',
                                                                                    timestamp: new Date()
                                                                                }]);
                                                                            }
                                                                        }}
                                                                    >
                                                                        ✓ Setuju
                                                                    </button>
                                                                    <button
                                                                        className="ai-action-reject"
                                                                        onClick={() => {
                                                                            setMessages(prev => {
                                                                                const updated = [...prev];
                                                                                if (updated[idx]?.pendingActions) {
                                                                                    updated[idx] = {
                                                                                        ...updated[idx],
                                                                                        pendingActions: updated[idx].pendingActions.filter((_, i) => i !== aidx)
                                                                                    };
                                                                                }
                                                                                updated.push({
                                                                                    role: 'assistant',
                                                                                    content: `⛔ Aksi "${label.label}" dibatalkan oleh user.`,
                                                                                    timestamp: new Date()
                                                                                });
                                                                                return updated;
                                                                            });
                                                                        }}
                                                                    >
                                                                        ✕ Tolak
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {loading && (
                                    <div className="ai-message ai-message-assistant">
                                        <div className="ai-message-avatar">
                                            <div className="ai-avatar-bot">C</div>
                                        </div>
                                        <div className="ai-message-content">
                                            <div className="ai-message-header">
                                                <span className="ai-message-name">Cashlo AI Agent</span>
                                            </div>
                                            <div className="ai-agent-status">
                                                <div className="ai-agent-pulse"></div>
                                                <span>{agentStatus === 'tools' ? '🔍 Mengambil data...' : '🧠 Menganalisis...'}</span>
                                            </div>
                                            <div className="ai-typing-indicator">
                                                <div className="ai-typing-dot"></div>
                                                <div className="ai-typing-dot"></div>
                                                <div className="ai-typing-dot"></div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div ref={messagesEndRef} />
                            </div>
                        )}
                    </div>

                    {/* Input Bar */}
                    <div className="ai-input-wrapper">
                        <div className="ai-input-container">
                            {attachments.length > 0 && (
                                <div className="ai-image-preview-bar">
                                    {attachments.map((att, idx) => (
                                        att.type === 'image' && att.preview ? (
                                            <div key={idx} className="ai-image-thumb">
                                                <img src={att.preview} alt={att.name} />
                                                <button className="ai-image-remove" onClick={() => removeAttachment(idx)}>×</button>
                                            </div>
                                        ) : (
                                            <div key={idx} className="ai-file-preview-chip">
                                                <span>{getFileIcon(att.name, '')}</span>
                                                <span className="ai-file-chip-name">{att.name}</span>
                                                <button className="ai-file-chip-remove" onClick={() => removeAttachment(idx)}>×</button>
                                            </div>
                                        )
                                    ))}
                                </div>
                            )}

                            <div className="ai-input-row">
                                <button
                                    className="ai-input-action"
                                    onClick={() => fileInputRef.current?.click()}
                                    title="Upload file (gambar, teks, CSV, JSON, dll)"
                                >
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                                    </svg>
                                </button>

                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    style={{ display: 'none' }}
                                    onChange={(e) => { handleFileUpload(e.target.files); e.target.value = ''; }}
                                />

                                <textarea
                                    ref={textareaRef}
                                    className="ai-textarea"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Tanya tentang bisnis Anda..."
                                    rows={1}
                                    disabled={loading}
                                />

                                <button
                                    className={`ai-send-btn ${(input.trim() || attachments.length > 0) && !loading ? 'active' : ''}`}
                                    onClick={() => sendMessage()}
                                    disabled={loading || (!input.trim() && attachments.length === 0)}
                                >
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="22" y1="2" x2="11" y2="13" />
                                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                                    </svg>
                                </button>
                            </div>

                            <div className="ai-input-footer">
                                <span>Gemma 4 · Context: {messages.length} pesan</span>
                                {hasMessages && (
                                    <button className="ai-clear-btn" onClick={startNewChat}>
                                        Chat baru
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

export const getServerSideProps = async () => { return { props: {} }; };
