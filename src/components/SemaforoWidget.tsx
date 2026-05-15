import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format, startOfMonth, endOfMonth, getDaysInMonth } from 'date-fns';
import { TrendingDown, Wallet, BarChart2, ChevronDown } from 'lucide-react';
import './SemaforoWidget.css';

type TrafficLight = 'verde' | 'amarillo' | 'rojo';

interface Indicator {
    label: string;
    detail: string;
    status: TrafficLight;
    icon: React.ReactNode;
}

interface SemaforoData {
    overall: TrafficLight;
    message: string;
    indicators: Indicator[];
    monthProgress: number;
    budgetsOver: number;
    budgetsAtRisk: number;
    budgetsTotal: number;
    savingsRate: number;
    expenses: number;
    income: number;
}

function worstOf(...lights: TrafficLight[]): TrafficLight {
    if (lights.includes('rojo')) return 'rojo';
    if (lights.includes('amarillo')) return 'amarillo';
    return 'verde';
}

const STATUS_CONFIG = {
    verde: {
        label: 'Verde',
        emoji: '🟢',
        bg: 'var(--semaforo-green-bg, #d1fae5)',
        color: '#065f46',
        ring: '#10b981',
        message: (d: SemaforoData) =>
            d.savingsRate >= 20
                ? `Excelente — ahorrando el ${d.savingsRate.toFixed(1)}% del ingreso este mes.`
                : `Todo en orden. Vas bien en presupuesto y el balance es positivo.`,
    },
    amarillo: {
        label: 'Precaución',
        emoji: '🟡',
        bg: 'var(--semaforo-yellow-bg, #fef3c7)',
        color: '#92400e',
        ring: '#f59e0b',
        message: (d: SemaforoData) => {
            const parts: string[] = [];
            if (d.budgetsAtRisk > 0) parts.push(`${d.budgetsAtRisk} presupuesto${d.budgetsAtRisk > 1 ? 's' : ''} al límite`);
            if (d.savingsRate < 10 && d.savingsRate >= 0) parts.push(`ahorro bajo (${d.savingsRate.toFixed(1)}%)`);
            if (d.expenses > d.income * 0.85 && d.income > 0) parts.push('gastos cerca del ingreso');
            return parts.length > 0 ? `Atención: ${parts.join(', ')}.` : 'Revisa tus gastos — estás cerca de los límites.';
        },
    },
    rojo: {
        label: 'Alerta',
        emoji: '🔴',
        bg: 'var(--semaforo-red-bg, #fee2e2)',
        color: '#991b1b',
        ring: '#ef4444',
        message: (d: SemaforoData) => {
            if (d.budgetsOver > 0 && d.expenses > d.income && d.income > 0)
                return `${d.budgetsOver} presupuesto${d.budgetsOver > 1 ? 's' : ''} excedido${d.budgetsOver > 1 ? 's' : ''} y gastos superan ingresos este mes.`;
            if (d.budgetsOver > 0)
                return `${d.budgetsOver} presupuesto${d.budgetsOver > 1 ? 's' : ''} excedido${d.budgetsOver > 1 ? 's' : ''} este mes.`;
            if (d.income > 0 && d.expenses > d.income)
                return 'Los gastos superan los ingresos del mes. Ajusta el gasto.';
            return 'Tasa de ahorro negativa — estás gastando más de lo que ingresas.';
        },
    },
};

export function SemaforoWidget() {
    const { user, profile } = useAuth();
    const currency = profile?.currency || 'COP';
    const [data, setData] = useState<SemaforoData | null>(null);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);

    const compute = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        const now = new Date();
        const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
        const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
        const daysInMonth = getDaysInMonth(now);
        const dayOfMonth = now.getDate();
        const monthProgress = dayOfMonth / daysInMonth;

        const [txRes, budgetsRes, catRes] = await Promise.all([
            supabase.from('transactions').select('category_id,amount,type')
                .eq('user_id', user.id).gte('date', monthStart).lte('date', monthEnd),
            supabase.from('budgets').select('category_id,amount').eq('user_id', user.id),
            supabase.from('categories').select('id,name').or(`user_id.eq.${user.id},is_system.eq.true`),
        ]);

        const txs = txRes.data || [];
        const budgets = budgetsRes.data || [];
        const cats = catRes.data || [];

        const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
        const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
        const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0;

        // Budget analysis
        let budgetsOver = 0;
        let budgetsAtRisk = 0;
        const budgetIndicators: { name: string; spent: number; budget: number; status: TrafficLight }[] = [];

        for (const b of budgets) {
            const spent = txs.filter(t => t.type === 'expense' && t.category_id === b.category_id)
                .reduce((s, t) => s + Number(t.amount), 0);
            const budgetAmt = Number(b.amount);
            if (budgetAmt <= 0) continue;
            const pct = spent / budgetAmt;
            const expectedPct = monthProgress;

            let status: TrafficLight = 'verde';
            if (pct >= 1) { status = 'rojo'; budgetsOver++; }
            else if (pct >= 0.85 || (pct > expectedPct + 0.15)) { status = 'amarillo'; budgetsAtRisk++; }

            const catName = cats.find(c => c.id === b.category_id)?.name || 'Sin nombre';
            budgetIndicators.push({ name: catName, spent, budget: budgetAmt, status });
        }

        // Balance status
        let balanceStatus: TrafficLight = 'verde';
        if (income > 0) {
            if (expenses >= income) balanceStatus = 'rojo';
            else if (expenses >= income * 0.85) balanceStatus = 'amarillo';
        }

        // Savings status
        let savingsStatus: TrafficLight = 'verde';
        if (savingsRate < 0) savingsStatus = 'rojo';
        else if (savingsRate < 10) savingsStatus = 'amarillo';

        // Budget overall status
        const budgetStatus: TrafficLight = budgetsOver > 0 ? 'rojo' : budgetsAtRisk > 0 ? 'amarillo' : 'verde';

        const overall = worstOf(balanceStatus, savingsStatus, budgetStatus);

        const fmt = (n: number) => new Intl.NumberFormat('es-CO', {
            style: 'currency', currency,
            minimumFractionDigits: 0, maximumFractionDigits: 0,
        }).format(n);

        const indicators: Indicator[] = [
            {
                label: 'Balance del mes',
                detail: income > 0
                    ? `${fmt(expenses)} de ${fmt(income)} gastado (${((expenses / income) * 100).toFixed(0)}%)`
                    : 'Sin ingresos registrados este mes',
                status: balanceStatus,
                icon: <TrendingDown size={15} />,
            },
            {
                label: 'Tasa de ahorro',
                detail: `${savingsRate.toFixed(1)}% este mes${savingsRate >= 20 ? ' 🎯' : savingsRate >= 10 ? '' : ' — meta: ≥10%'}`,
                status: savingsStatus,
                icon: <Wallet size={15} />,
            },
            {
                label: 'Presupuestos',
                detail: budgets.length === 0
                    ? 'Sin presupuestos configurados'
                    : budgetsOver > 0
                        ? `${budgetsOver} excedido${budgetsOver > 1 ? 's' : ''}, ${budgetsAtRisk} en riesgo`
                        : budgetsAtRisk > 0
                            ? `${budgetsAtRisk} cerca del límite`
                            : `Todos en control (${budgets.length} activos)`,
                status: budgetStatus,
                icon: <BarChart2 size={15} />,
            },
        ];

        const result: SemaforoData = {
            overall, indicators, monthProgress, budgetsOver, budgetsAtRisk,
            budgetsTotal: budgets.length, savingsRate, expenses, income,
            message: '',
        };
        result.message = STATUS_CONFIG[overall].message(result);

        setData(result);
        setLoading(false);
    }, [user, currency]);

    useEffect(() => { compute(); }, [compute]);

    if (loading || !data) return null;

    const cfg = STATUS_CONFIG[data.overall];
    const now = new Date();
    const daysLeft = getDaysInMonth(now) - now.getDate();

    return (
        <div className="semaforo-widget" style={{ '--semaforo-ring': cfg.ring, '--semaforo-bg': cfg.bg, '--semaforo-color': cfg.color } as React.CSSProperties}>
            <div className="semaforo-main">
                <div className="semaforo-light-wrap">
                    <div className="semaforo-ring">
                        <svg viewBox="0 0 48 48" className="semaforo-ring-svg">
                            <circle cx="24" cy="24" r="20" fill="none" strokeWidth="3.5" className="semaforo-ring-bg" />
                            <circle cx="24" cy="24" r="20" fill="none" strokeWidth="3.5"
                                strokeDasharray={`${data.monthProgress * 125.6} 125.6`}
                                strokeLinecap="round"
                                className="semaforo-ring-fill"
                                transform="rotate(-90 24 24)"
                            />
                        </svg>
                        <span className="semaforo-emoji">{cfg.emoji}</span>
                    </div>
                    <div className="semaforo-light-info">
                        <span className="semaforo-status-label">{cfg.label}</span>
                        <span className="semaforo-days-left">{daysLeft} días restantes</span>
                    </div>
                </div>

                <div className="semaforo-right">
                    <p className="semaforo-message">{data.message}</p>
                    <div className="semaforo-indicators">
                        {data.indicators.map(ind => (
                            <div key={ind.label} className={`semaforo-ind semaforo-ind-${ind.status}`}>
                                <span className="semaforo-ind-icon">{ind.icon}</span>
                                <div className="semaforo-ind-text">
                                    <span className="semaforo-ind-label">{ind.label}</span>
                                    <span className="semaforo-ind-detail">{ind.detail}</span>
                                </div>
                                <span className="semaforo-dot" />
                            </div>
                        ))}
                    </div>
                </div>

                <button
                    type="button"
                    className={`semaforo-expand-btn ${expanded ? 'open' : ''}`}
                    onClick={() => setExpanded(e => !e)}
                    title={expanded ? 'Cerrar' : 'Ver detalle del mes'}
                >
                    <ChevronDown size={16} />
                </button>
            </div>

            {expanded && (
                <div className="semaforo-progress-section">
                    <div className="semaforo-month-bar-wrap">
                        <div className="semaforo-month-bar">
                            <div className="semaforo-month-fill" style={{ width: `${data.monthProgress * 100}%` }} />
                            <span className="semaforo-month-label">
                                Día {now.getDate()} de {getDaysInMonth(now)} ({Math.round(data.monthProgress * 100)}% del mes)
                            </span>
                        </div>
                    </div>

                    <div className="semaforo-summary-row">
                        <div className="semaforo-summary-item">
                            <span>Ingresos</span>
                            <strong className="green">
                                {new Intl.NumberFormat('es-CO', { style: 'currency', currency, minimumFractionDigits: 0 }).format(data.income)}
                            </strong>
                        </div>
                        <div className="semaforo-summary-item">
                            <span>Gastos</span>
                            <strong className="red">
                                {new Intl.NumberFormat('es-CO', { style: 'currency', currency, minimumFractionDigits: 0 }).format(data.expenses)}
                            </strong>
                        </div>
                        <div className="semaforo-summary-item">
                            <span>Balance</span>
                            <strong className={data.income - data.expenses >= 0 ? 'green' : 'red'}>
                                {new Intl.NumberFormat('es-CO', { style: 'currency', currency, minimumFractionDigits: 0 }).format(data.income - data.expenses)}
                            </strong>
                        </div>
                        <div className="semaforo-summary-item">
                            <span>Ahorro</span>
                            <strong className={data.savingsRate >= 10 ? 'green' : data.savingsRate >= 0 ? 'yellow' : 'red'}>
                                {data.savingsRate.toFixed(1)}%
                            </strong>
                        </div>
                    </div>

                    <div className="semaforo-budget-guide">
                        <span className="semaforo-guide-title">Referencia presupuesto esperado al día {now.getDate()}: {Math.round(data.monthProgress * 100)}%</span>
                        <div className="semaforo-guide-dots">
                            <span className="dot verde" />Verde: bajo el ritmo esperado
                            <span className="dot amarillo" />Amarillo: &gt;15% sobre ritmo o &gt;85% usado
                            <span className="dot rojo" />Rojo: presupuesto excedido
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
