import { useState, useEffect, useCallback } from 'react';
import { X, ChevronRight, CheckCircle, AlertTriangle, TrendingUp, TrendingDown, Target, Repeat, Lightbulb } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import './RevisionMensual.css';

interface Props { onClose: () => void; }

const REVISION_KEY = 'revision_mensual_v1';

export function shouldShowRevision(): boolean {
    const now = new Date();
    if (now.getDate() > 7) return false; // only first week of month
    const monthKey = format(now, 'yyyy-MM');
    try {
        const seen = JSON.parse(localStorage.getItem(REVISION_KEY) || '{}');
        return !seen[monthKey];
    } catch { return false; }
}

export function markRevisionDone() {
    const monthKey = format(new Date(), 'yyyy-MM');
    try {
        const seen = JSON.parse(localStorage.getItem(REVISION_KEY) || '{}');
        seen[monthKey] = true;
        localStorage.setItem(REVISION_KEY, JSON.stringify(seen));
    } catch { /* ignore */ }
}

export function RevisionMensual({ onClose }: Props) {
    const { user, profile } = useAuth();
    const currency = profile?.currency || 'COP';
    const navigate = useNavigate();
    const [step, setStep] = useState(0);
    const [data, setData] = useState<{
        income: number; expenses: number; savings: number; savingsRate: number;
        prevIncome: number; prevExpenses: number;
        budgetsExceeded: { name: string; budget: number; spent: number }[];
        budgetsOk: number;
        goalsActive: number; goalsNearComplete: { name: string; pct: number }[];
        subsActive: { name: string; amount: number; unused: boolean }[];
        monthLabel: string;
    } | null>(null);
    const [priorities, setPriorities] = useState(['', '', '']);
    const [loading, setLoading] = useState(true);

    const fmt = (n: number) =>
        new Intl.NumberFormat('es-CO', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

    const load = useCallback(async () => {
        if (!user) return;
        const now = new Date();
        const prev = subMonths(now, 1);
        const prevStart = format(startOfMonth(prev), 'yyyy-MM-dd');
        const prevEnd = format(endOfMonth(prev), 'yyyy-MM-dd');
        const prevPrev = subMonths(now, 2);
        const ppStart = format(startOfMonth(prevPrev), 'yyyy-MM-dd');
        const ppEnd = format(endOfMonth(prevPrev), 'yyyy-MM-dd');
        const monthLabel = format(prev, 'MMMM yyyy', { locale: es });

        const [txPrev, txPP, budgetsRes, catsRes, goalsRes, subsRes] = await Promise.all([
            supabase.from('transactions').select('type,amount,category_id').eq('user_id', user.id).gte('date', prevStart).lte('date', prevEnd),
            supabase.from('transactions').select('type,amount').eq('user_id', user.id).gte('date', ppStart).lte('date', ppEnd),
            supabase.from('budgets').select('id,category_id,amount').eq('user_id', user.id),
            supabase.from('categories').select('id,name'),
            supabase.from('goals').select('id,name,current_amount,target_amount,status').eq('user_id', user.id),
            supabase.from('subscriptions').select('name,amount,status').eq('user_id', user.id).eq('status', 'active'),
        ]);

        const txs = txPrev.data || [];
        const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
        const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
        const savings = income - expenses;
        const savingsRate = income > 0 ? (savings / income) * 100 : 0;
        const ppTxs = txPP.data || [];
        const prevIncome = ppTxs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
        const prevExpenses = ppTxs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
        const cats = catsRes.data || [];

        const budgetsExceeded: { name: string; budget: number; spent: number }[] = [];
        let budgetsOk = 0;
        for (const b of budgetsRes.data || []) {
            const spent = txs.filter(t => t.type === 'expense' && t.category_id === b.category_id).reduce((s, t) => s + Number(t.amount), 0);
            const cat = cats.find(c => c.id === b.category_id);
            if (spent > Number(b.amount)) budgetsExceeded.push({ name: cat?.name || 'General', budget: Number(b.amount), spent });
            else budgetsOk++;
        }

        const activeGoals = (goalsRes.data || []).filter(g => g.status === 'active');
        const goalsNearComplete = activeGoals.filter(g => {
            const pct = Number(g.target_amount) > 0 ? (Number(g.current_amount) / Number(g.target_amount)) * 100 : 0;
            return pct >= 70 && pct < 100;
        }).map(g => ({ name: g.name, pct: (Number(g.current_amount) / Number(g.target_amount)) * 100 }));

        setData({
            income, expenses, savings, savingsRate,
            prevIncome, prevExpenses,
            budgetsExceeded, budgetsOk,
            goalsActive: activeGoals.length, goalsNearComplete,
            subsActive: (subsRes.data || []).map(s => ({ name: s.name, amount: Number(s.amount), unused: false })),
            monthLabel,
        });
        setLoading(false);
    }, [user]);

    useEffect(() => { load(); }, [load]);

    function finish() {
        markRevisionDone();
        onClose();
    }

    function goTo(path: string) { finish(); navigate(path); }

    const STEPS = ['Resumen', 'Presupuestos', 'Metas', 'Suscripciones', 'Plan'];
    const total = STEPS.length;

    if (loading) return null;
    if (!data) return null;

    return (
        <div className="rm-overlay" onClick={finish}>
            <div className="rm-panel" onClick={e => e.stopPropagation()}>
                <div className="rm-header">
                    <div>
                        <p className="rm-kicker">Revisión mensual</p>
                        <h2 className="rm-title" style={{ textTransform: 'capitalize' }}>{data.monthLabel}</h2>
                    </div>
                    <button type="button" className="rm-close" onClick={finish}><X size={20} /></button>
                </div>

                {/* Step pills */}
                <div className="rm-steps">
                    {STEPS.map((s, i) => (
                        <button key={s} type="button" className={`rm-step-pill ${i === step ? 'active' : i < step ? 'done' : ''}`} onClick={() => setStep(i)}>
                            {i < step ? <CheckCircle size={11} /> : null}{s}
                        </button>
                    ))}
                </div>

                <div className="rm-body">
                    {/* STEP 0: Resumen */}
                    {step === 0 && (
                        <div className="rm-step">
                            <div className="rm-cards">
                                <div className="rm-card income">
                                    <TrendingUp size={16} /><span>Ingresos</span>
                                    <strong>{fmt(data.income)}</strong>
                                    {data.prevIncome > 0 && <em>{data.income >= data.prevIncome ? '▲' : '▼'} vs mes anterior</em>}
                                </div>
                                <div className="rm-card expense">
                                    <TrendingDown size={16} /><span>Gastos</span>
                                    <strong>{fmt(data.expenses)}</strong>
                                    {data.prevExpenses > 0 && <em>{data.expenses <= data.prevExpenses ? '▼ mejor' : '▲ más'}</em>}
                                </div>
                                <div className={`rm-card savings ${data.savingsRate >= 20 ? 'good' : data.savingsRate > 0 ? 'warn' : 'bad'}`}>
                                    <span>Ahorro neto</span>
                                    <strong>{fmt(data.savings)}</strong>
                                    <em>{data.savingsRate.toFixed(1)}% del ingreso</em>
                                </div>
                            </div>
                            {data.savingsRate < 10 && data.income > 0 && (
                                <div className="rm-tip warn"><AlertTriangle size={14} /> Tu tasa de ahorro está por debajo del 10%. Considera revisar gastos no esenciales.</div>
                            )}
                            {data.savingsRate >= 20 && (
                                <div className="rm-tip good"><CheckCircle size={14} /> ¡Excelente! Superaste el 20% de ahorro recomendado.</div>
                            )}
                        </div>
                    )}

                    {/* STEP 1: Presupuestos */}
                    {step === 1 && (
                        <div className="rm-step">
                            {data.budgetsExceeded.length === 0 && data.budgetsOk === 0 && (
                                <div className="rm-empty-state">Sin presupuestos configurados. <button type="button" className="rm-link" onClick={() => goTo('/presupuestos')}>Crear presupuestos →</button></div>
                            )}
                            {data.budgetsOk > 0 && <div className="rm-tip good"><CheckCircle size={14} /> {data.budgetsOk} presupuesto{data.budgetsOk > 1 ? 's' : ''} cumplido{data.budgetsOk > 1 ? 's' : ''}.</div>}
                            {data.budgetsExceeded.map(b => (
                                <div key={b.name} className="rm-budget-row">
                                    <AlertTriangle size={14} className="rm-warn-icon" />
                                    <div className="rm-budget-info">
                                        <span className="rm-budget-name">{b.name}</span>
                                        <span className="rm-budget-detail">Gastado {fmt(b.spent)} vs presupuesto {fmt(b.budget)}</span>
                                    </div>
                                    <span className="rm-budget-over">+{fmt(b.spent - b.budget)}</span>
                                </div>
                            ))}
                            <button type="button" className="rm-action-btn" onClick={() => goTo('/presupuestos')}>Ver todos los presupuestos →</button>
                        </div>
                    )}

                    {/* STEP 2: Metas */}
                    {step === 2 && (
                        <div className="rm-step">
                            {data.goalsActive === 0 ? (
                                <div className="rm-empty-state">Sin metas activas. <button type="button" className="rm-link" onClick={() => goTo('/metas')}>Crear una meta →</button></div>
                            ) : (
                                <>
                                    <div className="rm-tip good"><Target size={14} /> {data.goalsActive} meta{data.goalsActive > 1 ? 's' : ''} activa{data.goalsActive > 1 ? 's' : ''}.</div>
                                    {data.goalsNearComplete.map(g => (
                                        <div key={g.name} className="rm-goal-row">
                                            <div className="rm-goal-bar-wrap"><div className="rm-goal-bar" style={{ width: `${g.pct}%` }} /></div>
                                            <span className="rm-goal-name">{g.name}</span>
                                            <span className="rm-goal-pct">{g.pct.toFixed(0)}%</span>
                                        </div>
                                    ))}
                                    {data.goalsNearComplete.length > 0 && <div className="rm-tip warn"><AlertTriangle size={14} /> {data.goalsNearComplete.length} meta{data.goalsNearComplete.length > 1 ? 's' : ''} cerca de completarse. ¡Un último esfuerzo!</div>}
                                    <button type="button" className="rm-action-btn" onClick={() => goTo('/metas')}>Ver todas las metas →</button>
                                </>
                            )}
                        </div>
                    )}

                    {/* STEP 3: Suscripciones */}
                    {step === 3 && (
                        <div className="rm-step">
                            {data.subsActive.length === 0 ? (
                                <div className="rm-empty-state">Sin suscripciones activas registradas.</div>
                            ) : (
                                <>
                                    <div className="rm-tip">
                                        <Repeat size={14} />
                                        Total mensual en suscripciones: <strong>{fmt(data.subsActive.reduce((s, x) => s + x.amount, 0))}</strong>
                                    </div>
                                    <div className="rm-subs-list">
                                        {data.subsActive.map(s => (
                                            <div key={s.name} className="rm-sub-row">
                                                <span className="rm-sub-name">{s.name}</span>
                                                <span className="rm-sub-amt">{fmt(s.amount)}/mes</span>
                                            </div>
                                        ))}
                                    </div>
                                    <button type="button" className="rm-action-btn" onClick={() => goTo('/suscripciones')}>Gestionar suscripciones →</button>
                                </>
                            )}
                        </div>
                    )}

                    {/* STEP 4: Plan */}
                    {step === 4 && (
                        <div className="rm-step">
                            <div className="rm-tip"><Lightbulb size={14} /> Define 3 prioridades financieras para este mes.</div>
                            {priorities.map((p, i) => (
                                <div key={i} className="rm-priority-row">
                                    <span className="rm-priority-num">{i + 1}</span>
                                    <input
                                        type="text"
                                        className="rm-priority-input"
                                        placeholder={['Ej: Reducir gastos en restaurantes', 'Ej: Aportar $200k a meta vacaciones', 'Ej: Cancelar suscripción que no uso'][i]}
                                        value={p}
                                        onChange={e => setPriorities(prev => { const n = [...prev]; n[i] = e.target.value; return n; })}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="rm-footer">
                    {step > 0 && <button type="button" className="rm-btn-back" onClick={() => setStep(s => s - 1)}>← Anterior</button>}
                    {step < total - 1
                        ? <button type="button" className="rm-btn-next" onClick={() => setStep(s => s + 1)}>Siguiente <ChevronRight size={16} /></button>
                        : <button type="button" className="rm-btn-finish" onClick={finish}>¡Revisión completa! ✓</button>
                    }
                </div>
            </div>
        </div>
    );
}
