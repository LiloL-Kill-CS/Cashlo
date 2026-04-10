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
    const [attachments, setAttachments] = useState([]); // { type, name, preview, data }
    const [dragActive, setDragActive] = useState(false);
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

    const readFileAsText = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
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
            } else if (TEXT_EXTENSIONS.includes(ext) || file.type.startsWith('text/')) {
                // Text-based file → read content
                try {
                    const text = await readFileAsText(file);
                    const truncated = text.length > 15000 ? text.slice(0, 15000) + '\n... (truncated)' : text;
                    newAttachments.push({ type: 'text', name: file.name, preview: null, data: truncated });
                } catch {
                    newAttachments.push({ type: 'unsupported', name: file.name, preview: null, data: null });
                }
            } else {
                // Binary/unsupported → just show name
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

    const sendMessage = async (overrideText) => {
        const text = overrideText || input.trim();
        if ((!text && attachments.length === 0) || loading) return;

        const currentAttachments = [...attachments];

        // Build user message for display
        const userMessage = {
            role: 'user',
            content: text,
            attachments: currentAttachments,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setAttachments([]);
        setLoading(true);

        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        // Build message for AI — append file content as context
        let fullMessage = text || '';
        const imageData = currentAttachments.find(a => a.type === 'image')?.data;

        for (const att of currentAttachments) {
            if (att.type === 'text' && att.data) {
                fullMessage += `\n\n📎 File: ${att.name}\n\`\`\`\n${att.data}\n\`\`\``;
            } else if (att.type === 'unsupported') {
                fullMessage += `\n\n📎 File terlampir: ${att.name} (format tidak bisa dibaca langsung)`;
            }
        }

        try {
            const response = await fetch('/api/ai-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: fullMessage,
                    userId: user?.id || user?.owner_id,
                    image: imageData || undefined
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
                        {/* File preview bar */}
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
                            {/* Attachment button */}
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
