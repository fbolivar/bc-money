import { useEffect, useState, useCallback } from 'react';
import { X, TrendingUp, TrendingDown, Target, CheckCircle, Award } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import './MonthlySummary.css';

interface Props {
    onClose: () => void;
}

interface SummaryData {
    month: string;
    income: number;
    expenses: number;
    savings: number;
    savingsRate: number;
    topCategory: string;
    topCategoryAmt: number;
    budgetsOnTrack: number;
    budgetsTotal: number;
    goalsProgress: number;
    goalsTotal: number;
    transactionCount: number;
}

export function MonthlySummary({ onClose }: Props) {
    const { user, profile } = useAuth();
    const currency = profile?.currency || 'COP';
    const [data, setData] = useState<SummaryData | null>(null);
    const [loading, setLoading] = useState(true);

    const fmt = useCallback((n: number) =>
        new Intl.NumberFormat('es-CO', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n),
    [currency]);

    useEffect(() => {
        if (!user) return;
        const prevMonth = subMonths(new Date(), 1);
        const start = format(startOfMonth(prevMonth), 'yyyy-MM-dd');
        const end = format(endOfMonth(prevMonth), 'yyyy-MM-dd');
        const monthLabel = format(prevMonth, 'MMMM yyyy', { locale: es });

        async function load() {
            setLoading(true);
            try {
                const [txRes, catRes, budgetRes, goalRes] = await Promise.all([
                    supabase.from('transactions').select('amount,type,category_id').eq('user_id', user!.id).gte('date', start).lte('date', end),
                    supabase.from('categories').select('id,name'),
                    supabase.from('budgets').select('id,category_id,amount').eq('user_id', user!.id),
                    supabase.from('goals').select('id,current_amount,target_amount').eq('user_id', user!.id),
                ]);

                const txs = txRes.data || [];
                const cats = catRes.data || [];

                const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
                const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
                const savings = income - expenses;
                const savingsRate = income > 0 ? (savings / income) * 100 : 0;

                // Top spending category
                const expByCat: Record<string, number> = {};
                for (const t of txs.filter(t => t.type === 'expense')) {
                    if (t.category_id) expByCat[t.category_id] = (expByCat[t.category_id] || 0) + Number(t.amount);
                }
                const topCatId = Object.entries(expByCat).sort((a, b) => b[1] - a[1])[0];
                const topCategory = topCatId ? (cats.find(c => c.id === topCatId[0])?.name || 'Otra') : '—';
                const topCategoryAmt = topCatId ? topCatId[1] : 0;

                // Budgets on track
                let budgetsOnTrack = 0;
                const budgetsTotal = (budgetRes.data || []).length;
                for (const b of budgetRes.data || []) {
                    const spent = txs.filter(t => t.type === 'expense' && t.category_id === b.category_id).reduce((s, t) => s + Number(t.amount), 0);
                    if (spent <= Number(b.amount)) budgetsOnTrack++;
                }

                // Goals with progress
                const goals = goalRes.data || [];
                const goalsTotal = goals.length;
                const goalsProgress = goals.filter(g => Number(g.current_amount) >= Number(g.target_amount)).length;

                setData({
                    month: monthLabel,
                    income,
                    expenses,
                    savings,
                    savingsRate,
                    topCategory,
                    topCategoryAmt,
                    budgetsOnTrack,
                    budgetsTotal,
                    goalsProgress,
                    goalsTotal,
                    transactionCount: txs.length,
                });
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [user]);

    if (loading) return null;
    if (!data) return null;

    const savingsGood = data.savingsRate >= 20;
    const budgetGood = data.budgetsTotal > 0 && data.budgetsOnTrack === data.budgetsTotal;

    return (
        <div className="ms-overlay" onClick={onClose}>
            <div className="ms-panel" onClick={e => e.stopPropagation()}>
                <div className="ms-header">
                    <div>
                        <p className="ms-sub">Resumen del mes anterior</p>
                        <h2 className="ms-title" style={{ textTransform: 'capitalize' }}>{data.month}</h2>
                    </div>
                    <button type="button" className="ms-close" title="Cerrar" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="ms-grid">
                    <div className="ms-card income">
                        <TrendingUp size={18} />
                        <span className="ms-card-label">Ingresos</span>
                        <span className="ms-card-val">{fmt(data.income)}</span>
                    </div>
                    <div className="ms-card expense">
                        <TrendingDown size={18} />
                        <span className="ms-card-label">Gastos</span>
                        <span className="ms-card-val">{fmt(data.expenses)}</span>
                    </div>
                    <div className={`ms-card savings ${savingsGood ? 'good' : 'warn'}`}>
                        <Award size={18} />
                        <span className="ms-card-label">Ahorros</span>
                        <span className="ms-card-val">{fmt(data.savings)}</span>
                        <span className="ms-card-sub">{data.savingsRate.toFixed(1)}% tasa de ahorro</span>
                    </div>
                </div>

                <div className="ms-stats">
                    <div className="ms-stat">
                        <span className="ms-stat-label">Mayor gasto</span>
                        <span className="ms-stat-val">{data.topCategory} <em>{fmt(data.topCategoryAmt)}</em></span>
                    </div>
                    <div className="ms-stat">
                        <span className="ms-stat-label">Transacciones</span>
                        <span className="ms-stat-val">{data.transactionCount}</span>
                    </div>
                    {data.budgetsTotal > 0 && (
                        <div className="ms-stat">
                            <CheckCircle size={14} className={budgetGood ? 'icon-good' : 'icon-warn'} />
                            <span className="ms-stat-label">Presupuestos</span>
                            <span className="ms-stat-val">{data.budgetsOnTrack}/{data.budgetsTotal} cumplidos</span>
                        </div>
                    )}
                    {data.goalsTotal > 0 && (
                        <div className="ms-stat">
                            <Target size={14} />
                            <span className="ms-stat-label">Metas completadas</span>
                            <span className="ms-stat-val">{data.goalsProgress}/{data.goalsTotal}</span>
                        </div>
                    )}
                </div>

                <button type="button" className="ms-btn" onClick={onClose}>¡Entendido!</button>
            </div>
        </div>
    );
}
