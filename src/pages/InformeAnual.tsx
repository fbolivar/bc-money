import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format, startOfYear, endOfYear, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { FileDown, TrendingUp, TrendingDown, Calendar, ChevronLeft, ChevronRight, Award, Target } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './InformeAnual.css';

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

interface MonthData {
    month: number;
    income: number;
    expense: number;
    balance: number;
    txCount: number;
}

interface CategoryTotal {
    name: string;
    total: number;
    count: number;
}

interface AnnualData {
    months: MonthData[];
    topExpenseCategories: CategoryTotal[];
    topIncomeCategories: CategoryTotal[];
    totalIncome: number;
    totalExpense: number;
    totalBalance: number;
    savingsRate: number;
    bestMonth: MonthData | null;
    worstMonth: MonthData | null;
    avgMonthlyExpense: number;
    avgMonthlyIncome: number;
    goalsCount: number;
    goalsCompleted: number;
}

export function InformeAnual() {
    const { user, profile } = useAuth();
    const currency = profile?.currency || 'COP';
    const currentYear = new Date().getFullYear();
    const [year, setYear] = useState(currentYear);
    const [data, setData] = useState<AnnualData | null>(null);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);

    const load = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        const yearStart = format(startOfYear(new Date(year, 0, 1)), 'yyyy-MM-dd');
        const yearEnd = format(endOfYear(new Date(year, 0, 1)), 'yyyy-MM-dd');

        const [txRes, catRes, goalsRes] = await Promise.all([
            supabase.from('transactions').select('amount,type,date,category_id')
                .eq('user_id', user.id).gte('date', yearStart).lte('date', yearEnd),
            supabase.from('categories').select('id,name'),
            supabase.from('goals').select('id,current_amount,target_amount').eq('user_id', user.id),
        ]);

        const txs = txRes.data || [];
        const cats = catRes.data || [];
        const goals = goalsRes.data || [];

        const months: MonthData[] = Array.from({ length: 12 }, (_, i) => ({
            month: i,
            income: 0, expense: 0, balance: 0, txCount: 0,
        }));

        for (const tx of txs) {
            const m = parseISO(tx.date).getMonth();
            const amt = Number(tx.amount);
            months[m].txCount++;
            if (tx.type === 'income') { months[m].income += amt; months[m].balance += amt; }
            else if (tx.type === 'expense') { months[m].expense += amt; months[m].balance -= amt; }
        }

        const expenseCatMap: Record<string, CategoryTotal> = {};
        const incomeCatMap: Record<string, CategoryTotal> = {};
        for (const tx of txs) {
            if (tx.type === 'expense') {
                const cat = cats.find(c => c.id === tx.category_id)?.name || 'Sin categoría';
                if (!expenseCatMap[cat]) expenseCatMap[cat] = { name: cat, total: 0, count: 0 };
                expenseCatMap[cat].total += Number(tx.amount);
                expenseCatMap[cat].count++;
            } else if (tx.type === 'income') {
                const cat = cats.find(c => c.id === tx.category_id)?.name || 'Sin categoría';
                if (!incomeCatMap[cat]) incomeCatMap[cat] = { name: cat, total: 0, count: 0 };
                incomeCatMap[cat].total += Number(tx.amount);
                incomeCatMap[cat].count++;
            }
        }

        const topExpenseCategories = Object.values(expenseCatMap).sort((a, b) => b.total - a.total).slice(0, 8);
        const topIncomeCategories = Object.values(incomeCatMap).sort((a, b) => b.total - a.total).slice(0, 5);

        const totalIncome = months.reduce((s, m) => s + m.income, 0);
        const totalExpense = months.reduce((s, m) => s + m.expense, 0);
        const totalBalance = totalIncome - totalExpense;
        const savingsRate = totalIncome > 0 ? (totalBalance / totalIncome) * 100 : 0;

        const activeMonths = months.filter(m => m.txCount > 0);
        const bestMonth = activeMonths.length > 0 ? activeMonths.reduce((a, b) => b.balance > a.balance ? b : a) : null;
        const worstMonth = activeMonths.length > 0 ? activeMonths.reduce((a, b) => b.balance < a.balance ? b : a) : null;
        const avgMonthlyExpense = activeMonths.length > 0 ? totalExpense / activeMonths.length : 0;
        const avgMonthlyIncome = activeMonths.length > 0 ? totalIncome / activeMonths.length : 0;

        const goalsCompleted = goals.filter(g => Number(g.current_amount) >= Number(g.target_amount)).length;

        setData({
            months, topExpenseCategories, topIncomeCategories,
            totalIncome, totalExpense, totalBalance, savingsRate,
            bestMonth, worstMonth, avgMonthlyExpense, avgMonthlyIncome,
            goalsCount: goals.length, goalsCompleted,
        });
        setLoading(false);
    }, [user, year]);

    useEffect(() => { load(); }, [load]);

    function fmt(n: number) {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
    }

    async function generatePDF() {
        if (!data) return;
        setGenerating(true);
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const W = doc.internal.pageSize.getWidth();

        // Header
        doc.setFillColor(99, 102, 241);
        doc.rect(0, 0, W, 28, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('INFORME ANUAL FINANCIERO', W / 2, 12, { align: 'center' });
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Año ${year} · ${profile?.full_name || user?.email || ''}`, W / 2, 21, { align: 'center' });

        let y = 36;
        doc.setTextColor(30, 30, 30);

        // Summary section
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Resumen del Año', 14, y);
        y += 6;

        autoTable(doc, {
            startY: y,
            head: [['Indicador', 'Valor']],
            body: [
                ['Total ingresos', fmt(data.totalIncome)],
                ['Total egresos', fmt(data.totalExpense)],
                ['Balance neto', fmt(data.totalBalance)],
                ['Tasa de ahorro', `${data.savingsRate.toFixed(1)}%`],
                ['Ingreso promedio mensual', fmt(data.avgMonthlyIncome)],
                ['Gasto promedio mensual', fmt(data.avgMonthlyExpense)],
                ['Mejor mes (balance)', data.bestMonth ? `${MONTH_NAMES[data.bestMonth.month]}: ${fmt(data.bestMonth.balance)}` : '-'],
                ['Peor mes (balance)', data.worstMonth ? `${MONTH_NAMES[data.worstMonth.month]}: ${fmt(data.worstMonth.balance)}` : '-'],
                ['Metas completadas', `${data.goalsCompleted} / ${data.goalsCount}`],
            ],
            styles: { fontSize: 10 },
            headStyles: { fillColor: [99, 102, 241] },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
        });

        y = (doc as any).lastAutoTable.finalY + 10;

        // Monthly breakdown
        if (y > 230) { doc.addPage(); y = 20; }
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Desglose Mensual', 14, y);
        y += 6;

        autoTable(doc, {
            startY: y,
            head: [['Mes', 'Ingresos', 'Egresos', 'Balance', 'Txns']],
            body: data.months.map(m => [
                MONTH_NAMES[m.month],
                fmt(m.income),
                fmt(m.expense),
                fmt(m.balance),
                String(m.txCount),
            ]),
            styles: { fontSize: 9 },
            headStyles: { fillColor: [99, 102, 241] },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
                1: { halign: 'right' }, 2: { halign: 'right' },
                3: { halign: 'right', fontStyle: 'bold' }, 4: { halign: 'center' },
            },
        });

        y = (doc as any).lastAutoTable.finalY + 10;

        // Top expense categories
        if (y > 230) { doc.addPage(); y = 20; }
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Top Categorías de Gasto', 14, y);
        y += 6;

        const expTotal = data.topExpenseCategories.reduce((s, c) => s + c.total, 0);
        autoTable(doc, {
            startY: y,
            head: [['Categoría', 'Total', '% del gasto', 'Transacciones']],
            body: data.topExpenseCategories.map(c => [
                c.name,
                fmt(c.total),
                expTotal > 0 ? `${((c.total / expTotal) * 100).toFixed(1)}%` : '0%',
                String(c.count),
            ]),
            styles: { fontSize: 9 },
            headStyles: { fillColor: [239, 68, 68] },
            alternateRowStyles: { fillColor: [255, 250, 250] },
            columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'center' } },
        });

        // Footer
        const totalPages = doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`BC Money · Informe Anual ${year} · Generado el ${format(new Date(), 'd MMMM yyyy', { locale: es })}`, W / 2, 290, { align: 'center' });
            doc.text(`Página ${i} de ${totalPages}`, W - 14, 290, { align: 'right' });
        }

        doc.save(`informe_anual_${year}.pdf`);
        setGenerating(false);
    }

    const maxExpense = data ? Math.max(...data.months.map(m => m.expense), 1) : 1;
    const maxIncome = data ? Math.max(...data.months.map(m => m.income), 1) : 1;

    return (
        <div className="ia-page">
            {/* Year selector */}
            <div className="ia-header">
                <div className="ia-year-nav">
                    <button type="button" onClick={() => setYear(y => y - 1)}><ChevronLeft size={18} /></button>
                    <span className="ia-year-label">{year}</span>
                    <button type="button" onClick={() => setYear(y => y + 1)} disabled={year >= currentYear}><ChevronRight size={18} /></button>
                </div>
                <button type="button" className="ia-export-btn" onClick={generatePDF} disabled={generating || loading || !data}>
                    <FileDown size={16} />
                    {generating ? 'Generando...' : 'Exportar PDF'}
                </button>
            </div>

            {loading && <div className="ia-loading">Cargando datos de {year}...</div>}

            {!loading && data && (
                <>
                    {/* KPI cards */}
                    <div className="ia-kpis">
                        <div className="ia-kpi income">
                            <TrendingUp size={18} />
                            <div>
                                <span>Ingresos totales</span>
                                <strong>{fmt(data.totalIncome)}</strong>
                                <em>Prom. {fmt(data.avgMonthlyIncome)}/mes</em>
                            </div>
                        </div>
                        <div className="ia-kpi expense">
                            <TrendingDown size={18} />
                            <div>
                                <span>Egresos totales</span>
                                <strong>{fmt(data.totalExpense)}</strong>
                                <em>Prom. {fmt(data.avgMonthlyExpense)}/mes</em>
                            </div>
                        </div>
                        <div className={`ia-kpi balance ${data.totalBalance >= 0 ? 'pos' : 'neg'}`}>
                            <Calendar size={18} />
                            <div>
                                <span>Balance neto</span>
                                <strong>{fmt(data.totalBalance)}</strong>
                                <em>Tasa ahorro: {data.savingsRate.toFixed(1)}%</em>
                            </div>
                        </div>
                        <div className="ia-kpi goals">
                            <Target size={18} />
                            <div>
                                <span>Metas completadas</span>
                                <strong>{data.goalsCompleted} / {data.goalsCount}</strong>
                                <em>{data.goalsCount > 0 ? `${Math.round(data.goalsCompleted / data.goalsCount * 100)}% cumplidas` : 'Sin metas'}</em>
                            </div>
                        </div>
                    </div>

                    {/* Best/Worst month */}
                    {(data.bestMonth || data.worstMonth) && (
                        <div className="ia-highlights">
                            {data.bestMonth && (
                                <div className="ia-highlight best">
                                    <Award size={16} />
                                    <div>
                                        <span>Mejor mes</span>
                                        <strong>{MONTH_NAMES[data.bestMonth.month]} {year}</strong>
                                        <em>Balance: {fmt(data.bestMonth.balance)}</em>
                                    </div>
                                </div>
                            )}
                            {data.worstMonth && (
                                <div className="ia-highlight worst">
                                    <TrendingDown size={16} />
                                    <div>
                                        <span>Mes más difícil</span>
                                        <strong>{MONTH_NAMES[data.worstMonth.month]} {year}</strong>
                                        <em>Balance: {fmt(data.worstMonth.balance)}</em>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Monthly chart */}
                    <div className="ia-section">
                        <h3 className="ia-section-title">Evolución Mensual</h3>
                        <div className="ia-chart">
                            {data.months.map(m => (
                                <div key={m.month} className="ia-chart-col">
                                    <div className="ia-chart-bars">
                                        <div
                                            className="ia-bar income"
                                            style={{ height: `${(m.income / Math.max(maxIncome, maxExpense)) * 100}%` }}
                                            title={`Ingresos: ${fmt(m.income)}`}
                                        />
                                        <div
                                            className="ia-bar expense"
                                            style={{ height: `${(m.expense / Math.max(maxIncome, maxExpense)) * 100}%` }}
                                            title={`Egresos: ${fmt(m.expense)}`}
                                        />
                                    </div>
                                    <span className="ia-chart-label">{MONTH_NAMES[m.month]}</span>
                                    {m.balance !== 0 && (
                                        <span className={`ia-chart-bal ${m.balance >= 0 ? 'pos' : 'neg'}`}>
                                            {m.balance >= 0 ? '+' : ''}{m.balance >= 1000000 ? `${(m.balance / 1000000).toFixed(1)}M` : m.balance >= 1000 ? `${Math.round(m.balance / 1000)}K` : String(Math.round(m.balance))}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="ia-chart-legend">
                            <span className="ia-legend-income">Ingresos</span>
                            <span className="ia-legend-expense">Egresos</span>
                        </div>
                    </div>

                    {/* Monthly table */}
                    <div className="ia-section">
                        <h3 className="ia-section-title">Tabla Mensual</h3>
                        <div className="ia-table-wrap">
                            <table className="ia-table">
                                <thead>
                                    <tr>
                                        <th>Mes</th>
                                        <th>Ingresos</th>
                                        <th>Egresos</th>
                                        <th>Balance</th>
                                        <th>Txns</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.months.map(m => (
                                        <tr key={m.month} className={m.txCount === 0 ? 'ia-row-empty' : ''}>
                                            <td>{MONTH_NAMES[m.month]}</td>
                                            <td className="ia-td-num income">{m.income > 0 ? fmt(m.income) : '—'}</td>
                                            <td className="ia-td-num expense">{m.expense > 0 ? fmt(m.expense) : '—'}</td>
                                            <td className={`ia-td-num bold ${m.balance >= 0 ? 'pos' : 'neg'}`}>
                                                {m.txCount > 0 ? fmt(m.balance) : '—'}
                                            </td>
                                            <td className="ia-td-center">{m.txCount || '—'}</td>
                                        </tr>
                                    ))}
                                    <tr className="ia-row-total">
                                        <td>Total {year}</td>
                                        <td className="ia-td-num income">{fmt(data.totalIncome)}</td>
                                        <td className="ia-td-num expense">{fmt(data.totalExpense)}</td>
                                        <td className={`ia-td-num bold ${data.totalBalance >= 0 ? 'pos' : 'neg'}`}>{fmt(data.totalBalance)}</td>
                                        <td className="ia-td-center">{data.months.reduce((s, m) => s + m.txCount, 0)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Top categories */}
                    <div className="ia-two-col">
                        <div className="ia-section">
                            <h3 className="ia-section-title">Top Gastos por Categoría</h3>
                            {data.topExpenseCategories.length === 0 ? (
                                <p className="ia-empty">Sin datos</p>
                            ) : data.topExpenseCategories.map(c => {
                                const pct = data.totalExpense > 0 ? (c.total / data.totalExpense) * 100 : 0;
                                return (
                                    <div key={c.name} className="ia-cat-row">
                                        <div className="ia-cat-info">
                                            <span className="ia-cat-name">{c.name}</span>
                                            <span className="ia-cat-amt expense">{fmt(c.total)}</span>
                                        </div>
                                        <div className="ia-cat-bar-wrap">
                                            <div className="ia-cat-bar expense" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="ia-cat-pct">{pct.toFixed(1)}%</span>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="ia-section">
                            <h3 className="ia-section-title">Top Fuentes de Ingreso</h3>
                            {data.topIncomeCategories.length === 0 ? (
                                <p className="ia-empty">Sin datos</p>
                            ) : data.topIncomeCategories.map(c => {
                                const pct = data.totalIncome > 0 ? (c.total / data.totalIncome) * 100 : 0;
                                return (
                                    <div key={c.name} className="ia-cat-row">
                                        <div className="ia-cat-info">
                                            <span className="ia-cat-name">{c.name}</span>
                                            <span className="ia-cat-amt income">{fmt(c.total)}</span>
                                        </div>
                                        <div className="ia-cat-bar-wrap">
                                            <div className="ia-cat-bar income" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="ia-cat-pct">{pct.toFixed(1)}%</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}

            {!loading && !data && (
                <div className="ia-loading">No hay datos para {year}</div>
            )}
        </div>
    );
}
