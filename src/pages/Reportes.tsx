import { useState, useEffect } from 'react';
import {
    Download, TrendingUp, TrendingDown, Calendar, ChevronLeft, ChevronRight,
    FileText, FileSpreadsheet, File,
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { supabase } from '../lib/supabase';
import type { Transaction, Category, Account, Budget, Debt, Warranty, Subscription } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format, startOfMonth, endOfMonth, subMonths, addMonths, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './Reportes.css';

export function Reportes() {
    const { user, profile } = useAuth();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [debts, setDebts] = useState<Debt[]>([]);
    const [warranties, setWarranties] = useState<Warranty[]>([]);
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedMonth, setSelectedMonth] = useState(new Date());
    const [accountFilter, setAccountFilter] = useState<string>('all');

    const currency = profile?.currency || 'USD';
    const monthLabel = format(selectedMonth, 'MMMM yyyy', { locale: es });

    useEffect(() => {
        if (!user) return;
        const fetchData = async () => {
            const monthStart = startOfMonth(selectedMonth);
            const monthEnd = endOfMonth(selectedMonth);
            const [txRes, catRes, accRes, budRes, debtRes, warRes, subRes] = await Promise.all([
                supabase.from('transactions').select('*').eq('user_id', user.id)
                    .gte('date', format(monthStart, 'yyyy-MM-dd')).lte('date', format(monthEnd, 'yyyy-MM-dd')),
                supabase.from('categories').select('*').or(`user_id.eq.${user.id},is_system.eq.true`),
                supabase.from('accounts').select('*').eq('user_id', user.id).order('name'),
                supabase.from('budgets').select('*').eq('user_id', user.id),
                supabase.from('debts').select('*').eq('user_id', user.id),
                supabase.from('warranties').select('*').eq('user_id', user.id),
                supabase.from('subscriptions').select('*').eq('user_id', user.id).eq('status', 'active'),
            ]);
            setTransactions(txRes.data || []);
            setCategories(catRes.data || []);
            setAccounts(accRes.data || []);
            setBudgets(budRes.data || []);
            setDebts(debtRes.data || []);
            setWarranties(warRes.data || []);
            setSubscriptions(subRes.data || []);
            setLoading(false);
        };
        fetchData();
    }, [user, selectedMonth]);

    const filteredTx = accountFilter === 'all' ? transactions : transactions.filter(t => t.account_id === accountFilter);
    const income = filteredTx.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const expenses = filteredTx.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    const savings = income - expenses;
    const savingsRate = income > 0 ? (savings / income) * 100 : 0;

    const categoryData = filteredTx.filter(t => t.type === 'expense')
        .reduce((acc: Record<string, number>, t) => { const k = t.category_id || 'other'; acc[k] = (acc[k] || 0) + Number(t.amount); return acc; }, {});

    const topCategories = Object.entries(categoryData)
        .map(([id, amount]) => { const c = categories.find(x => x.id === id); return { name: c?.name || 'Otros', amount, color: c?.color || '#6B7280' }; })
        .sort((a, b) => b.amount - a.amount).slice(0, 5);

    const barData = topCategories.map(c => ({ name: c.name, monto: c.amount }));

    // Budget execution
    const budgetExec = budgets.map(b => {
        const cat = categories.find(c => c.id === b.category_id);
        const spent = filteredTx.filter(t => t.type === 'expense' && t.category_id === b.category_id).reduce((s, t) => s + Number(t.amount), 0);
        const pct = Number(b.amount) > 0 ? (spent / Number(b.amount)) * 100 : 0;
        return { category: cat?.name || 'General', budget: Number(b.amount), spent, pct, remaining: Number(b.amount) - spent };
    });

    // Active debts
    const activeDebts = debts.filter(d => d.status === 'active');
    const totalDebtRemaining = activeDebts.reduce((s, d) => s + Number(d.remaining_amount), 0);

    // Warranties expiring soon
    const expiringWarranties = warranties.filter(w => {
        const days = differenceInDays(new Date(w.warranty_end_date), new Date());
        return days >= 0 && days <= 90;
    });

    // === HELPERS FOR REPORT DATA ===
    function getTxRows() {
        return filteredTx.map(t => {
            const cat = categories.find(c => c.id === t.category_id);
            const acc = accounts.find(a => a.id === t.account_id);
            return {
                Fecha: t.date, Tipo: t.type === 'income' ? 'Ingreso' : 'Gasto',
                Categoría: cat?.name || '', Cuenta: acc?.name || '',
                Descripción: t.description || '', Monto: Number(t.amount),
            };
        });
    }

    function getBudgetRows() {
        return budgetExec.map(b => ({
            Categoría: b.category, Presupuesto: b.budget, Gastado: b.spent,
            Restante: b.remaining, '% Usado': Math.round(b.pct),
        }));
    }

    function getDebtRows() {
        return activeDebts.map(d => ({
            Nombre: d.name, Tipo: d.type, Acreedor: d.creditor || '',
            'Monto Original': Number(d.original_amount), Pendiente: Number(d.remaining_amount),
            'Cuotas Pagadas': `${d.paid_installments}/${d.total_installments || '—'}`,
        }));
    }

    function getWarrantyRows() {
        return expiringWarranties.map(w => ({
            Producto: w.product_name, Marca: w.brand || '', Categoría: w.category,
            'Fecha Compra': w.purchase_date, 'Vence': w.warranty_end_date,
            'Días Restantes': differenceInDays(new Date(w.warranty_end_date), new Date()),
        }));
    }

    // === EXPORT CSV ===
    function exportCSV() {
        const rows = getTxRows();
        const headers = Object.keys(rows[0] || {});
        const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${(r as Record<string, unknown>)[h] ?? ''}"`).join(','))].join('\n');
        downloadFile(csv, `bc-money-reporte-${format(selectedMonth, 'yyyy-MM')}.csv`, 'text/csv');
    }

    // === EXPORT XLS ===
    function exportXLS() {
        const wb = XLSX.utils.book_new();

        const txRows = getTxRows();
        if (txRows.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txRows), 'Transacciones');

        const bRows = getBudgetRows();
        if (bRows.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bRows), 'Presupuestos');

        const dRows = getDebtRows();
        if (dRows.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dRows), 'Deudas');

        const wRows = getWarrantyRows();
        if (wRows.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wRows), 'Garantías');

        // Summary sheet
        const summary = [
            { Concepto: 'Ingresos', Valor: income },
            { Concepto: 'Gastos', Valor: expenses },
            { Concepto: 'Ahorro', Valor: savings },
            { Concepto: 'Tasa de Ahorro', Valor: `${savingsRate.toFixed(1)}%` },
            { Concepto: 'Deuda Pendiente', Valor: totalDebtRemaining },
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Resumen');

        XLSX.writeFile(wb, `bc-money-reporte-${format(selectedMonth, 'yyyy-MM')}.xlsx`);
    }

    // === EXPORT PDF ===
    function exportPDF() {
        const doc = new jsPDF();
        const pageW = doc.internal.pageSize.getWidth();
        let y = 15;

        doc.setFontSize(18);
        doc.text('BC Money - Reporte Financiero', pageW / 2, y, { align: 'center' });
        y += 8;
        doc.setFontSize(11);
        doc.text(monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1), pageW / 2, y, { align: 'center' });
        y += 12;

        // Summary
        doc.setFontSize(13);
        doc.text('Resumen', 14, y); y += 7;
        autoTable(doc, {
            startY: y, head: [['Concepto', 'Valor']],
            body: [
                ['Ingresos', `${currency} ${income.toLocaleString()}`],
                ['Gastos', `${currency} ${expenses.toLocaleString()}`],
                ['Ahorro', `${currency} ${savings.toLocaleString()}`],
                ['Tasa de Ahorro', `${savingsRate.toFixed(1)}%`],
            ],
            theme: 'grid', headStyles: { fillColor: [16, 185, 129] },
        });
        y = (doc as unknown as Record<string, number>).lastAutoTable?.finalY + 10 || y + 40;

        // Transactions
        if (filteredTx.length > 0) {
            doc.setFontSize(13);
            doc.text('Transacciones', 14, y); y += 7;
            autoTable(doc, {
                startY: y,
                head: [['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto']],
                body: getTxRows().map(r => [r.Fecha, r.Tipo, r.Categoría, r.Descripción, `${currency} ${r.Monto.toLocaleString()}`]),
                theme: 'striped', headStyles: { fillColor: [16, 185, 129] }, styles: { fontSize: 8 },
            });
            y = (doc as unknown as Record<string, number>).lastAutoTable?.finalY + 10 || y + 40;
        }

        // Budgets
        if (budgetExec.length > 0) {
            if (y > 250) { doc.addPage(); y = 15; }
            doc.setFontSize(13);
            doc.text('Presupuestos', 14, y); y += 7;
            autoTable(doc, {
                startY: y,
                head: [['Categoría', 'Presupuesto', 'Gastado', 'Restante', '% Usado']],
                body: budgetExec.map(b => [b.category, `${currency} ${b.budget.toLocaleString()}`, `${currency} ${b.spent.toLocaleString()}`, `${currency} ${b.remaining.toLocaleString()}`, `${Math.round(b.pct)}%`]),
                theme: 'grid', headStyles: { fillColor: [59, 130, 246] }, styles: { fontSize: 8 },
            });
            y = (doc as unknown as Record<string, number>).lastAutoTable?.finalY + 10 || y + 40;
        }

        // Debts
        if (activeDebts.length > 0) {
            if (y > 250) { doc.addPage(); y = 15; }
            doc.setFontSize(13);
            doc.text('Deudas Activas', 14, y); y += 7;
            autoTable(doc, {
                startY: y,
                head: [['Nombre', 'Acreedor', 'Original', 'Pendiente', 'Cuotas']],
                body: activeDebts.map(d => [d.name, d.creditor || '', `${currency} ${Number(d.original_amount).toLocaleString()}`, `${currency} ${Number(d.remaining_amount).toLocaleString()}`, `${d.paid_installments}/${d.total_installments || '—'}`]),
                theme: 'grid', headStyles: { fillColor: [239, 68, 68] }, styles: { fontSize: 8 },
            });
        }

        doc.save(`bc-money-reporte-${format(selectedMonth, 'yyyy-MM')}.pdf`);
    }

    function downloadFile(content: string, filename: string, type: string) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    }

    if (loading) {
        return <div className="loading-container"><div className="loading-spinner"></div></div>;
    }

    return (
        <div className="reportes-page animate-fadeIn">
            {/* Header */}
            <div className="report-header">
                <div className="month-selector">
                    <button className="btn btn-icon btn-ghost" title="Mes anterior" onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}>
                        <ChevronLeft size={20} />
                    </button>
                    <div className="current-month">
                        <Calendar size={18} />
                        <span>{monthLabel}</span>
                    </div>
                    <button className="btn btn-icon btn-ghost" title="Mes siguiente" onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))} disabled={selectedMonth >= startOfMonth(new Date())}>
                        <ChevronRight size={20} />
                    </button>
                </div>
                {accounts.length > 0 && (
                    <select className="account-filter-select" value={accountFilter} onChange={e => setAccountFilter(e.target.value)} title="Filtrar por cuenta">
                        <option value="all">Todas las cuentas</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                )}
                <div className="export-buttons">
                    <button className="btn btn-export csv" onClick={exportCSV} title="Exportar CSV"><FileText size={16} /> CSV</button>
                    <button className="btn btn-export xls" onClick={exportXLS} title="Exportar Excel"><FileSpreadsheet size={16} /> XLS</button>
                    <button className="btn btn-export pdf" onClick={exportPDF} title="Exportar PDF"><File size={16} /> PDF</button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="summary-grid">
                <div className="summary-card">
                    <div className="summary-icon income"><TrendingUp size={24} /></div>
                    <div className="summary-content">
                        <span className="label">Ingresos</span>
                        <span className="value">{currency} {income.toLocaleString()}</span>
                    </div>
                </div>
                <div className="summary-card">
                    <div className="summary-icon expense"><TrendingDown size={24} /></div>
                    <div className="summary-content">
                        <span className="label">Gastos</span>
                        <span className="value">{currency} {expenses.toLocaleString()}</span>
                    </div>
                </div>
                <div className="summary-card">
                    <div className={`summary-icon ${savings >= 0 ? 'savings' : 'negative'}`}>
                        {savings >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                    </div>
                    <div className="summary-content">
                        <span className="label">Ahorro</span>
                        <span className={`value ${savings >= 0 ? 'positive' : 'negative'}`}>{currency} {savings.toLocaleString()}</span>
                    </div>
                </div>
                <div className="summary-card">
                    <div className={`summary-icon ${savingsRate >= 20 ? 'savings' : savingsRate >= 0 ? 'warning' : 'negative'}`}>
                        <span className="rate-icon">%</span>
                    </div>
                    <div className="summary-content">
                        <span className="label">Tasa de Ahorro</span>
                        <span className={`value ${savingsRate >= 20 ? 'positive' : ''}`}>{savingsRate.toFixed(1)}%</span>
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
                                <Tooltip contentStyle={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px' }} formatter={(v: unknown) => [`${currency} ${Number(v).toLocaleString()}`, 'Monto']} />
                                <Bar dataKey="monto" fill="var(--color-primary)" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : <p className="no-data">No hay gastos este mes</p>}
                </div>
                <div className="chart-card">
                    <h3>Distribución de Gastos</h3>
                    {topCategories.length > 0 ? (
                        <div className="pie-container">
                            <ResponsiveContainer width="100%" height={200}>
                                <PieChart>
                                    <Pie data={topCategories} dataKey="amount" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                                        {topCategories.map((e, i) => <Cell key={i} fill={e.color} />)}
                                    </Pie>
                                    <Tooltip formatter={(v: unknown) => [`${currency} ${Number(v).toLocaleString()}`, 'Monto']} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="pie-legend">
                                {topCategories.map((c, i) => (
                                    <div key={i} className="legend-item">
                                        <span className="legend-color" style={{ backgroundColor: c.color }}></span>
                                        <span>{c.name}</span>
                                        <span className="legend-value">{currency} {c.amount.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : <p className="no-data">No hay datos</p>}
                </div>
            </div>

            {/* Budget Execution */}
            {budgetExec.length > 0 && (
                <div className="report-section">
                    <h3>Ejecución de Presupuestos</h3>
                    <div className="transactions-table-container">
                        <table className="table">
                            <thead><tr><th>Categoría</th><th className="text-right">Presupuesto</th><th className="text-right">Gastado</th><th className="text-right">Restante</th><th className="text-right">% Usado</th></tr></thead>
                            <tbody>
                                {budgetExec.map((b, i) => (
                                    <tr key={i}>
                                        <td>{b.category}</td>
                                        <td className="text-right">{currency} {b.budget.toLocaleString()}</td>
                                        <td className="text-right">{currency} {b.spent.toLocaleString()}</td>
                                        <td className={`text-right ${b.remaining >= 0 ? 'positive' : 'negative'}`}>{currency} {b.remaining.toLocaleString()}</td>
                                        <td className="text-right">
                                            <span className={`type-badge ${b.pct <= 80 ? 'income' : b.pct <= 100 ? 'warning' : 'expense'}`}>{Math.round(b.pct)}%</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Active Debts */}
            {activeDebts.length > 0 && (
                <div className="report-section">
                    <h3>Deudas Activas — Total pendiente: {currency} {totalDebtRemaining.toLocaleString()}</h3>
                    <div className="transactions-table-container">
                        <table className="table">
                            <thead><tr><th>Nombre</th><th>Acreedor</th><th className="text-right">Original</th><th className="text-right">Pendiente</th><th>Cuotas</th></tr></thead>
                            <tbody>
                                {activeDebts.map(d => (
                                    <tr key={d.id}>
                                        <td>{d.name}</td>
                                        <td>{d.creditor || '—'}</td>
                                        <td className="text-right">{currency} {Number(d.original_amount).toLocaleString()}</td>
                                        <td className="text-right negative">{currency} {Number(d.remaining_amount).toLocaleString()}</td>
                                        <td>{d.paid_installments}/{d.total_installments || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Warranties Expiring */}
            {expiringWarranties.length > 0 && (
                <div className="report-section">
                    <h3>Garantías por Vencer (próximos 90 días)</h3>
                    <div className="transactions-table-container">
                        <table className="table">
                            <thead><tr><th>Producto</th><th>Marca</th><th>Vencimiento</th><th>Días Restantes</th></tr></thead>
                            <tbody>
                                {expiringWarranties.map(w => {
                                    const days = differenceInDays(new Date(w.warranty_end_date), new Date());
                                    return (
                                        <tr key={w.id}>
                                            <td>{w.product_name}</td>
                                            <td>{w.brand || '—'}</td>
                                            <td>{format(new Date(w.warranty_end_date), 'd MMM yyyy', { locale: es })}</td>
                                            <td><span className={`type-badge ${days <= 30 ? 'expense' : 'warning'}`}>{days} días</span></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Net Worth Summary */}
            <div className="report-section">
                <h3>Patrimonio Neto</h3>
                <div className="transactions-table-container">
                    <table className="table">
                        <thead><tr><th>Concepto</th><th className="text-right">Valor</th></tr></thead>
                        <tbody>
                            {accounts.map(a => <tr key={a.id}><td>{a.name}</td><td className="text-right positive">{currency} {Number(a.balance).toLocaleString()}</td></tr>)}
                            <tr className="total-row"><td><strong>Total Activos</strong></td><td className="text-right positive"><strong>{currency} {accounts.reduce((s, a) => s + Math.max(Number(a.balance), 0), 0).toLocaleString()}</strong></td></tr>
                            {activeDebts.map(d => <tr key={d.id}><td>{d.name}</td><td className="text-right negative">-{currency} {Number(d.remaining_amount).toLocaleString()}</td></tr>)}
                            <tr className="total-row"><td><strong>Total Pasivos</strong></td><td className="text-right negative"><strong>-{currency} {totalDebtRemaining.toLocaleString()}</strong></td></tr>
                            <tr className="total-row highlight"><td><strong>Patrimonio Neto</strong></td><td className={`text-right ${accounts.reduce((s, a) => s + Number(a.balance), 0) - totalDebtRemaining >= 0 ? 'positive' : 'negative'}`}><strong>{currency} {(accounts.reduce((s, a) => s + Number(a.balance), 0) - totalDebtRemaining).toLocaleString()}</strong></td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Subscriptions Summary */}
            {subscriptions.length > 0 && (
                <div className="report-section">
                    <h3>Suscripciones Activas — Costo mensual: {currency} {subscriptions.reduce((s, sub) => {
                        const multiplier = sub.billing_cycle === 'yearly' ? 1/12 : sub.billing_cycle === 'quarterly' ? 1/3 : sub.billing_cycle === 'weekly' ? 4.33 : 1;
                        return s + Number(sub.amount) * multiplier;
                    }, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
                    <div className="transactions-table-container">
                        <table className="table">
                            <thead><tr><th>Nombre</th><th>Ciclo</th><th className="text-right">Monto</th><th>Próximo Cobro</th></tr></thead>
                            <tbody>
                                {subscriptions.map(s => (
                                    <tr key={s.id}>
                                        <td>{s.name}</td>
                                        <td>{s.billing_cycle === 'monthly' ? 'Mensual' : s.billing_cycle === 'yearly' ? 'Anual' : s.billing_cycle === 'quarterly' ? 'Trimestral' : 'Semanal'}</td>
                                        <td className="text-right">{currency} {Number(s.amount).toLocaleString()}</td>
                                        <td>{format(new Date(s.next_billing_date), 'd MMM yyyy', { locale: es })}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Transactions Table */}
            <div className="report-section">
                <h3>Detalle de Transacciones ({filteredTx.length})</h3>
                <div className="transactions-table-container">
                    <table className="table">
                        <thead><tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Tipo</th><th className="text-right">Monto</th></tr></thead>
                        <tbody>
                            {filteredTx.length > 0 ? filteredTx.map(tx => {
                                const cat = categories.find(c => c.id === tx.category_id);
                                return (
                                    <tr key={tx.id}>
                                        <td>{format(new Date(tx.date), 'd MMM', { locale: es })}</td>
                                        <td>{tx.description || '-'}</td>
                                        <td><span className="category-tag" style={{ backgroundColor: cat?.color || '#6B7280' }}>{cat?.name || 'Sin categoría'}</span></td>
                                        <td><span className={`type-badge ${tx.type}`}>{tx.type === 'income' ? 'Ingreso' : 'Gasto'}</span></td>
                                        <td className={`text-right amount ${tx.type}`}>{tx.type === 'income' ? '+' : '-'}{currency} {Number(tx.amount).toLocaleString()}</td>
                                    </tr>
                                );
                            }) : <tr><td colSpan={5} className="text-center">No hay transacciones este mes</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
