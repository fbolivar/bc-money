import { useState, useEffect, useCallback } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';

interface Insight {
    icon: string;
    title: string;
    body: string;
    type: 'positive' | 'warning' | 'info';
}

const CACHE_KEY = 'bc-ai-insights';
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function loadCache(): { insights: Insight[]; ts: number } | null {
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (Date.now() - data.ts > CACHE_TTL_MS) return null;
        return data;
    } catch { return null; }
}

function saveCache(insights: Insight[]) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ insights, ts: Date.now() })); } catch { /* ignore */ }
}

export function AIInsights() {
    const { user, profile } = useAuth();
    const [insights, setInsights] = useState<Insight[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    const fetchInsights = useCallback(async (force = false) => {
        if (!user) return;
        if (!force) {
            const cached = loadCache();
            if (cached) { setInsights(cached.insights); return; }
        }

        setLoading(true);
        setError(false);

        try {
            const now = new Date();
            const thisMonthStart = startOfMonth(now).toISOString();
            const thisMonthEnd = endOfMonth(now).toISOString();
            const prevMonthStart = startOfMonth(subMonths(now, 1)).toISOString();
            const prevMonthEnd = endOfMonth(subMonths(now, 1)).toISOString();

            const [thisInc, thisExp, prevInc, prevExp, debts, accounts, budgets, topCat] = await Promise.all([
                supabase.from('transactions').select('amount').eq('user_id', user.id).eq('type', 'income').gte('date', thisMonthStart).lte('date', thisMonthEnd),
                supabase.from('transactions').select('amount').eq('user_id', user.id).eq('type', 'expense').gte('date', thisMonthStart).lte('date', thisMonthEnd),
                supabase.from('transactions').select('amount').eq('user_id', user.id).eq('type', 'income').gte('date', prevMonthStart).lte('date', prevMonthEnd),
                supabase.from('transactions').select('amount, category_id').eq('user_id', user.id).eq('type', 'expense').gte('date', prevMonthStart).lte('date', prevMonthEnd),
                supabase.from('debts').select('remaining_amount').eq('user_id', user.id).gt('remaining_amount', 0),
                supabase.from('accounts').select('balance').eq('user_id', user.id),
                supabase.from('budgets').select('id', { count: 'exact' }).eq('user_id', user.id),
                supabase.from('transactions').select('amount, category_id, categories(name)').eq('user_id', user.id).eq('type', 'expense').gte('date', thisMonthStart).lte('date', thisMonthEnd),
            ]);

            const totalIncomeThisMonth = (thisInc.data ?? []).reduce((s, t) => s + Number(t.amount), 0);
            const totalExpensesThisMonth = (thisExp.data ?? []).reduce((s, t) => s + Number(t.amount), 0);
            const totalIncomePrevMonth = (prevInc.data ?? []).reduce((s, t) => s + Number(t.amount), 0);
            const totalExpensesPrevMonth = (prevExp.data ?? []).reduce((s, t) => s + Number(t.amount), 0);
            const totalActiveDebts = (debts.data ?? []).reduce((s, d) => s + Number(d.remaining_amount), 0);
            const totalAccountBalance = (accounts.data ?? []).reduce((s, a) => s + Number(a.balance), 0);
            const activeBudgetsCount = budgets.count ?? 0;
            const savingsRate = totalIncomeThisMonth > 0 ? ((totalIncomeThisMonth - totalExpensesThisMonth) / totalIncomeThisMonth) * 100 : 0;

            // Top expense category this month
            const catTotals: Record<string, { name: string; amount: number }> = {};
            for (const tx of (topCat.data ?? [])) {
                const catId = tx.category_id ?? 'other';
                const catName = (tx.categories as { name?: string } | null)?.name ?? 'Otros';
                catTotals[catId] = { name: catName, amount: (catTotals[catId]?.amount ?? 0) + Number(tx.amount) };
            }
            const topEntry = Object.values(catTotals).sort((a, b) => b.amount - a.amount)[0];

            const res = await fetch('/api/ai-insights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    totalIncomeThisMonth,
                    totalExpensesThisMonth,
                    totalIncomePrevMonth,
                    totalExpensesPrevMonth,
                    totalActiveDebts,
                    totalAccountBalance,
                    activeBudgetsCount,
                    topExpenseCategory: topEntry?.name ?? 'N/A',
                    topExpenseCategoryAmount: topEntry?.amount ?? 0,
                    savingsRate,
                    currency: profile?.currency ?? 'COP',
                }),
            });

            if (!res.ok) { setError(true); return; }
            const data = await res.json();
            const list: Insight[] = data.insights ?? [];
            setInsights(list);
            saveCache(list);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [user, profile]);

    useEffect(() => { fetchInsights(); }, [fetchInsights]);

    if (!insights.length && !loading && !error) return null;

    return (
        <div className="ai-insights-card">
            <div className="ai-insights-header">
                <div className="ai-insights-title">
                    <Sparkles size={16} />
                    <span>Análisis del mes</span>
                    <span className="ai-insights-badge">IA</span>
                </div>
                <button
                    type="button"
                    className="ai-insights-refresh"
                    onClick={() => fetchInsights(true)}
                    disabled={loading}
                    title="Actualizar análisis"
                >
                    <RefreshCw size={14} className={loading ? 'spin' : ''} />
                </button>
            </div>

            {loading && (
                <div className="ai-insights-loading">
                    <div className="ai-insights-skeleton" />
                    <div className="ai-insights-skeleton" />
                    <div className="ai-insights-skeleton short" />
                </div>
            )}

            {error && !loading && (
                <p className="ai-insights-error">No se pudo cargar el análisis.</p>
            )}

            {!loading && !error && (
                <div className="ai-insights-list">
                    {insights.map((ins, i) => (
                        <div key={i} className={`ai-insight-item ai-insight-item--${ins.type}`}>
                            <span className="ai-insight-icon">{ins.icon}</span>
                            <div>
                                <p className="ai-insight-title">{ins.title}</p>
                                <p className="ai-insight-body">{ins.body}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
