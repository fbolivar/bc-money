import { useState, useEffect, useRef, useCallback } from 'react';
import { Bot, Send, Sparkles, AlertCircle, RefreshCw, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import './AsistenteIA.css';

const AI_ENDPOINT = '/api/ai-assistant';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

interface FinancialContext {
    totalIncomeThisMonth: number;
    totalExpensesThisMonth: number;
    activeBudgetsCount: number;
    totalActiveDebts: number;
    totalAccountBalance: number;
    currency: string;
}

const SUGGESTED_QUESTIONS = [
    '¿Cómo está mi presupuesto este mes?',
    '¿Cuánto debo en total?',
    '¿Qué me recomiendas para ahorrar más?',
    'Explícame cómo funciona el IVA en Colombia',
    '¿Cuándo debo declarar renta?',
];

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

function TypingIndicator() {
    return (
        <div className="ai-message ai-message--assistant">
            <div className="ai-avatar ai-avatar--assistant">
                <Bot size={16} />
            </div>
            <div className="ai-bubble ai-bubble--assistant ai-bubble--typing">
                <span className="ai-dot" />
                <span className="ai-dot" />
                <span className="ai-dot" />
            </div>
        </div>
    );
}

export function AsistenteIA() {
    const { user } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [context, setContext] = useState<FinancialContext | null>(null);
    const [contextLoading, setContextLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [apiKeyMissing, setApiKeyMissing] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading, scrollToBottom]);

    useEffect(() => {
        if (!user) return;

        async function fetchFinancialContext() {
            setContextLoading(true);
            try {
                const now = new Date();
                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
                const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

                const [incomeRes, expenseRes, budgetsRes, debtsRes, accountsRes] = await Promise.all([
                    supabase
                        .from('transactions')
                        .select('amount')
                        .eq('user_id', user.id)
                        .eq('type', 'income')
                        .gte('date', monthStart)
                        .lte('date', monthEnd),
                    supabase
                        .from('transactions')
                        .select('amount')
                        .eq('user_id', user.id)
                        .eq('type', 'expense')
                        .gte('date', monthStart)
                        .lte('date', monthEnd),
                    supabase
                        .from('budgets')
                        .select('id', { count: 'exact' })
                        .eq('user_id', user.id),
                    supabase
                        .from('debts')
                        .select('remaining_amount')
                        .eq('user_id', user.id)
                        .gt('remaining_amount', 0),
                    supabase
                        .from('accounts')
                        .select('balance')
                        .eq('user_id', user.id),
                ]);

                const totalIncome = (incomeRes.data ?? []).reduce((sum, t) => sum + (t.amount ?? 0), 0);
                const totalExpenses = (expenseRes.data ?? []).reduce((sum, t) => sum + (t.amount ?? 0), 0);
                const activeBudgets = budgetsRes.count ?? 0;
                const totalDebts = (debtsRes.data ?? []).reduce((sum, d) => sum + (d.remaining_amount ?? 0), 0);
                const totalBalance = (accountsRes.data ?? []).reduce((sum, a) => sum + (a.balance ?? 0), 0);

                setContext({
                    totalIncomeThisMonth: totalIncome,
                    totalExpensesThisMonth: totalExpenses,
                    activeBudgetsCount: activeBudgets,
                    totalActiveDebts: totalDebts,
                    totalAccountBalance: totalBalance,
                    currency: 'COP',
                });
            } catch {
                // Context fetch failed silently — AI can still respond without it
                setContext(null);
            } finally {
                setContextLoading(false);
            }
        }

        fetchFinancialContext();
    }, [user]);

    const sendMessage = useCallback(async (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || isLoading) return;

        setError(null);
        setApiKeyMissing(false);

        const userMsg: Message = {
            id: `${Date.now()}-user`,
            role: 'user',
            content: trimmed,
            timestamp: new Date(),
        };

        const updatedMessages = [...messages, userMsg];
        setMessages(updatedMessages);
        setInput('');
        setIsLoading(true);

        const apiMessages = updatedMessages.map(m => ({ role: m.role, content: m.content }));

        try {
            const res = await fetch(AI_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: apiMessages,
                    context: context
                        ? {
                              totalIncomeThisMonth: context.totalIncomeThisMonth,
                              totalExpensesThisMonth: context.totalExpensesThisMonth,
                              activeBudgetsCount: context.activeBudgetsCount,
                              totalActiveDebts: context.totalActiveDebts,
                              totalAccountBalance: context.totalAccountBalance,
                              currency: context.currency,
                          }
                        : null,
                }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: '' }));
                const msg: string = errData.error ?? '';
                if (res.status === 500 && msg.includes('ANTHROPIC_API_KEY')) {
                    setApiKeyMissing(true);
                } else {
                    setError('Ocurrió un error al comunicarse con el asistente. Por favor intenta de nuevo.');
                }
                return;
            }

            const data = await res.json();
            const replyContent: string = data.content ?? data.message ?? '';

            if (!replyContent) {
                setError('La respuesta del asistente está vacía. Por favor intenta de nuevo.');
                return;
            }

            const assistantMsg: Message = {
                id: `${Date.now()}-assistant`,
                role: 'assistant',
                content: replyContent,
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, assistantMsg]);
        } catch {
            setError('No se pudo conectar con el asistente. Verifica tu conexión e intenta de nuevo.');
        } finally {
            setIsLoading(false);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [messages, context, isLoading]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(input);
        }
    };

    const handleSuggestedQuestion = (question: string) => {
        sendMessage(question);
    };

    const handleRetry = () => {
        setError(null);
        setApiKeyMissing(false);
    };

    const isEmpty = messages.length === 0;

    return (
        <div className="ai-page">
            {/* Header */}
            <div className="ai-header">
                <div className="ai-header__icon">
                    <Bot size={22} />
                </div>
                <div className="ai-header__info">
                    <h1 className="ai-header__title">BC Asesor</h1>
                    <p className="ai-header__subtitle">Asistente financiero con IA</p>
                </div>
                <div className={`ai-status-badge ${contextLoading ? 'ai-status-badge--loading' : 'ai-status-badge--online'}`}>
                    <span className="ai-status-dot" />
                    {contextLoading ? 'Cargando...' : 'En línea'}
                </div>
            </div>

            {/* Context Summary Strip */}
            {!contextLoading && context && (
                <div className="ai-context-strip">
                    <Sparkles size={13} />
                    <span>Contexto financiero cargado &mdash;</span>
                    <span>Ingresos: <strong>{formatCurrency(context.totalIncomeThisMonth)}</strong></span>
                    <span className="ai-context-separator">·</span>
                    <span>Gastos: <strong>{formatCurrency(context.totalExpensesThisMonth)}</strong></span>
                    <span className="ai-context-separator">·</span>
                    <span>Saldo total: <strong>{formatCurrency(context.totalAccountBalance)}</strong></span>
                </div>
            )}

            {/* Messages */}
            <div className="ai-messages">
                {isEmpty && !isLoading && (
                    <div className="ai-welcome">
                        <div className="ai-welcome__icon">
                            <Bot size={40} />
                        </div>
                        <h2 className="ai-welcome__title">¡Hola! Soy BC Asesor</h2>
                        <p className="ai-welcome__text">
                            Tu asistente financiero personal. Puedo ayudarte a entender tus finanzas,
                            resolver dudas sobre impuestos en Colombia y darte recomendaciones personalizadas.
                        </p>
                    </div>
                )}

                {messages.map(msg => (
                    <div
                        key={msg.id}
                        className={`ai-message ai-message--${msg.role}`}
                    >
                        {msg.role === 'assistant' && (
                            <div className="ai-avatar ai-avatar--assistant">
                                <Bot size={16} />
                            </div>
                        )}
                        <div className={`ai-bubble ai-bubble--${msg.role}`}>
                            <p className="ai-bubble__text">{msg.content}</p>
                            <span className="ai-bubble__time">
                                {msg.timestamp.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                        {msg.role === 'user' && (
                            <div className="ai-avatar ai-avatar--user">
                                <User size={16} />
                            </div>
                        )}
                    </div>
                ))}

                {isLoading && <TypingIndicator />}

                {/* API Key Error */}
                {apiKeyMissing && (
                    <div className="ai-error-card ai-error-card--config">
                        <AlertCircle size={20} />
                        <div>
                            <strong>Asistente no configurado</strong>
                            <p>
                                Para activar BC Asesor, debes configurar la variable de entorno{' '}
                                <code>ANTHROPIC_API_KEY</code> en tu proyecto de Supabase Edge Functions.
                            </p>
                            <ol>
                                <li>Ve a tu proyecto en <strong>supabase.com</strong></li>
                                <li>Abre <strong>Edge Functions &rsaquo; Secrets</strong></li>
                                <li>Agrega el secreto <code>ANTHROPIC_API_KEY</code> con tu clave de Anthropic</li>
                                <li>Redespliega la función <code>ai-assistant</code></li>
                            </ol>
                        </div>
                        <button type="button" className="ai-retry-btn" onClick={handleRetry}>
                            <RefreshCw size={14} /> Reintentar
                        </button>
                    </div>
                )}

                {/* Generic Error */}
                {error && !apiKeyMissing && (
                    <div className="ai-error-card">
                        <AlertCircle size={16} />
                        <span>{error}</span>
                        <button type="button" className="ai-retry-btn" onClick={handleRetry}>
                            <RefreshCw size={14} /> Reintentar
                        </button>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Suggested Questions (shown before first message) */}
            {isEmpty && !isLoading && (
                <div className="ai-suggestions">
                    {SUGGESTED_QUESTIONS.map(q => (
                        <button
                            type="button"
                            key={q}
                            className="ai-chip"
                            onClick={() => handleSuggestedQuestion(q)}
                            disabled={isLoading}
                        >
                            {q}
                        </button>
                    ))}
                </div>
            )}

            {/* Input Area */}
            <div className="ai-input-area">
                <div className="ai-input-wrapper">
                    <textarea
                        ref={inputRef}
                        className="ai-input"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Escribe tu pregunta financiera..."
                        rows={1}
                        disabled={isLoading}
                    />
                    <button
                        type="button"
                        className="ai-send-btn"
                        onClick={() => sendMessage(input)}
                        disabled={isLoading || !input.trim()}
                        aria-label="Enviar mensaje"
                    >
                        <Send size={18} />
                    </button>
                </div>
                <p className="ai-input-hint">Presiona Enter para enviar · Shift+Enter para nueva línea</p>
            </div>
        </div>
    );
}
