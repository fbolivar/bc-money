import { useState, useEffect, useMemo } from 'react';
import {
    TrendingUp,
    TrendingDown,
    Wallet,
    Target,
    AlertCircle,
    ArrowUpRight,
    ArrowDownRight,
    Plus,
} from 'lucide-react';
import {
    PieChart,
    Pie,
    Cell,
    AreaChart,
    Area,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { supabase } from '../lib/supabase';
import type { Transaction, Goal, Budget, Category } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import './Dashboard.css';

export function Dashboard() {
    const { user, profile } = useAuth();
    const [loading, setLoading] = useState(true);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [goals, setGoals] = useState<Goal[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [budgets, setBudgets] = useState<Budget[]>([]);

    const currency = profile?.currency || 'USD';

    useEffect(() => {
        if (!user) return;

        let mounted = true;

        const fetchData = async () => {
            try {
                const now = new Date();
                const monthStart = startOfMonth(now);
                const monthEnd = endOfMonth(now);

                // Create a timeout promise to prevent infinite loading
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Dashboard data fetch timeout')), 10000)
                );

                const dataPromise = Promise.all([
                    // Fetch transactions for current month
                    supabase
                        .from('transactions')
                        .select('*')
                        .eq('user_id', user.id)
                        .gte('date', format(monthStart, 'yyyy-MM-dd'))
                        .lte('date', format(monthEnd, 'yyyy-MM-dd'))
                        .order('date', { ascending: false }),

                    // Fetch goals
                    supabase
                        .from('goals')
                        .select('*')
                        .eq('user_id', user.id)
                        .eq('status', 'active')
                        .order('priority', { ascending: true }),

                    // Fetch categories
                    supabase
                        .from('categories')
                        .select('*')
                        .or(`user_id.eq.${user.id},is_system.eq.true`),

                    // Fetch budgets
                    supabase
                        .from('budgets')
                        .select('*')
                        .eq('user_id', user.id)
                ]);

                // Race against timeout
                const [txResult, goalsResult, catResult, budgetResult] = await Promise.race([
                    dataPromise,
                    timeoutPromise
                ]) as any; // Cast to bypass timeout type or better type inference

                if (mounted) {
                    // Log errors if any
                    if (txResult.error) console.error('Transactions error:', txResult.error);
                    if (goalsResult.error) console.error('Goals error:', goalsResult.error);
                    if (catResult.error) console.error('Categories error:', catResult.error);
                    if (budgetResult.error) console.error('Budgets error:', budgetResult.error);

                    setTransactions((txResult.data as Transaction[]) || []);
                    setGoals((goalsResult.data as Goal[]) || []);
                    setCategories((catResult.data as Category[]) || []);
                    setBudgets((budgetResult.data as Budget[]) || []);
                }
            } catch (error) {
                console.error('Error loading dashboard data:', error);
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        };

        fetchData();

        return () => {
            mounted = false;
        };
    }, [user]);

    // Calculate metrics
    const income = useMemo(() => transactions
        .filter((t) => t.type === 'income')
        .reduce((sum, t) => sum + Number(t.amount), 0), [transactions]);

    const expenses = useMemo(() => transactions
        .filter((t) => t.type === 'expense')
        .reduce((sum, t) => sum + Number(t.amount), 0), [transactions]);

    const balance = income - expenses;
    const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0;

    // Category breakdown for pie chart
    const categoryBreakdown = useMemo(() => transactions
        .filter((t) => t.type === 'expense')
        .reduce((acc: Record<string, number>, t) => {
            const catId = t.category_id || 'other';
            acc[catId] = (acc[catId] || 0) + Number(t.amount);
            return acc;
        }, {}), [transactions]);

    const pieData = useMemo(() => Object.entries(categoryBreakdown)
        .map(([catId, amount]) => {
            const category = categories.find((c) => c.id === catId);
            return {
                name: category?.name || 'Otros',
                value: amount,
                color: category?.color || '#6B7280',
            };
        })
        .sort((a, b) => b.value - a.value)
        .slice(0, 6), [categoryBreakdown, categories]);

    // Weekly trend data (last 4 weeks)
    const weeklyData = useMemo(() => Array.from({ length: 4 }, (_, i) => {
        const weekStart = subMonths(new Date(), 0);
        weekStart.setDate(weekStart.getDate() - (3 - i) * 7);
        const weekExpenses = transactions
            .filter((t) => {
                const txDate = new Date(t.date);
                return (
                    t.type === 'expense' &&
                    txDate >= weekStart &&
                    txDate < new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000)
                );
            })
            .reduce((sum, t) => sum + Number(t.amount), 0);
        return {
            name: `Sem ${i + 1}`,
            gastos: weekExpenses,
        };
    }), [transactions]);

    // Monthly comparison (last 6 months)
    const monthlyData = useMemo(() => Array.from({ length: 6 }, (_, i) => {
        const month = subMonths(new Date(), 5 - i);
        // Deterministic pseudo-random based on index for consistent render
        const pseudoRandom = (seed: number) => {
            const x = Math.sin(seed) * 10000;
            return x - Math.floor(x);
        };
        const seed = month.getTime();

        return {
            name: format(month, 'MMM', { locale: es }),
            ingresos: pseudoRandom(seed) * 3000 + 1500, // Placeholder
            gastos: pseudoRandom(seed + 1) * 2000 + 1000,
        };
    }), []); // Empty deps so it's calculated once (or when component remounts)

    // Budget usage
    const budgetUsage = useMemo(() => budgets.map((budget) => {
        const spent = transactions
            .filter((t) => t.type === 'expense' && t.category_id === budget.category_id)
            .reduce((sum, t) => sum + Number(t.amount), 0);
        const percentage = (spent / Number(budget.amount)) * 100;
        const category = categories.find((c) => c.id === budget.category_id);
        return {
            category: category?.name || 'General',
            budget: Number(budget.amount),
            spent,
            percentage,
            status: percentage <= 80 ? 'success' : percentage <= 100 ? 'warning' : 'danger',
        };
    }), [budgets, transactions, categories]);

    if (loading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Cargando tu dashboard...</p>
            </div>
        );
    }

    return (
        <div className="dashboard animate-fadeIn">
            {/* Quick Actions */}
            <div className="quick-actions">
                <Link to="/transacciones?new=income" className="quick-action-btn income">
                    <Plus size={18} />
                    <span>Registrar Ingreso</span>
                </Link>
                <Link to="/transacciones?new=expense" className="quick-action-btn expense">
                    <Plus size={18} />
                    <span>Registrar Gasto</span>
                </Link>
            </div>

            {/* Metric Cards */}
            <div className="metrics-grid">
                <div className="metric-card">
                    <div className="metric-header">
                        <span className="metric-label">Balance del Mes</span>
                        <div className={`metric-badge ${balance >= 0 ? 'positive' : 'negative'}`}>
                            {balance >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        </div>
                    </div>
                    <div className="metric-value">
                        <span className={balance >= 0 ? 'text-success' : 'text-danger'}>
                            {balance >= 0 ? '+' : ''}{currency} {balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                    </div>
                    <div className="metric-detail">
                        <span className="income">
                            <ArrowUpRight size={14} /> {currency} {income.toLocaleString()}
                        </span>
                        <span className="expense">
                            <ArrowDownRight size={14} /> {currency} {expenses.toLocaleString()}
                        </span>
                    </div>
                </div>

                <div className="metric-card">
                    <div className="metric-header">
                        <span className="metric-label">Tasa de Ahorro</span>
                        <Wallet size={18} className="metric-icon" />
                    </div>
                    <div className="metric-value">
                        <span className={savingsRate >= 20 ? 'text-success' : savingsRate >= 10 ? 'text-warning' : 'text-danger'}>
                            {savingsRate.toFixed(1)}%
                        </span>
                    </div>
                    <div className="metric-subtitle">
                        {savingsRate >= 20
                            ? '¡Excelente! Estás ahorrando bien'
                            : savingsRate >= 10
                                ? 'Buen inicio, intenta llegar al 20%'
                                : 'Revisa tus gastos para mejorar'}
                    </div>
                </div>

                <div className="metric-card">
                    <div className="metric-header">
                        <span className="metric-label">Presupuesto Usado</span>
                        <Target size={18} className="metric-icon" />
                    </div>
                    <div className="metric-value">
                        {budgetUsage.length > 0 ? (
                            <span>
                                {Math.round(
                                    budgetUsage.reduce((sum, b) => sum + b.percentage, 0) / budgetUsage.length
                                )}%
                            </span>
                        ) : (
                            <span className="text-secondary">Sin presupuestos</span>
                        )}
                    </div>
                    <div className="budget-bars">
                        {budgetUsage.slice(0, 3).map((b) => (
                            <div key={b.category} className="mini-budget">
                                <span>{b.category}</span>
                                <div className="progress">
                                    <div
                                        className={`progress-bar progress-${b.status}`}
                                        style={{ width: `${Math.min(b.percentage, 100)}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="metric-card goals-card">
                    <div className="metric-header">
                        <span className="metric-label">Metas Activas</span>
                        <Target size={18} className="metric-icon" />
                    </div>
                    {goals.length > 0 ? (
                        <div className="goals-preview">
                            {goals.slice(0, 2).map((goal) => {
                                const progress = (Number(goal.current_amount) / Number(goal.target_amount)) * 100;
                                return (
                                    <div key={goal.id} className="goal-item">
                                        <div className="goal-info">
                                            <span className="goal-name">{goal.name}</span>
                                            <span className="goal-amount">
                                                {currency} {Number(goal.current_amount).toLocaleString()} / {Number(goal.target_amount).toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="progress">
                                            <div
                                                className="progress-bar progress-success"
                                                style={{ width: `${progress}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="no-data">
                            <Link to="/metas">Crea tu primera meta</Link>
                        </p>
                    )}
                </div>
            </div>

            {/* Alerts */}
            {budgetUsage.some((b) => b.status === 'danger') && (
                <div className="alerts-section">
                    <div className="alert alert-warning">
                        <AlertCircle size={20} />
                        <div>
                            <strong>Atención:</strong> Has excedido el presupuesto en{' '}
                            {budgetUsage
                                .filter((b) => b.status === 'danger')
                                .map((b) => b.category)
                                .join(', ')}
                        </div>
                    </div>
                </div>
            )}

            {/* Charts Row */}
            <div className="charts-grid">
                {/* Category Breakdown */}
                <div className="chart-card">
                    <h3 className="chart-title">Gastos por Categoría</h3>
                    {pieData.length > 0 ? (
                        <div className="pie-chart-container">
                            <ResponsiveContainer width="100%" height={200}>
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={50}
                                        outerRadius={80}
                                        paddingAngle={2}
                                        dataKey="value"
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value: unknown) => [`${currency} ${Number(value).toLocaleString()}`, 'Monto']}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="pie-legend">
                                {pieData.map((entry, index) => (
                                    <div key={index} className="legend-item">
                                        <span className="legend-color" style={{ backgroundColor: entry.color }}></span>
                                        <span className="legend-label">{entry.name}</span>
                                        <span className="legend-value">{currency} {entry.value.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="no-data">No hay gastos este mes</p>
                    )}
                </div>

                {/* Weekly Trend */}
                <div className="chart-card">
                    <h3 className="chart-title">Tendencia Semanal</h3>
                    <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={weeklyData}>
                            <defs>
                                <linearGradient id="colorGastos" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                            <XAxis dataKey="name" stroke="var(--color-text-tertiary)" fontSize={12} />
                            <YAxis stroke="var(--color-text-tertiary)" fontSize={12} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'var(--color-surface)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '8px',
                                }}
                            />
                            <Area
                                type="monotone"
                                dataKey="gastos"
                                stroke="#EF4444"
                                fill="url(#colorGastos)"
                                strokeWidth={2}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Monthly Comparison */}
                <div className="chart-card wide">
                    <h3 className="chart-title">Ingresos vs Gastos (Últimos 6 meses)</h3>
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={monthlyData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                            <XAxis dataKey="name" stroke="var(--color-text-tertiary)" fontSize={12} />
                            <YAxis stroke="var(--color-text-tertiary)" fontSize={12} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'var(--color-surface)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '8px',
                                }}
                            />
                            <Bar dataKey="ingresos" fill="#10B981" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="gastos" fill="#EF4444" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Recent Transactions */}
            <div className="recent-section">
                <div className="section-header">
                    <h3>Transacciones Recientes</h3>
                    <Link to="/transacciones" className="view-all-link">
                        Ver todas <ArrowUpRight size={16} />
                    </Link>
                </div>
                {transactions.length > 0 ? (
                    <div className="transactions-list">
                        {transactions.slice(0, 5).map((tx) => {
                            const category = categories.find((c) => c.id === tx.category_id);
                            return (
                                <div key={tx.id} className="transaction-item">
                                    <div
                                        className="tx-icon"
                                        style={{ backgroundColor: category?.color || '#6B7280' }}
                                    >
                                        {tx.type === 'income' ? (
                                            <ArrowUpRight size={16} color="white" />
                                        ) : (
                                            <ArrowDownRight size={16} color="white" />
                                        )}
                                    </div>
                                    <div className="tx-details">
                                        <span className="tx-description">
                                            {tx.description || category?.name || 'Transacción'}
                                        </span>
                                        <span className="tx-date">
                                            {format(new Date(tx.date), 'd MMM yyyy', { locale: es })}
                                        </span>
                                    </div>
                                    <div className={`tx-amount ${tx.type}`}>
                                        {tx.type === 'income' ? '+' : '-'}{currency} {Number(tx.amount).toLocaleString()}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="no-data">
                        No hay transacciones este mes.{' '}
                        <Link to="/transacciones">Registra tu primera transacción</Link>
                    </p>
                )}
            </div>
        </div>
    );
}
