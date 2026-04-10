import { useState, useRef, useEffect, useCallback } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Head from 'next/head';
import { useAuth } from '@/hooks/useAuth';

const SUGGESTED_PROMPTS = [
    { icon: '📊', text: 'Bagaimana performa bisnis hari ini?', desc: 'Analisis real-time' },
    { icon: '📈', text: 'Produk apa yang paling laris minggu ini?', desc: 'Tren penjualan' },
    { icon: '💡', text: 'Beri saran strategi untuk meningkatkan profit', desc: 'Business strategy' },
    { icon: '📦', text: 'Produk apa yang perlu di-restock?', desc: 'Inventory check' },
];

function formatMessageContent(text) {
    if (!text) return '';
    // Bold
    let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Bullet points
    formatted = formatted.replace(/^[•\-]\s(.+)$/gm, '<div style="display:flex;gap:8px;margin:2px 0"><span style="color:var(--color-text-muted)">•</span><span>$1</span></div>');
    // Line breaks
    formatted = formatted.replace(/\n/g, '<br/>');
    return formatted;
}

export default function AIPage() {
    const { user, loading: authLoading } = useAuth();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [imagePreview, setImagePreview] = useState(null);
    const [imageBase64, setImageBase64] = useState(null);
    const [dragActive, setDragActive] = useState(false);
    const messagesEndRef = useRef(null);
    const textareaRef = useRef(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (!authLoading && !user) {
            window.location.href = '/';
        }
    }, [user, authLoading]);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
        }
    }, [input]);

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

    const handleImageUpload = async (file) => {
        if (!file || !file.type.startsWith('image/')) return;
        const base64 = await compressImage(file);
        setImagePreview(base64);
        setImageBase64(base64);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragActive(false);
        const file = e.dataTransfer.files[0];
        handleImageUpload(file);
    };

    const removeImage = () => {
        setImagePreview(null);
        setImageBase64(null);
    };

    const sendMessage = async (overrideText) => {
        const text = overrideText || input.trim();
        if ((!text && !imageBase64) || loading) return;

        const userMessage = {
            role: 'user',
            content: text,
            image: imagePreview,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setImagePreview(null);
        setImageBase64(null);
        setLoading(true);

        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        try {
            const response = await fetch('/api/ai-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    userId: user?.id || user?.owner_id,
                    image: imageBase64 || undefined
                })
            });

            const data = await response.json();

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: data.error ? `Error: ${data.error}` : data.response,
                timestamp: new Date()
            }]);
        } catch {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Maaf, terjadi kesalahan koneksi. Coba lagi.',
                timestamp: new Date()
            }]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const clearChat = () => {
        setMessages([]);
    };

    if (authLoading) return null;

    const hasMessages = messages.length > 0;

    return (
        <div className="app-container">
            <Head>
                <title>Cashlo AI | Business Intelligence Assistant</title>
            </Head>

            <Sidebar activePage="ai" userRole={user?.role} />

            <main className="main-content ai-page">
                {/* Chat Area */}
                <div className="ai-chat-area"
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={handleDrop}
                >
                    {/* Drag overlay */}
                    {dragActive && (
                        <div className="ai-drag-overlay">
                            <div className="ai-drag-content">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="17 8 12 3 7 8" />
                                    <line x1="12" y1="3" x2="12" y2="15" />
                                </svg>
                                <span>Drop gambar di sini</span>
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
                            <h1 className="ai-welcome-title">Cashlo AI</h1>
                            <p className="ai-welcome-subtitle">Business Intelligence Assistant powered by Gemma 4</p>

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
                                                {msg.timestamp?.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        {msg.image && (
                                            <div className="ai-message-image">
                                                <img src={msg.image} alt="Uploaded" />
                                            </div>
                                        )}
                                        <div
                                            className="ai-message-text"
                                            dangerouslySetInnerHTML={{ __html: formatMessageContent(msg.content) }}
                                        />
                                    </div>
                                </div>
                            ))}

                            {/* AI Typing Indicator */}
                            {loading && (
                                <div className="ai-message ai-message-assistant">
                                    <div className="ai-message-avatar">
                                        <div className="ai-avatar-bot">C</div>
                                    </div>
                                    <div className="ai-message-content">
                                        <div className="ai-message-header">
                                            <span className="ai-message-name">Cashlo AI</span>
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
                        {/* Image preview */}
                        {imagePreview && (
                            <div className="ai-image-preview-bar">
                                <div className="ai-image-thumb">
                                    <img src={imagePreview} alt="Preview" />
                                    <button className="ai-image-remove" onClick={removeImage}>×</button>
                                </div>
                            </div>
                        )}

                        <div className="ai-input-row">
                            {/* Attachment button */}
                            <button
                                className="ai-input-action"
                                onClick={() => fileInputRef.current?.click()}
                                title="Upload gambar"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                    <circle cx="8.5" cy="8.5" r="1.5" />
                                    <polyline points="21 15 16 10 5 21" />
                                </svg>
                            </button>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={(e) => handleImageUpload(e.target.files[0])}
                            />

                            {/* Text input */}
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

                            {/* Send button */}
                            <button
                                className={`ai-send-btn ${(input.trim() || imageBase64) && !loading ? 'active' : ''}`}
                                onClick={() => sendMessage()}
                                disabled={loading || (!input.trim() && !imageBase64)}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="22" y1="2" x2="11" y2="13" />
                                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                                </svg>
                            </button>
                        </div>

                        <div className="ai-input-footer">
                            <span>Gemma 4 · Google Open Source AI</span>
                            {hasMessages && (
                                <button className="ai-clear-btn" onClick={clearChat}>
                                    Hapus percakapan
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

export const getServerSideProps = async () => { return { props: {} }; };
