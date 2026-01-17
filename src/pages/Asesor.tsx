import { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, User, RefreshCw, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Transaction, Goal, Budget, Category, AIConversation } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { format, subDays } from 'date-fns';
import './Asesor.css';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    structured?: {
        summary: string[];
        alerts: string[];
        shortTermPlan: string;
        mediumTermPlan: string;
        longTermPlan: string;
        nextAction: string;
    };
    timestamp: Date;
}

export function Asesor() {
    const { user, profile } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [context, setContext] = useState<any>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const currency = profile?.currency || 'USD';

    useEffect(() => {
        if (user) {
            loadContext();
            loadHistory();
        }
    }, [user]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const loadContext = async () => {
        const now = new Date();
        const thirtyDaysAgo = subDays(now, 30);
        const ninetyDaysAgo = subDays(now, 90);

        const [tx30, tx90, goals, budgets, categories] = await Promise.all([
            supabase.from('transactions').select('*').eq('user_id', user!.id).gte('date', format(thirtyDaysAgo, 'yyyy-MM-dd')),
            supabase.from('transactions').select('*').eq('user_id', user!.id).gte('date', format(ninetyDaysAgo, 'yyyy-MM-dd')),
            supabase.from('goals').select('*').eq('user_id', user!.id).eq('status', 'active'),
            supabase.from('budgets').select('*').eq('user_id', user!.id),
            supabase.from('categories').select('*'),
        ]);

        const tx30Data = tx30.data || [];
        const income30 = tx30Data.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
        const expenses30 = tx30Data.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

        setContext({
            profile: {
                income_type: profile?.income_type,
                life_situation: profile?.life_situation,
                risk_tolerance: profile?.risk_tolerance,
                investment_horizon: profile?.investment_horizon,
            },
            last30Days: {
                income: income30,
                expenses: expenses30,
                savings: income30 - expenses30,
                savingsRate: income30 > 0 ? ((income30 - expenses30) / income30 * 100).toFixed(1) : 0,
                transactionCount: tx30Data.length,
            },
            goals: goals.data?.map(g => ({
                name: g.name,
                target: g.target_amount,
                current: g.current_amount,
                progress: ((Number(g.current_amount) / Number(g.target_amount)) * 100).toFixed(0),
            })) || [],
            budgets: budgets.data?.length || 0,
        });
    };

    const loadHistory = async () => {
        const { data } = await supabase
            .from('ai_conversations')
            .select('*')
            .eq('user_id', user!.id)
            .order('created_at', { ascending: true })
            .limit(20);

        if (data) {
            setMessages(data.map(m => ({
                id: m.id,
                role: m.role as 'user' | 'assistant',
                content: m.content,
                structured: m.structured_response as any,
                timestamp: new Date(m.created_at),
            })));
        }
    };

    const generateAIResponse = async (userMessage: string): Promise<{ content: string; structured?: any }> => {
        // This is a mock AI response. In production, this would call your Supabase Edge Function
        // which would then call OpenAI/Gemini API with the user's context.

        const ctx = context;

        // Simple rule-based responses for demo (replace with real AI call)
        const responses = {
            summary: [
                `Tus ingresos de los últimos 30 días: ${currency} ${ctx?.last30Days?.income?.toLocaleString() || 0}`,
                `Tus gastos de los últimos 30 días: ${currency} ${ctx?.last30Days?.expenses?.toLocaleString() || 0}`,
                `Tasa de ahorro actual: ${ctx?.last30Days?.savingsRate || 0}%`,
            ],
            alerts: ctx?.last30Days?.savingsRate < 10
                ? ['⚠️ Tu tasa de ahorro está por debajo del 10%. Considera revisar gastos no esenciales.']
                : ['✅ Tu tasa de ahorro está en buen nivel. ¡Sigue así!'],
            shortTermPlan: 'Mantén tu fondo de emergencia como prioridad. Revisa suscripciones que no uses.',
            mediumTermPlan: 'Una vez completo tu fondo de emergencia, considera diversificar en ETFs de bajo costo.',
            longTermPlan: 'Para retiro a largo plazo, considera maximizar cuentas con beneficios fiscales.',
            nextAction: ctx?.goals?.length === 0
                ? 'Crea tu primera meta de ahorro hoy.'
                : `Aporta a tu meta "${ctx?.goals[0]?.name}" esta semana.`,
        };

        const content = `
**📊 Resumen de tu Situación:**
${responses.summary.map(s => `• ${s}`).join('\n')}

**⚡ Alertas:**
${responses.alerts.map(a => `• ${a}`).join('\n')}

**📋 Plan Recomendado:**
- **Corto Plazo (0-3 meses):** ${responses.shortTermPlan}
- **Mediano Plazo (3-24 meses):** ${responses.mediumTermPlan}
- **Largo Plazo (2-10 años):** ${responses.longTermPlan}

**✅ Tu Próxima Acción:**
${responses.nextAction}

---
*Recuerda: esto es orientación educativa, no asesoría financiera profesional.*
    `.trim();

        return { content, structured: responses };
    };

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMessage = input.trim();
        setInput('');

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: userMessage,
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMsg]);
        setLoading(true);

        // Save user message
        await supabase.from('ai_conversations').insert({
            user_id: user!.id,
            role: 'user',
            content: userMessage,
        });

        try {
            const response = await generateAIResponse(userMessage);

            const assistantMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: response.content,
                structured: response.structured,
                timestamp: new Date(),
            };

            setMessages(prev => [...prev, assistantMsg]);

            // Save assistant message
            await supabase.from('ai_conversations').insert({
                user_id: user!.id,
                role: 'assistant',
                content: response.content,
                structured_response: response.structured,
                context_snapshot: context,
            });
        } catch (error) {
            console.error('AI Error:', error);
        }

        setLoading(false);
    };

    const handleQuickAction = (action: string) => {
        setInput(action);
    };

    return (
        <div className="asesor-page animate-fadeIn">
            <div className="asesor-container">
                {/* Sidebar with context */}
                <aside className="asesor-sidebar">
                    <div className="sidebar-section">
                        <h3>🧠 Tu Contexto</h3>
                        {context && (
                            <div className="context-cards">
                                <div className="context-card">
                                    <span className="label">Ingresos (30d)</span>
                                    <span className="value">{currency} {context.last30Days?.income?.toLocaleString()}</span>
                                </div>
                                <div className="context-card">
                                    <span className="label">Gastos (30d)</span>
                                    <span className="value">{currency} {context.last30Days?.expenses?.toLocaleString()}</span>
                                </div>
                                <div className="context-card">
                                    <span className="label">Tasa de Ahorro</span>
                                    <span className="value">{context.last30Days?.savingsRate}%</span>
                                </div>
                                <div className="context-card">
                                    <span className="label">Metas Activas</span>
                                    <span className="value">{context.goals?.length || 0}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="sidebar-section">
                        <h3>💡 Preguntas Rápidas</h3>
                        <div className="quick-actions">
                            <button onClick={() => handleQuickAction('¿Cómo está mi situación financiera?')}>
                                Analiza mi situación
                            </button>
                            <button onClick={() => handleQuickAction('¿Dónde puedo recortar gastos?')}>
                                ¿Dónde recortar gastos?
                            </button>
                            <button onClick={() => handleQuickAction('Dame un plan de ahorro')}>
                                Plan de ahorro
                            </button>
                            <button onClick={() => handleQuickAction('¿Cómo empezar a invertir?')}>
                                Comenzar a invertir
                            </button>
                        </div>
                    </div>

                    <div className="sidebar-section disclaimer">
                        <AlertTriangle size={16} />
                        <p>Esto es orientación educativa, no asesoría financiera profesional.</p>
                    </div>
                </aside>

                {/* Chat area */}
                <main className="chat-area">
                    <div className="chat-messages">
                        {messages.length === 0 && (
                            <div className="welcome-message">
                                <Sparkles size={48} className="welcome-icon" />
                                <h2>¡Hola! Soy tu Coach Financiero</h2>
                                <p>Estoy aquí para ayudarte a tomar mejores decisiones con tu dinero.
                                    Pregúntame sobre tu situación, cómo ahorrar más, o cómo empezar a invertir.</p>
                            </div>
                        )}

                        {messages.map((msg) => (
                            <div key={msg.id} className={`message ${msg.role}`}>
                                <div className="message-avatar">
                                    {msg.role === 'user' ? <User size={20} /> : <Sparkles size={20} />}
                                </div>
                                <div className="message-content">
                                    <div className="message-text" dangerouslySetInnerHTML={{
                                        __html: msg.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>')
                                    }} />
                                    <span className="message-time">
                                        {format(msg.timestamp, 'HH:mm')}
                                    </span>
                                </div>
                            </div>
                        ))}

                        {loading && (
                            <div className="message assistant">
                                <div className="message-avatar"><Sparkles size={20} /></div>
                                <div className="message-content">
                                    <div className="typing-indicator">
                                        <span></span><span></span><span></span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    <div className="chat-input-area">
                        <input
                            type="text"
                            className="chat-input"
                            placeholder="Pregúntame sobre tus finanzas..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            disabled={loading}
                        />
                        <button
                            className="btn btn-primary send-btn"
                            onClick={handleSend}
                            disabled={loading || !input.trim()}
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </main>
            </div>
        </div>
    );
}
