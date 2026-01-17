import { useState, useEffect } from 'react';
import {
    Download,
    TrendingUp,
    TrendingDown,
    Calendar,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from 'recharts';
import { supabase } from '../lib/supabase';
import type { Transaction, Category } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import './Reportes.css';

export function Reportes() {
    const { user, profile } = useAuth();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedMonth, setSelectedMonth] = useState(new Date());

    const currency = profile?.currency || 'USD';

    useEffect(() => {
        if (user) fetchData();
    }, [user, selectedMonth]);

    const fetchData = async () => {
        const monthStart = startOfMonth(selectedMonth);
        const monthEnd = endOfMonth(selectedMonth);

        const [txRes, catRes] = await Promise.all([
            supabase
                .from('transactions')
                .select('*')
                .eq('user_id', user!.id)
                .gte('date', format(monthStart, 'yyyy-MM-dd'))
                .lte('date', format(monthEnd, 'yyyy-MM-dd')),
            supabase.from('categories').select('*').or(`user_id.eq.${user!.id},is_system.eq.true`),
        ]);

        setTransactions(txRes.data || []);
        setCategories(catRes.data || []);
        setLoading(false);
    };

    const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const expenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    const savings = income - expenses;
    const savingsRate = income > 0 ? (savings / income) * 100 : 0;

    // Category breakdown
    const categoryData = transactions
        .filter(t => t.type === 'expense')
        .reduce((acc: Record<string, number>, t) => {
            const catId = t.category_id || 'other';
            acc[catId] = (acc[catId] || 0) + Number(t.amount);
            return acc;
        }, {});

    const topCategories = Object.entries(categoryData)
        .map(([id, amount]) => {
            const cat = categories.find(c => c.id === id);
            return { name: cat?.name || 'Otros', amount, color: cat?.color || '#6B7280' };
        })
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

    // Bar chart data for expense distribution
    const barData = topCategories.map(c => ({ name: c.name, monto: c.amount }));

    // Export to CSV
    const exportCSV = () => {
        const headers = ['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto'];
        const rows = transactions.map(t => {
            const cat = categories.find(c => c.id === t.category_id);
            return [
                t.date,
                t.type === 'income' ? 'Ingreso' : 'Gasto',
                cat?.name || '',
                t.description || '',
                t.amount,
            ].join(',');
        });

        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bc-money-reporte-${format(selectedMonth, 'yyyy-MM')}.csv`;
        a.click();
    };

    if (loading) {
        return <div className="loading-container"><div className="loading-spinner"></div></div>;
    }

    return (
        <div className="reportes-page animate-fadeIn">
            {/* Header */}
            <div className="report-header">
                <div className="month-selector">
                    <button className="btn btn-icon btn-ghost" onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}>
                        <ChevronLeft size={20} />
                    </button>
                    <div className="current-month">
                        <Calendar size={18} />
                        <span>{format(selectedMonth, 'MMMM yyyy', { locale: es })}</span>
                    </div>
                    <button
                        className="btn btn-icon btn-ghost"
                        onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}
                        disabled={selectedMonth >= startOfMonth(new Date())}
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>
                <button className="btn btn-secondary" onClick={exportCSV}>
                    <Download size={18} />
                    Exportar CSV
                </button>
            </div>

            {/* Summary Cards */}
            <div className="summary-grid">
                <div className="summary-card">
                    <div className="summary-icon income"><TrendingUp size={24} /></div>
                    <div className="summary-content">
                        <span className="label">Ingresos Totales</span>
                        <span className="value">{currency} {income.toLocaleString()}</span>
                    </div>
                </div>
                <div className="summary-card">
                    <div className="summary-icon expense"><TrendingDown size={24} /></div>
                    <div className="summary-content">
                        <span className="label">Gastos Totales</span>
                        <span className="value">{currency} {expenses.toLocaleString()}</span>
                    </div>
                </div>
                <div className="summary-card">
                    <div className={`summary-icon ${savings >= 0 ? 'savings' : 'negative'}`}>
                        {savings >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                    </div>
                    <div className="summary-content">
                        <span className="label">Ahorro</span>
                        <span className={`value ${savings >= 0 ? 'positive' : 'negative'}`}>
                            {currency} {savings.toLocaleString()}
                        </span>
                    </div>
                </div>
                <div className="summary-card">
                    <div className={`summary-icon ${savingsRate >= 20 ? 'savings' : savingsRate >= 0 ? 'warning' : 'negative'}`}>
                        <span className="rate-icon">%</span>
                    </div>
                    <div className="summary-content">
                        <span className="label">Tasa de Ahorro</span>
                        <span className={`value ${savingsRate >= 20 ? 'positive' : savingsRate >= 0 ? '' : 'negative'}`}>
                            {savingsRate.toFixed(1)}%
                        </span>
                    </div>
                </div>
            </div>

            {/* Charts */}
            <div className="charts-row">
                <div className="chart-card">
                    <h3>Top 5 Categorías de Gasto</h3>
                    {barData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={barData} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                <XAxis type="number" stroke="var(--color-text-tertiary)" fontSize={12} />
                                <YAxis type="category" dataKey="name" stroke="var(--color-text-tertiary)" fontSize={12} width={100} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px' }}
                                    formatter={(value: number) => [`${currency} ${value.toLocaleString()}`, 'Monto']}
                                />
                                <Bar dataKey="monto" fill="var(--color-primary)" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="no-data">No hay gastos este mes</p>
                    )}
                </div>

                <div className="chart-card">
                    <h3>Distribución de Gastos</h3>
                    {topCategories.length > 0 ? (
                        <div className="pie-container">
                            <ResponsiveContainer width="100%" height={200}>
                                <PieChart>
                                    <Pie data={topCategories} dataKey="amount" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                                        {topCategories.map((entry, i) => (
                                            <Cell key={i} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(v: number) => [`${currency} ${v.toLocaleString()}`, 'Monto']} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="pie-legend">
                                {topCategories.map((cat, i) => (
                                    <div key={i} className="legend-item">
                                        <span className="legend-color" style={{ backgroundColor: cat.color }}></span>
                                        <span>{cat.name}</span>
                                        <span className="legend-value">{currency} {cat.amount.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="no-data">No hay datos para mostrar</p>
                    )}
                </div>
            </div>

            {/* Transactions Table */}
            <div className="transactions-section">
                <h3>Detalle de Transacciones ({transactions.length})</h3>
                <div className="transactions-table-container">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Descripción</th>
                                <th>Categoría</th>
                                <th>Tipo</th>
                                <th className="text-right">Monto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.length > 0 ? (
                                transactions.map(tx => {
                                    const cat = categories.find(c => c.id === tx.category_id);
                                    return (
                                        <tr key={tx.id}>
                                            <td>{format(new Date(tx.date), 'd MMM', { locale: es })}</td>
                                            <td>{tx.description || '-'}</td>
                                            <td>
                                                <span className="category-tag" style={{ backgroundColor: cat?.color || '#6B7280' }}>
                                                    {cat?.name || 'Sin categoría'}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`type-badge ${tx.type}`}>
                                                    {tx.type === 'income' ? 'Ingreso' : 'Gasto'}
                                                </span>
                                            </td>
                                            <td className={`text-right amount ${tx.type}`}>
                                                {tx.type === 'income' ? '+' : '-'}{currency} {Number(tx.amount).toLocaleString()}
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr><td colSpan={5} className="text-center">No hay transacciones este mes</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
