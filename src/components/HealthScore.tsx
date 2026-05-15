import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import './HealthScore.css';

interface MetricRow {
    label: string;
    score: number;
    max: number;
    detail: string;
}

interface ScoreData {
    total: number;
    metrics: MetricRow[];
}

function getColor(score: number): string {
    if (score >= 70) return '#10B981';
    if (score >= 40) return '#F59E0B';
    return '#EF4444';
}

function getLabel(score: number): string {
    if (score >= 70) return 'Buena';
    if (score >= 40) return 'Regular';
    return 'Crítica';
}

function fmt(n: number): string {
    return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function HealthScore() {
    const { user, profile } = useAuth();
    const [data, setData] = useState<ScoreData | null>(null);
    const [loading, setLoading] = useState(true);

    const currency = profile?.currency || 'COP';

    const calculate = useCallback(async () => {
        if (!user) return;
        setLoading(true);

        const now = new Date();
        const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
        const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

        const [txIncome, txExpense, debts, budgets] = await Promise.all([
            supabase
                .from('transactions')
                .select('amount')
                .eq('user_id', user.id)
                .eq('type', 'income')
                .gte('date', monthStart)
                .lte('date', monthEnd),
            supabase
                .from('transactions')
                .select('amount, category_id')
                .eq('user_id', user.id)
                .eq('type', 'expense')
                .gte('date', monthStart)
                .lte('date', monthEnd),
            supabase
                .from('debts')
                .select('installment_amount')
                .eq('user_id', user.id)
                .neq('status', 'paid'),
            supabase
                .from('budgets')
                .select('id, category_id, amount')
                .eq('user_id', user.id),
        ]);

        const monthIncome = (txIncome.data ?? []).reduce((s, t) => s + Number(t.amount), 0);
        const monthExpenses = (txExpense.data ?? []).reduce((s, t) => s + Number(t.amount), 0);
        const totalInstallments = (debts.data ?? []).reduce((s, d) => s + Number(d.installment_amount ?? 0), 0);

        const savingsRate = monthIncome > 0 ? ((monthIncome - monthExpenses) / monthIncome) * 100 : 0;
        let savingsScore = 0;
        if (monthIncome > 0 && savingsRate >= 20) {
            savingsScore = 25;
        } else if (monthIncome > 0 && savingsRate > 0) {
            savingsScore = Math.round((savingsRate / 20) * 25);
        }

        const dti = monthIncome > 0 ? (totalInstallments / monthIncome) * 100 : 0;
        let debtScore = 0;
        if (dti < 20) {
            debtScore = 25;
        } else if (dti <= 60) {
            debtScore = Math.round(((60 - dti) / 40) * 25);
        }

        const emergencyRaw = localStorage.getItem('bc-emergency-fund');
        let emergencyPct = 0;
        try {
            if (emergencyRaw) {
                const parsed: unknown = JSON.parse(emergencyRaw);
                if (typeof parsed === 'object' && parsed !== null && 'progress' in parsed) {
                    emergencyPct = Number((parsed as { progress: unknown }).progress);
                } else if (typeof parsed === 'number') {
                    emergencyPct = parsed;
                }
            }
        } catch {
            emergencyPct = 0;
        }
        const emergencyScore = Math.round(Math.min(emergencyPct / 100, 1) * 25);

        const allBudgets = budgets.data ?? [];
        const totalBudgets = allBudgets.length;
        let withinBudget = 0;
        for (const b of allBudgets) {
            const spent = (txExpense.data ?? [])
                .filter(t => t.category_id === b.category_id)
                .reduce((s, t) => s + Number(t.amount), 0);
            if (spent <= Number(b.amount)) withinBudget++;
        }
        const budgetScore = totalBudgets > 0 ? Math.round((withinBudget / totalBudgets) * 25) : 0;

        const total = savingsScore + debtScore + emergencyScore + budgetScore;

        const metrics: MetricRow[] = [
            {
                label: 'Tasa de ahorro',
                score: savingsScore,
                max: 25,
                detail: monthIncome > 0 ? `${savingsRate.toFixed(1)}% del ingreso` : 'Sin ingresos',
            },
            {
                label: 'Ratio deuda/ingreso',
                score: debtScore,
                max: 25,
                detail: monthIncome > 0 ? `${dti.toFixed(1)}% (cuotas ${currency} ${fmt(totalInstallments)})` : 'Sin ingresos',
            },
            {
                label: 'Fondo de emergencia',
                score: emergencyScore,
                max: 25,
                detail: `${Math.min(emergencyPct, 100).toFixed(0)}% completado`,
            },
            {
                label: 'Presupuestos cumplidos',
                score: budgetScore,
                max: 25,
                detail: totalBudgets > 0 ? `${withinBudget} de ${totalBudgets}` : 'Sin presupuestos',
            },
        ];

        setData({ total, metrics });
        setLoading(false);
    }, [user, currency]);

    useEffect(() => {
        calculate();
    }, [calculate]);

    if (loading) {
        return (
            <div className="hs-widget">
                <div className="hs-skeleton-circle" />
                <div className="hs-skeleton-rows">
                    {[1, 2, 3, 4].map(i => <div key={i} className="hs-skeleton-row" />)}
                </div>
            </div>
        );
    }

    if (!data) return null;

    const color = getColor(data.total);
    const label = getLabel(data.total);
    const deg = Math.round((data.total / 100) * 360);

    return (
        <div className="hs-widget">
            <div className="hs-header">
                <span className="hs-title">Salud Financiera</span>
                <span className="hs-badge" style={{ backgroundColor: `${color}22`, color }}>
                    {label}
                </span>
            </div>

            <div className="hs-body">
                <div
                    className="hs-circle"
                    style={{
                        background: `conic-gradient(${color} ${deg}deg, var(--color-border) ${deg}deg)`,
                    }}
                >
                    <div className="hs-circle-inner">
                        <span className="hs-score" style={{ color }}>{data.total}</span>
                        <span className="hs-score-max">/100</span>
                    </div>
                </div>

                <div className="hs-metrics">
                    {data.metrics.map((m, i) => (
                        <div key={i} className="hs-metric-row">
                            <div className="hs-metric-left">
                                <span className="hs-metric-label">{m.label}</span>
                                <span className="hs-metric-detail">{m.detail}</span>
                            </div>
                            <div className="hs-metric-right">
                                <span className="hs-metric-score" style={{ color: m.score >= m.max * 0.7 ? '#10B981' : m.score >= m.max * 0.4 ? '#F59E0B' : '#EF4444' }}>
                                    {m.score}
                                </span>
                                <span className="hs-metric-max">/{m.max}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
