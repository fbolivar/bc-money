import { useState, useEffect, useMemo } from 'react';
import {
    TrendingUp, TrendingDown, Wallet, Target, AlertCircle,
    ArrowUpRight, ArrowDownRight, Plus, CreditCard, Activity, ReceiptText, CircleDollarSign, Palmtree,
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { supabase } from '../lib/supabase';
import type { Transaction, Goal, Budget, Category, Account, Debt, Subscription } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { SkeletonDashboard } from '../components/Skeleton';
import { parseLocalDate } from '../lib/dates';
import './Dashboard.css';

async function getDashboardData(userId: string) {
    const [txRes, goalsRes, catRes, budgRes, accRes, debtRes, subRes] = await Promise.all([
        supabase.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false }).limit(500),
        supabase.from('goals').select('*').eq('user_id', userId).order('priority', { ascending: true }),
        supabase.from('categories').select('*').or(`user_id.eq.${userId},is_system.eq.true`),
        supabase.from('budgets').select('*').eq('user_id', userId),
        supabase.from('accounts').select('*').eq('user_id', userId).order('name'),
        supabase.from('debts').select('*').eq('user_id', userId).eq('status', 'active'),
        supabase.from('subscriptions').select('*').eq('user_id', userId).eq('status', 'active'),
    ]);
    return {
        transactions: txRes.data || [], goals: goalsRes.data || [],
        categories: catRes.data || [], budgets: budgRes.data || [],
        accounts: accRes.data || [], debts: debtRes.data || [],
        subscriptions: subRes.data || [],
    };
}

function fmtMoney(n: number, c: string) {
    return `${c} ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function Dashboard() {
    const { user, profile } = useAuth();
    const [loading, setLoading] = useState(true);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [goals, setGoals] = useState<Goal[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [debts, setDebts] = useState<Debt[]>([]);
    const [subs, setSubs] = useState<Subscription[]>([]);
    const [accountFilter, setAccountFilter] = useState<string>('all');

    const currency = profile?.currency || 'USD';

    useEffect(() => {
        if (!user) return;
        getDashboardData(user.id).then(data => {
            setTransactions(data.transactions); setGoals(data.goals);
            setCategories(data.categories); setBudgets(data.budgets);
            setAccounts(data.accounts); setDebts(data.debts);
            setSubs(data.subscriptions); setLoading(false);
        });
    }, [user]);

    const filteredTx = useMemo(() =>
        accountFilter === 'all' ? transactions : transactions.filter(t => t.account_id === accountFilter),
        [transactions, accountFilter]
    );

    const income = useMemo(() => filteredTx.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0), [filteredTx]);
    const expenses = useMemo(() => filteredTx.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0), [filteredTx]);
    const balance = income - expenses;
    const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0;
    const txCount = filteredTx.length;

    const activeGoals = useMemo(() => goals.filter(g => g.status === 'active' || !g.status), [goals]);

    // Monthly data for bar chart
    const monthlyData = useMemo(() => Array.from({ length: 6 }, (_, i) => {
        const month = subMonths(new Date(), 5 - i);
        const mStart = startOfMonth(month); const mEnd = endOfMonth(month);
        const monthTx = filteredTx.filter(t => { const d = parseLocalDate(t.date); return d >= mStart && d <= mEnd; });
        return {
            name: format(month, 'MMM', { locale: es }),
            ingresos: monthTx.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0),
            gastos: monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0),
        };
    }), [filteredTx]);

    // Current month stats
    const currentMonthTx = useMemo(() => {
        const start = startOfMonth(new Date()); const end = endOfMonth(new Date());
        return filteredTx.filter(t => { const d = parseLocalDate(t.date); return d >= start && d <= end; });
    }, [filteredTx]);
    const monthIncome = currentMonthTx.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const monthExpenses = currentMonthTx.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

    // Category breakdown pie
    const pieData = useMemo(() => {
        const breakdown = filteredTx.filter(t => t.type === 'expense')
            .reduce((acc: Record<string, number>, t) => { const k = t.category_id || 'other'; acc[k] = (acc[k] || 0) + Number(t.amount); return acc; }, {});
        return Object.entries(breakdown)
            .map(([id, amount]) => { const c = categories.find(x => x.id === id); return { name: c?.name || 'Otros', value: amount, color: c?.color || '#94A3B8' }; })
            .sort((a, b) => b.value - a.value).slice(0, 6);
    }, [filteredTx, categories]);

    // Budget usage
    const budgetUsage = useMemo(() => budgets.map(b => {
        const spent = filteredTx.filter(t => t.type === 'expense' && t.category_id === b.category_id).reduce((s, t) => s + Number(t.amount), 0);
        const pct = (spent / Number(b.amount)) * 100;
        const cat = categories.find(c => c.id === b.category_id);
        return { category: cat?.name || 'General', budget: Number(b.amount), spent, pct, status: pct <= 80 ? 'success' : pct <= 100 ? 'warning' : 'danger' };
    }), [budgets, filteredTx, categories]);

    // Total accounts balance
    const totalAccountBalance = accounts.reduce((s, a) => s + Number(a.balance), 0);

    // Retirement calculation
    const retirementData = useMemo(() => {
        const birthYear = profile?.birth_year;
        if (!birthYear) return null;

        const currentAge = new Date().getFullYear() - birthYear;
        const monthlySavings = Math.max(income - expenses, 0) / Math.max(filteredTx.length / 30, 1) * 30; // Avg monthly savings
        const avgMonthlySavings = income > 0 ? (income - expenses) / Math.max(1, new Set(filteredTx.map(t => t.date.slice(0, 7))).size) : 0;
        const totalDebt = debts.reduce((s, d) => s + Number(d.remaining_amount), 0);
        const currentNetWorth = totalAccountBalance - totalDebt;

        // Target: 25x annual expenses (4% rule)
        const monthlyExpenses = expenses > 0 ? expenses / Math.max(1, new Set(filteredTx.filter(t => t.type === 'expense').map(t => t.date.slice(0, 7))).size) : 0;
        const annualExpenses = monthlyExpenses * 12;
        const retirementTarget = annualExpenses * 25; // 4% withdrawal rule

        if (retirementTarget <= 0 || avgMonthlySavings <= 0) return { currentAge, retirementAge: null, yearsLeft: null, target: 0, current: currentNetWorth, monthlyNeeded: 0 };

        // Estimate years to reach target with 6% annual return
        const monthlyReturn = 0.06 / 12;
        let projected = Math.max(currentNetWorth, 0);
        let months = 0;
        while (projected < retirementTarget && months < 600) { // Max 50 years
            projected = projected * (1 + monthlyReturn) + avgMonthlySavings;
            months++;
        }

        const yearsLeft = Math.ceil(months / 12);
        const retirementAge = currentAge + yearsLeft;

        return { currentAge, retirementAge, yearsLeft, target: retirementTarget, current: currentNetWorth, monthlyNeeded: avgMonthlySavings };
    }, [profile, income, expenses, filteredTx, totalAccountBalance, debts]);

    if (loading) {
        return <div className="page-content"><SkeletonDashboard /></div>;
    }

    return (
        <div className="dashboard animate-fadeIn">
            {/* Account Filter */}
            {accounts.length > 0 && (
                <div className="dash-filter-row">
                    <select className="dash-filter-select" value={accountFilter} onChange={e => setAccountFilter(e.target.value)} title="Filtrar por cuenta">
                        <option value="all">Todas las cuentas</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                </div>
            )}

            {/* Metric Cards Row - Like Reference Image */}
            <div className="dash-metrics">
                <div className="dash-metric green">
                    <div className="dm-icon"><TrendingUp size={22} /></div>
                    <div className="dm-content">
                        <span className="dm-value">{fmtMoney(income, currency)}</span>
                        <span className="dm-label">Ingresos Totales</span>
                    </div>
                </div>
                <div className="dash-metric blue">
                    <div className="dm-icon"><TrendingDown size={22} /></div>
                    <div className="dm-content">
                        <span className="dm-value">{fmtMoney(expenses, currency)}</span>
                        <span className="dm-label">Gastos Totales</span>
                    </div>
                </div>
                <div className="dash-metric orange">
                    <div className="dm-icon"><Wallet size={22} /></div>
                    <div className="dm-content">
                        <span className="dm-value">{savingsRate.toFixed(1)}%</span>
                        <span className="dm-label">Tasa de Ahorro</span>
                    </div>
                </div>
                <div className="dash-metric red">
                    <div className="dm-icon"><ReceiptText size={22} /></div>
                    <div className="dm-content">
                        <span className="dm-value">{txCount}</span>
                        <span className="dm-label">Transacciones</span>
                    </div>
                </div>
            </div>

            {/* Middle Row: Latest Transactions + Statistics */}
            <div className="dash-middle">
                <div className="dash-card dash-transactions">
                    <div className="dash-card-header">
                        <h3>Últimas Transacciones</h3>
                        <Link to="/transacciones" className="dash-view-all">Ver todas <ArrowUpRight size={14} /></Link>
                    </div>
                    {filteredTx.length > 0 ? (
                        <div className="dash-tx-list">
                            {filteredTx.slice(0, 5).map(tx => {
                                const cat = categories.find(c => c.id === tx.category_id);
                                return (
                                    <div key={tx.id} className="dash-tx-row">
                                        <div className="dash-tx-icon" style={{ backgroundColor: cat?.color || '#94A3B8' }}>
                                            {tx.type === 'income' ? <ArrowUpRight size={14} color="white" /> : <ArrowDownRight size={14} color="white" />}
                                        </div>
                                        <div className="dash-tx-info">
                                            <span className="dash-tx-desc">{tx.description || cat?.name || 'Transacción'}</span>
                                            <span className="dash-tx-cat">{cat?.name || 'Sin categoría'}</span>
                                        </div>
                                        <div className="dash-tx-right">
                                            <span className={`dash-tx-amount ${tx.type}`}>{tx.type === 'income' ? '+' : '-'}{fmtMoney(Number(tx.amount), currency)}</span>
                                            <span className="dash-tx-date">{format(parseLocalDate(tx.date), 'd MMM', { locale: es })}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : <p className="dash-empty">No hay transacciones aún</p>}
                </div>

                <div className="dash-card dash-statistics">
                    <h3>Estadísticas</h3>
                    {pieData.length > 0 ? (
                        <>
                            <ResponsiveContainer width="100%" height={180}>
                                <PieChart>
                                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                                        {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                                    </Pie>
                                    <Tooltip formatter={(v: unknown) => [`${currency} ${Number(v).toLocaleString()}`, 'Monto']} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="dash-pie-legend">
                                {pieData.map((e, i) => (
                                    <div key={i} className="dash-legend-item">
                                        <span className="dash-legend-dot" style={{ backgroundColor: e.color }}></span>
                                        <span>{e.name}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : <p className="dash-empty">Sin datos</p>}
                </div>
            </div>

            {/* Bottom Row: Balance Card + Balance Details + Activity */}
            <div className="dash-bottom">
                {/* Balance Card (Credit Card Style) */}
                <div className="dash-balance-card">
                    <span className="dbc-label">Balance</span>
                    <span className="dbc-amount">{fmtMoney(balance, currency)}</span>
                    {accounts.length > 0 && (
                        <span className="dbc-accounts">{accounts.length} cuenta{accounts.length > 1 ? 's' : ''} activa{accounts.length > 1 ? 's' : ''}</span>
                    )}
                    <div className="dbc-decoration"></div>
                </div>

                {/* Balance Details */}
                <div className="dash-card dash-balance-details">
                    <h3>Detalle del Balance</h3>
                    <span className="dbd-total">{fmtMoney(totalAccountBalance || balance, currency)}</span>
                    <span className="dbd-subtitle">Balance Total</span>
                    <div className="dbd-grid">
                        <div className="dbd-item blue">
                            <span className="dbd-item-label">Este Mes</span>
                            <span className="dbd-item-value">{fmtMoney(monthIncome, currency)}</span>
                        </div>
                        <div className="dbd-item">
                            <span className="dbd-item-label">Gastos</span>
                            <span className="dbd-item-value">{fmtMoney(monthExpenses, currency)}</span>
                        </div>
                    </div>
                </div>

                {/* Activity Chart */}
                <div className="dash-card dash-activity">
                    <div className="dash-card-header">
                        <h3>Actividad</h3>
                        <Activity size={18} className="dash-activity-icon" />
                    </div>
                    <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={monthlyData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                            <XAxis dataKey="name" stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
                            <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
                            <Tooltip contentStyle={{ backgroundColor: '#fff', border: 'none', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                            <Bar dataKey="ingresos" fill="#10B981" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="gastos" fill="#EF4444" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Quick Actions */}
            {/* Upcoming Payments */}
            {(debts.length > 0 || subs.length > 0) && (
                <div className="dash-upcoming">
                    <h3>Próximos Pagos</h3>
                    <div className="dash-upcoming-list">
                        {debts.filter(d => d.payment_day).slice(0, 3).map(d => (
                            <div key={d.id} className="dash-upcoming-item debt">
                                <CreditCard size={16} />
                                <span className="dui-name">{d.name}</span>
                                <span className="dui-amount">{d.installment_amount ? fmtMoney(d.installment_amount, d.currency) : '—'}</span>
                                <span className="dui-date">Día {d.payment_day}</span>
                            </div>
                        ))}
                        {subs.slice(0, 3).map(s => (
                            <div key={s.id} className="dash-upcoming-item sub">
                                <Activity size={16} />
                                <span className="dui-name">{s.name}</span>
                                <span className="dui-amount">{fmtMoney(s.amount, s.currency)}</span>
                                <span className="dui-date">{format(new Date(s.next_billing_date), 'd MMM', { locale: es })}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Retirement Widget */}
            {retirementData && (
                <div className="dash-retirement">
                    <div className="ret-header">
                        <Palmtree size={22} />
                        <h3>Proyección de Jubilación</h3>
                    </div>
                    <div className="ret-content">
                        <div className="ret-age-display">
                            <span className="ret-current-age">{retirementData.currentAge} años</span>
                            <span className="ret-arrow">→</span>
                            <span className="ret-retire-age">
                                {retirementData.retirementAge
                                    ? `${retirementData.retirementAge} años`
                                    : 'Sin datos suficientes'}
                            </span>
                        </div>
                        {retirementData.retirementAge && (
                            <div className="ret-details">
                                <div className="ret-detail">
                                    <span className="ret-detail-label">Años restantes</span>
                                    <span className="ret-detail-value">{retirementData.yearsLeft}</span>
                                </div>
                                <div className="ret-detail">
                                    <span className="ret-detail-label">Meta (regla 4%)</span>
                                    <span className="ret-detail-value">{fmtMoney(retirementData.target, currency)}</span>
                                </div>
                                <div className="ret-detail">
                                    <span className="ret-detail-label">Patrimonio actual</span>
                                    <span className="ret-detail-value">{fmtMoney(retirementData.current, currency)}</span>
                                </div>
                                <div className="ret-detail">
                                    <span className="ret-detail-label">Ahorro mensual promedio</span>
                                    <span className="ret-detail-value">{fmtMoney(retirementData.monthlyNeeded, currency)}</span>
                                </div>
                            </div>
                        )}
                        {retirementData.retirementAge && retirementData.retirementAge <= 65 && (
                            <div className="ret-badge good">Podrías jubilarte antes de los 65</div>
                        )}
                        {retirementData.retirementAge && retirementData.retirementAge > 65 && retirementData.retirementAge <= 75 && (
                            <div className="ret-badge moderate">Jubilación estimada entre 65 y 75 años</div>
                        )}
                        {retirementData.retirementAge && retirementData.retirementAge > 75 && (
                            <div className="ret-badge warning">Incrementa tu ahorro mensual para mejorar tu proyección</div>
                        )}
                        {!retirementData.retirementAge && (
                            <div className="ret-badge warning">Registra ingresos y gastos para calcular tu proyección</div>
                        )}
                    </div>
                </div>
            )}

            <div className="dash-quick-actions">
                <Link to="/transacciones?new=income" className="dqa-btn income"><Plus size={16} /> Registrar Ingreso</Link>
                <Link to="/transacciones?new=expense" className="dqa-btn expense"><Plus size={16} /> Registrar Gasto</Link>
                <Link to="/cuentas" className="dqa-btn accounts"><CreditCard size={16} /> Mis Cuentas</Link>
                <Link to="/metas" className="dqa-btn goals"><Target size={16} /> Mis Metas</Link>
            </div>

            {/* Alerts */}
            {budgetUsage.some(b => b.status === 'danger') && (
                <div className="dash-alert">
                    <AlertCircle size={18} />
                    <span>Presupuesto excedido en: {budgetUsage.filter(b => b.status === 'danger').map(b => b.category).join(', ')}</span>
                </div>
            )}
        </div>
    );
}
