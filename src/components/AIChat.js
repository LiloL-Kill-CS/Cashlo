import { useState, useRef, useEffect } from 'react';

export default function AIChat({ userId }) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { role: 'assistant', content: 'Halo! Saya asisten AI Cashlo. Tanya apa saja tentang bisnis Anda! Contoh:\n• "Berapa profit hari ini?"\n• "Produk apa yang paling laris?"\n• "Saran restock untuk minggu ini"' }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const sendMessage = async () => {
        if (!input.trim() || loading) return;

        const userMessage = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setLoading(true);

        try {
            const response = await fetch('/api/ai-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: userMessage, userId })
            });

            const data = await response.json();

            if (data.error) {
                setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}` }]);
            } else {
                setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
            }
        } catch (error) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Maaf, terjadi kesalahan. Coba lagi nanti.' }]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <>
            {/* Floating Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    position: 'fixed',
                    bottom: '20px',
                    right: '20px',
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 20px rgba(102, 126, 234, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '24px',
                    color: 'white',
                    zIndex: 1000,
                    transition: 'transform 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
                onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
            >
                {isOpen ? '✕' : '🤖'}
            </button>

            {/* Chat Window */}
            {isOpen && (
                <div style={{
                    position: 'fixed',
                    bottom: '90px',
                    right: '20px',
                    width: '380px',
                    maxWidth: 'calc(100vw - 40px)',
                    height: '500px',
                    maxHeight: 'calc(100vh - 120px)',
                    background: 'var(--color-bg-primary)',
                    borderRadius: '16px',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                    display: 'flex',
                    flexDirection: 'column',
                    zIndex: 999,
                    border: '1px solid var(--color-border)',
                    overflow: 'hidden'
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '16px',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: 'white'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '24px' }}>🤖</span>
                            <div>
                                <div style={{ fontWeight: 'bold' }}>AI Business Assistant</div>
                                <div style={{ fontSize: '12px', opacity: 0.9 }}>Powered by Gemini</div>
                            </div>
                        </div>
                    </div>

                    {/* Messages */}
                    <div style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                    }}>
                        {messages.map((msg, idx) => (
                            <div key={idx} style={{
                                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                maxWidth: '85%'
                            }}>
                                <div style={{
                                    padding: '10px 14px',
                                    borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                    background: msg.role === 'user'
                                        ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                                        : 'var(--color-bg-secondary)',
                                    color: msg.role === 'user' ? 'white' : 'var(--color-text-primary)',
                                    fontSize: '14px',
                                    lineHeight: '1.5',
                                    whiteSpace: 'pre-wrap'
                                }}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div style={{ alignSelf: 'flex-start' }}>
                                <div style={{
                                    padding: '10px 14px',
                                    borderRadius: '16px 16px 16px 4px',
                                    background: 'var(--color-bg-secondary)',
                                    fontSize: '14px'
                                }}>
                                    <span className="loading-dots">Sedang berpikir...</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div style={{
                        padding: '12px',
                        borderTop: '1px solid var(--color-border)',
                        display: 'flex',
                        gap: '8px'
                    }}>
                        <input
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="Tanya tentang bisnis Anda..."
                            style={{
                                flex: 1,
                                padding: '10px 14px',
                                borderRadius: '20px',
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-bg-secondary)',
                                color: 'var(--color-text-primary)',
                                fontSize: '14px',
                                outline: 'none'
                            }}
                            disabled={loading}
                        />
                        <button
                            onClick={sendMessage}
                            disabled={loading || !input.trim()}
                            style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                border: 'none',
                                background: loading || !input.trim()
                                    ? 'var(--color-bg-tertiary)'
                                    : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                color: 'white',
                                cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '18px'
                            }}
                        >
                            ➤
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
