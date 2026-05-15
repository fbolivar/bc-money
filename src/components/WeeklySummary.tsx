import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import {
    startOfWeek, endOfWeek, subWeeks, startOfMonth, endOfMonth,
    format,
} from 'date-fns';
import { es } from 'date-fns/locale';
import './WeeklySummary.css';

interface WeekData {
    income: number;
    expenses: number;
    topCategory: { name: string; icon: string; amount: number } | null;
}

interface SummaryData {
    thisWeek: WeekData;
    lastWeek: WeekData;
    monthProgress: number;
    weekStart: Date;
    today: Date;
}

function fmt(n: number, currency: string): string {
    return `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function Arrow({ current, previous }: { current: number; previous: number }) {
    if (current > previous) return <TrendingUp size={14} className="ws-arrow up" />;
    if (current < previous) return <TrendingDown size={14} className="ws-arrow down" />;
    return <Minus size={14} className="ws-arrow neutral" />;
}

export function WeeklySummary() {
    const { user, profile } = useAuth();
    const [data, setData] = useState<SummaryData | null>(null);
    const [loading, setLoading] = useState(true);

    const currency = profile?.currency || 'COP';

    const load = useCallback(async () => {
        if (!user) return;
        setLoading(true);

        const now = new Date();
        const weekStart = startOfWeek(now, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
        const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
        const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
        const monthStart = startOfMonth(now);
        const monthEnd = endOfMonth(now);

        const wsFmt = format(weekStart, 'yyyy-MM-dd');
        const weFmt = format(weekEnd, 'yyyy-MM-dd');
        const lwsFmt = format(lastWeekStart, 'yyyy-MM-dd');
        const lweFmt = format(lastWeekEnd, 'yyyy-MM-dd');
        const msFmt = format(monthStart, 'yyyy-MM-dd');
        const meFmt = format(monthEnd, 'yyyy-MM-dd');

        const [thisTx, lastTx, monthTx, budgets, categories] = await Promise.all([
            supabase
                .from('transactions')
                .select('amount, type, category_id')
                .eq('user_id', user.id)
                .gte('date', wsFmt)
                .lte('date', weFmt),
            supabase
                .from('transactions')
                .select('amount, type')
                .eq('user_id', user.id)
                .gte('date', lwsFmt)
                .lte('date', lweFmt),
            supabase
                .from('transactions')
                .select('amount, type')
                .eq('user_id', user.id)
                .gte('date', msFmt)
                .lte('date', meFmt)
                .eq('type', 'expense'),
            supabase
                .from('budgets')
                .select('amount')
                .eq('user_id', user.id),
            supabase
                .from('categories')
                .select('id, name, icon'),
        ]);

        const thisList = thisTx.data ?? [];
        const lastList = lastTx.data ?? [];

        const thisIncome = thisList.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
        const thisExp = thisList.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
        const lastIncome = lastList.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
        const lastExp = lastList.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

        const catMap: Record<string, number> = {};
        for (const t of thisList.filter(x => x.type === 'expense')) {
            const key = t.category_id ?? 'other';
            catMap[key] = (catMap[key] ?? 0) + Number(t.amount);
        }
        const topCatId = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0]?.[0];
        const topCatData = (categories.data ?? []).find(c => c.id === topCatId);
        const topCategory = topCatId
            ? { name: topCatData?.name ?? 'Otros', icon: topCatData?.icon ?? '💰', amount: catMap[topCatId] ?? 0 }
            : null;

        const monthExpTotal = (monthTx.data ?? []).reduce((s, t) => s + Number(t.amount), 0);
        const totalBudget = (budgets.data ?? []).reduce((s, b) => s + Number(b.amount), 0);
        const monthProgress = totalBudget > 0 ? Math.min((monthExpTotal / totalBudget) * 100, 100) : 0;

        setData({
            thisWeek: { income: thisIncome, expenses: thisExp, topCategory },
            lastWeek: { income: lastIncome, expenses: lastExp, topCategory: null },
            monthProgress,
            weekStart,
            today: now,
        });
        setLoading(false);
    }, [user]);

    useEffect(() => {
        load();
    }, [load]);

    if (loading) {
        return (
            <div className="ws-card">
                <div className="ws-sk-title" />
                <div className="ws-sk-row" />
                <div className="ws-sk-row" />
                <div className="ws-sk-row short" />
            </div>
        );
    }

    if (!data) return null;

    const { thisWeek, lastWeek, monthProgress, weekStart, today } = data;
    const progressColor = monthProgress >= 90 ? '#EF4444' : monthProgress >= 70 ? '#F59E0B' : '#10B981';

    return (
        <div className="ws-card">
            <div className="ws-header">
                <span className="ws-title">Esta semana</span>
                <span className="ws-range">
                    {format(weekStart, "EEE d", { locale: es })} – {format(today, "EEE d MMM", { locale: es })}
                </span>
            </div>

            <div className="ws-rows">
                <div className="ws-row">
                    <span className="ws-row-label income-dot">Ingresos</span>
                    <span className="ws-row-value income">{fmt(thisWeek.income, currency)}</span>
                    <Arrow current={thisWeek.income} previous={lastWeek.income} />
                    <span className="ws-row-prev">{fmt(lastWeek.income, currency)}</span>
                </div>
                <div className="ws-row">
                    <span className="ws-row-label expense-dot">Gastos</span>
                    <span className="ws-row-value expense">{fmt(thisWeek.expenses, currency)}</span>
                    <Arrow current={thisWeek.expenses} previous={lastWeek.expenses} />
                    <span className="ws-row-prev">{fmt(lastWeek.expenses, currency)}</span>
                </div>
            </div>

            {thisWeek.topCategory && (
                <div className="ws-top-cat">
                    <span className="ws-top-cat-icon">{thisWeek.topCategory.icon}</span>
                    <div className="ws-top-cat-info">
                        <span className="ws-top-cat-label">Mayor gasto</span>
                        <span className="ws-top-cat-name">{thisWeek.topCategory.name}</span>
                    </div>
                    <span className="ws-top-cat-amount">{fmt(thisWeek.topCategory.amount, currency)}</span>
                </div>
            )}

            <div className="ws-month-progress">
                <div className="ws-progress-header">
                    <span className="ws-progress-label">Progreso mensual</span>
                    <span className="ws-progress-pct" style={{ color: progressColor }}>{monthProgress.toFixed(0)}%</span>
                </div>
                <div className="ws-progress-track">
                    <div
                        className="ws-progress-fill"
                        style={{ width: `${monthProgress}%`, backgroundColor: progressColor }}
                    />
                </div>
            </div>
        </div>
    );
}
