import { useState, useEffect, useCallback } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { TrendingUp, AlertTriangle, Calendar, RefreshCw, TrendingDown, DollarSign } from 'lucide-react';
import { format, addMonths, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import type { Account, Subscription, Debt, Transaction } from '../lib/supabase';
import './Proyeccion.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type Horizon = 3 | 6 | 12;

interface MonthProjection {
    month: Date;
    label: string;
    incomeEstimated: number;
    expenseEstimated: number;
    balance: number;
    isNegative: boolean;
}

interface ChartDataPoint {
    name: string;
    balance: number;
    income: number;
    expense: number;
    isNegative: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function subscriptionMonthlyAmount(sub: Subscription): number {
    switch (sub.billing_cycle) {
        case 'weekly':     return sub.amount * 4.33;
        case 'monthly':    return sub.amount;
        case 'quarterly':  return sub.amount / 3;
        case 'yearly':     return sub.amount / 12;
        default:           return sub.amount;
    }
}

function formatCurrency(value: number, currency: string): string {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value);
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

interface TooltipProps {
    active?: boolean;
    payload?: Array<{ value: number; dataKey: string }>;
    label?: string;
    currency: string;
}

function CustomTooltip({ active, payload, label, currency }: TooltipProps) {
    if (!active || !payload?.length) return null;
    const balance = payload.find(p => p.dataKey === 'balance')?.value ?? 0;
    const income  = payload.find(p => p.dataKey === 'income')?.value  ?? 0;
    const expense = payload.find(p => p.dataKey === 'expense')?.value ?? 0;
    const isNeg   = balance < 0;

    return (
        <div className={`proyeccion-tooltip ${isNeg ? 'proyeccion-tooltip--danger' : ''}`}>
            <p className="proyeccion-tooltip__label">{label}</p>
            <div className="proyeccion-tooltip__row proyeccion-tooltip__row--income">
                <span>Ingresos</span>
                <span>{formatCurrency(income, currency)}</span>
            </div>
            <div className="proyeccion-tooltip__row proyeccion-tooltip__row--expense">
                <span>Gastos</span>
                <span>{formatCurrency(expense, currency)}</span>
            </div>
            <div className={`proyeccion-tooltip__row proyeccion-tooltip__row--balance ${isNeg ? 'proyeccion-tooltip__row--negative' : ''}`}>
                <span>Balance</span>
                <span>{formatCurrency(balance, currency)}</span>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function Proyeccion() {
    const { user, profile } = useAuth();
    const currency = profile?.currency || 'COP';

    const [horizon, setHorizon]           = useState<Horizon>(6);
    const [loading, setLoading]           = useState(true);
    const [projections, setProjections]   = useState<MonthProjection[]>([]);
    const [currentBalance, setCurrentBalance] = useState(0);
    const [lastUpdated, setLastUpdated]   = useState<Date | null>(null);

    // ── Data fetching ──────────────────────────────────────────────────────────

    const loadProjection = useCallback(async () => {
        if (!user) return;
        setLoading(true);

        try {
            const now        = new Date();
            const lookback   = subMonths(startOfMonth(now), 3);

            // 1. Suma de cuentas activas → balance actual
            const { data: accounts } = await supabase
                .from('accounts')
                .select('balance, is_active')
                .eq('user_id', user.id)
                .eq('is_active', true) as { data: Account[] | null };

            const totalBalance = (accounts ?? []).reduce((s, a) => s + (a.balance ?? 0), 0);

            // 2. Transacciones de los últimos 3 meses
            const { data: transactions } = await supabase
                .from('transactions')
                .select('amount, type, date, is_recurring')
                .eq('user_id', user.id)
                .gte('date', format(lookback, 'yyyy-MM-dd'))
                .lt('date', format(startOfMonth(now), 'yyyy-MM-dd')) as { data: Transaction[] | null };

            // 3. Suscripciones activas
            const { data: subscriptions } = await supabase
                .from('subscriptions')
                .select('amount, billing_cycle')
                .eq('user_id', user.id)
                .eq('status', 'active') as { data: Subscription[] | null };

            // 4. Deudas activas
            const { data: debts } = await supabase
                .from('debts')
                .select('installment_amount, payment_day')
                .eq('user_id', user.id)
                .eq('status', 'active') as { data: Debt[] | null };

            // ── Calcular promedios de los últimos 3 meses ──────────────────────

            // Separar recurrentes de no-recurrentes
            const txList = transactions ?? [];

            // Ingresos recurrentes mensuales (promedio)
            const recurringIncome = txList
                .filter(t => t.type === 'income' && t.is_recurring)
                .reduce((s, t) => s + t.amount, 0) / 3;

            // Gastos recurrentes mensuales (promedio)
            const recurringExpense = txList
                .filter(t => t.type === 'expense' && t.is_recurring)
                .reduce((s, t) => s + t.amount, 0) / 3;

            // Ingresos no-recurrentes (base variable)
            const variableIncome = txList
                .filter(t => t.type === 'income' && !t.is_recurring)
                .reduce((s, t) => s + t.amount, 0) / 3;

            // Gastos no-recurrentes (base variable)
            const variableExpense = txList
                .filter(t => t.type === 'expense' && !t.is_recurring)
                .reduce((s, t) => s + t.amount, 0) / 3;

            // ── Gastos fijos adicionales ───────────────────────────────────────

            // Suscripciones → gasto mensual
            const subMonthlyTotal = (subscriptions ?? [])
                .reduce((s, sub) => s + subscriptionMonthlyAmount(sub), 0);

            // Cuotas de deuda
            const debtMonthlyTotal = (debts ?? [])
                .reduce((s, d) => s + (d.installment_amount ?? 0), 0);

            // ── Totales base por mes ───────────────────────────────────────────

            const baseMonthlyIncome  = recurringIncome  + variableIncome;
            const baseMonthlyExpense = recurringExpense  + variableExpense + subMonthlyTotal + debtMonthlyTotal;

            // ── Proyectar N meses ──────────────────────────────────────────────

            const months: MonthProjection[] = [];
            let runningBalance = totalBalance;

            for (let i = 0; i < horizon; i++) {
                const monthDate  = addMonths(startOfMonth(now), i);
                const income     = baseMonthlyIncome;
                const expense    = baseMonthlyExpense;
                runningBalance  += income - expense;

                months.push({
                    month: monthDate,
                    label: format(monthDate, 'MMM yyyy', { locale: es }),
                    incomeEstimated:  income,
                    expenseEstimated: expense,
                    balance:          runningBalance,
                    isNegative:       runningBalance < 0,
                });
            }

            setCurrentBalance(totalBalance);
            setProjections(months);
            setLastUpdated(new Date());
        } catch (err) {
            console.error('Error loading projection:', err);
        } finally {
            setLoading(false);
        }
    }, [user, horizon]);

    useEffect(() => {
        loadProjection();
    }, [loadProjection]);

    // ── Derived data ───────────────────────────────────────────────────────────

    const chartData: ChartDataPoint[] = projections.map(p => ({
        name:       p.label,
        balance:    Math.round(p.balance),
        income:     Math.round(p.incomeEstimated),
        expense:    Math.round(p.expenseEstimated),
        isNegative: p.isNegative,
    }));

    const negativeMonths = projections.filter(p => p.isNegative);
    const lowestBalance  = projections.reduce(
        (min, p) => p.balance < min ? p.balance : min,
        projections[0]?.balance ?? 0,
    );
    const highestBalance = projections.reduce(
        (max, p) => p.balance > max ? p.balance : max,
        projections[0]?.balance ?? 0,
    );

    const totalProjectedIncome  = projections.reduce((s, p) => s + p.incomeEstimated, 0);
    const totalProjectedExpense = projections.reduce((s, p) => s + p.expenseEstimated, 0);
    const netProjected          = totalProjectedIncome - totalProjectedExpense;

    // ── Render ─────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="proyeccion-page animate-fadeIn">
                <div className="proyeccion-loading">
                    <div className="loading-spinner" />
                    <p>Calculando proyección financiera…</p>
                </div>
            </div>
        );
    }

    return (
        <div className="proyeccion-page animate-slideIn">

            {/* ── Header ── */}
            <div className="page-header">
                <div className="proyeccion-header-info">
                    <h1 className="page-title">
                        <TrendingUp size={28} style={{ verticalAlign: 'middle', marginRight: 10 }} />
                        Proyección de Flujo de Caja
                    </h1>
                    <p className="proyeccion-subtitle">
                        Estimación basada en historial de transacciones, suscripciones y deudas activas.
                        {lastUpdated && (
                            <span className="proyeccion-updated">
                                &nbsp;Actualizado: {format(lastUpdated, 'HH:mm', { locale: es })}
                            </span>
                        )}
                    </p>
                </div>

                <div className="proyeccion-controls">
                    {/* Selector de horizonte */}
                    <div className="proyeccion-horizon-selector">
                        <Calendar size={16} />
                        {([3, 6, 12] as Horizon[]).map(h => (
                            <button
                                key={h}
                                className={`proyeccion-horizon-btn ${horizon === h ? 'active' : ''}`}
                                onClick={() => setHorizon(h)}
                            >
                                {h} meses
                            </button>
                        ))}
                    </div>
                    <button className="btn btn-secondary proyeccion-refresh-btn" onClick={loadProjection}>
                        <RefreshCw size={16} />
                        Recalcular
                    </button>
                </div>
            </div>

            {/* ── Alerta de balance negativo ── */}
            {negativeMonths.length > 0 && (
                <div className="proyeccion-alert proyeccion-alert--danger">
                    <AlertTriangle size={20} />
                    <div>
                        <strong>Alerta: balance negativo proyectado</strong>
                        <p>
                            Se proyecta balance negativo en {negativeMonths.length} mes{negativeMonths.length > 1 ? 'es' : ''}:&nbsp;
                            {negativeMonths.map(m => m.label).join(', ')}.
                            El punto más bajo será {formatCurrency(lowestBalance, currency)}.
                        </p>
                    </div>
                </div>
            )}

            {/* ── KPI Cards ── */}
            <div className="proyeccion-kpis">
                <div className="proyeccion-kpi-card">
                    <div className="proyeccion-kpi-icon proyeccion-kpi-icon--primary">
                        <DollarSign size={20} />
                    </div>
                    <div>
                        <p className="proyeccion-kpi-label">Balance actual</p>
                        <p className={`proyeccion-kpi-value ${currentBalance < 0 ? 'text-danger' : 'text-success'}`}>
                            {formatCurrency(currentBalance, currency)}
                        </p>
                    </div>
                </div>

                <div className="proyeccion-kpi-card">
                    <div className="proyeccion-kpi-icon proyeccion-kpi-icon--success">
                        <TrendingUp size={20} />
                    </div>
                    <div>
                        <p className="proyeccion-kpi-label">Ingresos proyectados ({horizon} m)</p>
                        <p className="proyeccion-kpi-value text-success">
                            {formatCurrency(totalProjectedIncome, currency)}
                        </p>
                    </div>
                </div>

                <div className="proyeccion-kpi-card">
                    <div className="proyeccion-kpi-icon proyeccion-kpi-icon--danger">
                        <TrendingDown size={20} />
                    </div>
                    <div>
                        <p className="proyeccion-kpi-label">Gastos proyectados ({horizon} m)</p>
                        <p className="proyeccion-kpi-value text-danger">
                            {formatCurrency(totalProjectedExpense, currency)}
                        </p>
                    </div>
                </div>

                <div className="proyeccion-kpi-card">
                    <div className={`proyeccion-kpi-icon ${netProjected >= 0 ? 'proyeccion-kpi-icon--success' : 'proyeccion-kpi-icon--danger'}`}>
                        <TrendingUp size={20} />
                    </div>
                    <div>
                        <p className="proyeccion-kpi-label">Balance proyectado final</p>
                        <p className={`proyeccion-kpi-value ${projections[projections.length - 1]?.balance >= 0 ? 'text-success' : 'text-danger'}`}>
                            {formatCurrency(projections[projections.length - 1]?.balance ?? 0, currency)}
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Área Chart ── */}
            <div className="card proyeccion-chart-card">
                <div className="card-header">
                    <h3 className="card-title">Evolución del balance proyectado</h3>
                    <div className="proyeccion-chart-legend">
                        <span className="proyeccion-legend-item proyeccion-legend-item--balance">Balance</span>
                        <span className="proyeccion-legend-item proyeccion-legend-item--income">Ingresos</span>
                        <span className="proyeccion-legend-item proyeccion-legend-item--expense">Gastos</span>
                    </div>
                </div>

                <div className="proyeccion-chart-wrapper">
                    <ResponsiveContainer width="100%" height={320}>
                        <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                            <defs>
                                <linearGradient id="gradBalance" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%"  stopColor="var(--color-primary)"  stopOpacity={0.25} />
                                    <stop offset="95%" stopColor="var(--color-primary)"  stopOpacity={0.02} />
                                </linearGradient>
                                <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%"  stopColor="var(--color-success)"  stopOpacity={0.18} />
                                    <stop offset="95%" stopColor="var(--color-success)"  stopOpacity={0.02} />
                                </linearGradient>
                                <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%"  stopColor="var(--color-danger)"   stopOpacity={0.18} />
                                    <stop offset="95%" stopColor="var(--color-danger)"   stopOpacity={0.02} />
                                </linearGradient>
                            </defs>

                            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />

                            <XAxis
                                dataKey="name"
                                tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                tickFormatter={v => new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 }).format(v)}
                                tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                                axisLine={false}
                                tickLine={false}
                                width={70}
                            />

                            <Tooltip
                                content={<CustomTooltip currency={currency} />}
                                cursor={{ stroke: 'var(--color-border)', strokeWidth: 1 }}
                            />

                            {/* Línea de cero */}
                            <ReferenceLine y={0} stroke="var(--color-danger)" strokeDasharray="4 4" strokeWidth={1.5} />

                            <Area
                                type="monotone"
                                dataKey="income"
                                stroke="var(--color-success)"
                                strokeWidth={1.5}
                                fill="url(#gradIncome)"
                                dot={false}
                                activeDot={{ r: 4, fill: 'var(--color-success)' }}
                            />
                            <Area
                                type="monotone"
                                dataKey="expense"
                                stroke="var(--color-danger)"
                                strokeWidth={1.5}
                                fill="url(#gradExpense)"
                                dot={false}
                                activeDot={{ r: 4, fill: 'var(--color-danger)' }}
                            />
                            <Area
                                type="monotone"
                                dataKey="balance"
                                stroke="var(--color-primary)"
                                strokeWidth={2.5}
                                fill="url(#gradBalance)"
                                dot={(props) => {
                                    const { cx, cy, payload } = props;
                                    const color = payload.isNegative ? 'var(--color-danger)' : 'var(--color-primary)';
                                    return (
                                        <circle
                                            key={`dot-${cx}-${cy}`}
                                            cx={cx}
                                            cy={cy}
                                            r={4}
                                            fill={color}
                                            stroke="var(--color-surface)"
                                            strokeWidth={2}
                                        />
                                    );
                                }}
                                activeDot={{ r: 6, fill: 'var(--color-primary)', stroke: 'var(--color-surface)', strokeWidth: 2 }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Rango de balance */}
                <div className="proyeccion-range-info">
                    <div className="proyeccion-range-item">
                        <span className="proyeccion-range-label">Mínimo proyectado</span>
                        <span className={`proyeccion-range-value ${lowestBalance < 0 ? 'text-danger' : 'text-success'}`}>
                            {formatCurrency(lowestBalance, currency)}
                        </span>
                    </div>
                    <div className="proyeccion-range-item">
                        <span className="proyeccion-range-label">Máximo proyectado</span>
                        <span className="proyeccion-range-value text-success">
                            {formatCurrency(highestBalance, currency)}
                        </span>
                    </div>
                    <div className="proyeccion-range-item">
                        <span className="proyeccion-range-label">Flujo neto ({horizon} m)</span>
                        <span className={`proyeccion-range-value ${netProjected >= 0 ? 'text-success' : 'text-danger'}`}>
                            {netProjected >= 0 ? '+' : ''}{formatCurrency(netProjected, currency)}
                        </span>
                    </div>
                </div>
            </div>

            {/* ── Tabla mes a mes ── */}
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">Detalle mes a mes</h3>
                    <span className="badge badge-info">
                        {horizon} meses · base histórica 3 meses
                    </span>
                </div>

                <div className="proyeccion-table-wrapper">
                    <table className="table proyeccion-table">
                        <thead>
                            <tr>
                                <th>Mes</th>
                                <th className="text-right">Ingresos est.</th>
                                <th className="text-right">Gastos est.</th>
                                <th className="text-right">Flujo mensual</th>
                                <th className="text-right">Balance acumulado</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {projections.map((p, i) => {
                                const flow = p.incomeEstimated - p.expenseEstimated;
                                const isFirst = i === 0;
                                const prevBalance = isFirst ? currentBalance : projections[i - 1].balance;
                                const _ = prevBalance; // used implicitly via flow

                                return (
                                    <tr
                                        key={p.label}
                                        className={p.isNegative ? 'proyeccion-row--danger' : ''}
                                    >
                                        <td className="proyeccion-month-cell">
                                            <span className="proyeccion-month-label">
                                                {format(p.month, 'MMMM yyyy', { locale: es })}
                                            </span>
                                        </td>
                                        <td className="text-right text-success proyeccion-amount-cell">
                                            {formatCurrency(p.incomeEstimated, currency)}
                                        </td>
                                        <td className="text-right text-danger proyeccion-amount-cell">
                                            {formatCurrency(p.expenseEstimated, currency)}
                                        </td>
                                        <td className={`text-right proyeccion-amount-cell ${flow >= 0 ? 'text-success' : 'text-danger'}`}>
                                            {flow >= 0 ? '+' : ''}{formatCurrency(flow, currency)}
                                        </td>
                                        <td className={`text-right proyeccion-amount-cell proyeccion-balance-cell ${p.isNegative ? 'proyeccion-balance-cell--negative' : ''}`}>
                                            {formatCurrency(p.balance, currency)}
                                        </td>
                                        <td>
                                            {p.isNegative ? (
                                                <span className="badge badge-danger">
                                                    <AlertTriangle size={11} />
                                                    Deficit
                                                </span>
                                            ) : flow >= 0 ? (
                                                <span className="badge badge-success">Superávit</span>
                                            ) : (
                                                <span className="badge badge-warning">Ajustado</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Nota metodológica ── */}
            <div className="proyeccion-methodology">
                <p>
                    <strong>Metodología:</strong> La proyección combina el balance actual de todas las cuentas activas,
                    el promedio mensual de ingresos y gastos (recurrentes y no-recurrentes) de los últimos 3 meses,
                    el costo mensual equivalente de suscripciones activas y las cuotas de deudas activas.
                    Los valores son estimados y pueden diferir de la realidad.
                </p>
            </div>

        </div>
    );
}
