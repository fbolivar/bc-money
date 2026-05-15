import React, { useState, useEffect, useMemo } from 'react';
import {
    TrendingUp, TrendingDown, Calendar, ChevronLeft, ChevronRight,
    FileText, FileSpreadsheet, File, ArrowUpRight, ArrowDownRight, Minus, FileDown,
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell, Treemap,
} from 'recharts';
import { supabase } from '../lib/supabase';
import type { Transaction, Category, Account, Budget, Debt, Warranty, Subscription } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format, startOfMonth, endOfMonth, subMonths, addMonths, differenceInDays } from 'date-fns';
import { parseLocalDate } from '../lib/dates';
import { es } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './Reportes.css';

const TREEMAP_COLORS = [
    '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
    '#EC4899', '#06B6D4', '#F97316', '#84CC16', '#6366F1',
    '#14B8A6', '#F43F5E', '#A855F7', '#0EA5E9',
];

interface TreemapEntry {
    name: string;
    size: number;
    fill: string;
    pct: number;
    currency: string;
}

interface CustomContentProps {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    name?: string;
    size?: number;
    fill?: string;
    currency?: string;
}

function CustomContent(props: CustomContentProps) {
    const { x = 0, y = 0, width = 0, height = 0, name = '', size = 0, fill = '#6B7280', currency = '' } = props;
    const showContent = width > 60 && height > 40;
    const showAmount = width > 80 && height > 56;
    return (
        <g>
            <rect x={x} y={y} width={width} height={height} fill={fill} rx={4} ry={4} stroke="var(--color-background)" strokeWidth={2} />
            {showContent && (
                <>
                    <text
                        x={x + width / 2}
                        y={showAmount ? y + height / 2 - 8 : y + height / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="#fff"
                        fontSize={Math.min(13, Math.max(9, width / 8))}
                        fontWeight="600"
                        style={{ pointerEvents: 'none' }}
                    >
                        {name.length > Math.floor(width / 7) ? name.slice(0, Math.floor(width / 7) - 1) + '…' : name}
                    </text>
                    {showAmount && (
                        <text
                            x={x + width / 2}
                            y={y + height / 2 + 10}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill="rgba(255,255,255,0.85)"
                            fontSize={Math.min(11, Math.max(8, width / 10))}
                            style={{ pointerEvents: 'none' }}
                        >
                            {currency} {size.toLocaleString()}
                        </text>
                    )}
                </>
            )}
        </g>
    );
}

interface TreemapTooltipProps {
    active?: boolean;
    payload?: Array<{ payload: TreemapEntry }>;
}

function TreemapTooltip({ active, payload }: TreemapTooltipProps) {
    if (!active || !payload || payload.length === 0) return null;
    const d = payload[0].payload;
    return (
        <div className="treemap-tooltip">
            <span className="treemap-tooltip-dot" style={{ backgroundColor: d.fill }} />
            <div className="treemap-tooltip-body">
                <span className="treemap-tooltip-name">{d.name}</span>
                <span className="treemap-tooltip-amount">{d.currency} {d.size.toLocaleString()}</span>
                <span className="treemap-tooltip-pct">{d.pct.toFixed(1)}% del total</span>
            </div>
        </div>
    );
}

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
    const [generatingPDF, setGeneratingPDF] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(new Date());
    const [accountFilter, setAccountFilter] = useState<string>('all');

    // Comparar Períodos state
    const currentYear = new Date().getFullYear();
    const [periodA, setPeriodA] = useState({ month: new Date().getMonth() + 1, year: currentYear });
    const [periodB, setPeriodB] = useState({ month: new Date().getMonth() === 0 ? 12 : new Date().getMonth(), year: new Date().getMonth() === 0 ? currentYear - 1 : currentYear });
    const [periodATx, setPeriodATx] = useState<Transaction[]>([]);
    const [periodBTx, setPeriodBTx] = useState<Transaction[]>([]);

    const currency = profile?.currency || 'USD';
    const monthLabel = format(selectedMonth, 'MMMM yyyy', { locale: es });

    useEffect(() => {
        if (!user) return;
        const fetchData = async () => {
            // Build date range manually to avoid timezone issues
            const y = selectedMonth.getFullYear();
            const m = selectedMonth.getMonth();
            const firstDay = `${y}-${String(m + 1).padStart(2, '0')}-01`;
            const lastDayNum = new Date(y, m + 1, 0).getDate();
            const lastDay = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;
            const [txRes, catRes, accRes, budRes, debtRes, warRes, subRes] = await Promise.all([
                supabase.from('transactions').select('*').eq('user_id', user.id)
                    .gte('date', firstDay).lte('date', lastDay),
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

    // Fetch period comparison transactions independently
    useEffect(() => {
        if (!user) return;
        const fetchPeriod = async (month: number, year: number) => {
            const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
            const lastDayNum = new Date(year, month, 0).getDate();
            const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;
            const { data } = await supabase.from('transactions').select('*').eq('user_id', user.id)
                .gte('date', firstDay).lte('date', lastDay);
            return data || [];
        };
        fetchPeriod(periodA.month, periodA.year).then(setPeriodATx);
    }, [user, periodA]);

    useEffect(() => {
        if (!user) return;
        const fetchPeriod = async (month: number, year: number) => {
            const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
            const lastDayNum = new Date(year, month, 0).getDate();
            const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;
            const { data } = await supabase.from('transactions').select('*').eq('user_id', user.id)
                .gte('date', firstDay).lte('date', lastDay);
            return data || [];
        };
        fetchPeriod(periodB.month, periodB.year).then(setPeriodBTx);
    }, [user, periodB]);

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

    // Heatmap: gasto diario del mes seleccionado
    const heatmapData = useMemo(() => {
        const y = selectedMonth.getFullYear();
        const m = selectedMonth.getMonth();
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const firstWeekday = new Date(y, m, 1).getDay(); // 0=Dom
        const daily: Record<string, number> = {};
        filteredTx.filter(t => t.type === 'expense').forEach(t => {
            const day = t.date.slice(8, 10).replace(/^0/, '');
            daily[day] = (daily[day] ?? 0) + Number(t.amount);
        });
        const maxDay = Math.max(...Object.values(daily), 1);
        return { daily, maxDay, daysInMonth, firstWeekday };
    }, [filteredTx, selectedMonth]);

    const treemapData: TreemapEntry[] = Object.entries(categoryData)
        .map(([id, amount], i) => {
            const c = categories.find(x => x.id === id);
            return {
                name: c?.name || 'Otros',
                size: amount,
                fill: TREEMAP_COLORS[i % TREEMAP_COLORS.length],
                pct: expenses > 0 ? (amount / expenses) * 100 : 0,
                currency,
            };
        })
        .filter(d => d.size > 0)
        .sort((a, b) => b.size - a.size);

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

    // === GENERATE MONTHLY REPORT PDF ===
    async function generatePDF() {
        setGeneratingPDF(true);
        try {
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            const margin = 20;
            const contentW = pageW - margin * 2;
            const headerBlue: [number, number, number] = [26, 54, 93];
            const altGray: [number, number, number] = [247, 250, 252];
            const generatedDate = format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es });
            const capMonthLabel = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

            const addFooter = () => {
                const totalPages = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
                for (let i = 1; i <= totalPages; i++) {
                    doc.setPage(i);
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(8);
                    doc.setTextColor(150, 150, 150);
                    doc.text('Generado por BC Money', margin, pageH - 10);
                    doc.text(`Página ${i} de ${totalPages}`, pageW - margin, pageH - 10, { align: 'right' });
                    doc.setDrawColor(200, 200, 200);
                    doc.line(margin, pageH - 14, pageW - margin, pageH - 14);
                }
            };

            // ── 1. HEADER ──
            doc.setFillColor(...headerBlue);
            doc.rect(0, 0, pageW, 45, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(22);
            doc.setTextColor(255, 255, 255);
            doc.text('BC Money — Informe Financiero', pageW / 2, 18, { align: 'center' });

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(13);
            doc.setTextColor(200, 220, 255);
            doc.text(capMonthLabel, pageW / 2, 29, { align: 'center' });

            doc.setFontSize(9);
            doc.setTextColor(170, 195, 230);
            doc.text(`Generado el ${generatedDate}`, pageW / 2, 37, { align: 'center' });

            let y = 55;

            // ── 2. RESUMEN EJECUTIVO ──
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(...headerBlue);
            doc.text('Resumen Ejecutivo', margin, y);
            y += 5;

            autoTable(doc, {
                startY: y,
                margin: { left: margin, right: margin },
                tableWidth: contentW,
                head: [['Concepto', 'Valor']],
                body: [
                    ['Ingresos totales', `${currency} ${income.toLocaleString()}`],
                    ['Gastos totales', `${currency} ${expenses.toLocaleString()}`],
                    ['Balance neto', `${currency} ${savings.toLocaleString()}`],
                    ['Tasa de ahorro', `${savingsRate.toFixed(1)}%`],
                ],
                theme: 'grid',
                headStyles: { fillColor: headerBlue, textColor: 255, fontStyle: 'bold', fontSize: 10 },
                alternateRowStyles: { fillColor: altGray },
                styles: { font: 'helvetica', fontSize: 10 },
                columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
            });

            y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

            // ── 3. GASTOS POR CATEGORÍA ──
            const allCategoryData = filteredTx.filter(t => t.type === 'expense')
                .reduce((acc: Record<string, number>, t) => {
                    const k = t.category_id || 'other';
                    acc[k] = (acc[k] || 0) + Number(t.amount);
                    return acc;
                }, {});

            const allCategoryRows = Object.entries(allCategoryData)
                .map(([id, amount]) => {
                    const c = categories.find(x => x.id === id);
                    return { name: c?.name || 'Otros', amount };
                })
                .sort((a, b) => b.amount - a.amount);

            if (allCategoryRows.length > 0) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(13);
                doc.setTextColor(...headerBlue);
                doc.text('Gastos por Categoría', margin, y);
                y += 5;

                autoTable(doc, {
                    startY: y,
                    margin: { left: margin, right: margin },
                    tableWidth: contentW,
                    head: [['Categoría', 'Monto', '% del Total']],
                    body: allCategoryRows.map(r => [
                        r.name,
                        `${currency} ${r.amount.toLocaleString()}`,
                        expenses > 0 ? `${((r.amount / expenses) * 100).toFixed(1)}%` : '0%',
                    ]),
                    theme: 'striped',
                    headStyles: { fillColor: headerBlue, textColor: 255, fontStyle: 'bold', fontSize: 10 },
                    alternateRowStyles: { fillColor: altGray },
                    styles: { font: 'helvetica', fontSize: 9 },
                    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
                });

                y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
            }

            // ── 4. TOP 5 TRANSACCIONES MÁS ALTAS ──
            const top5Tx = [...filteredTx]
                .sort((a, b) => Number(b.amount) - Number(a.amount))
                .slice(0, 5);

            if (top5Tx.length > 0) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(13);
                doc.setTextColor(...headerBlue);
                doc.text('Top 5 Transacciones del Mes', margin, y);
                y += 5;

                autoTable(doc, {
                    startY: y,
                    margin: { left: margin, right: margin },
                    tableWidth: contentW,
                    head: [['Fecha', 'Descripción', 'Categoría', 'Monto']],
                    body: top5Tx.map(t => {
                        const cat = categories.find(c => c.id === t.category_id);
                        return [
                            t.date,
                            t.description || '—',
                            cat?.name || 'Sin categoría',
                            `${currency} ${Number(t.amount).toLocaleString()}`,
                        ];
                    }),
                    theme: 'striped',
                    headStyles: { fillColor: headerBlue, textColor: 255, fontStyle: 'bold', fontSize: 10 },
                    alternateRowStyles: { fillColor: altGray },
                    styles: { font: 'helvetica', fontSize: 9 },
                    columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } },
                });

                y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
            }

            // ── 5. BALANCE DE CUENTAS ──
            if (accounts.length > 0) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(13);
                doc.setTextColor(...headerBlue);
                doc.text('Balance de Cuentas', margin, y);
                y += 5;

                autoTable(doc, {
                    startY: y,
                    margin: { left: margin, right: margin },
                    tableWidth: contentW,
                    head: [['Cuenta', 'Tipo', 'Saldo actual']],
                    body: accounts.map(a => [
                        a.name,
                        a.type || '—',
                        `${currency} ${Number(a.balance).toLocaleString()}`,
                    ]),
                    theme: 'grid',
                    headStyles: { fillColor: headerBlue, textColor: 255, fontStyle: 'bold', fontSize: 10 },
                    alternateRowStyles: { fillColor: altGray },
                    styles: { font: 'helvetica', fontSize: 9 },
                    columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } },
                });
            }

            addFooter();
            doc.save(`bc-money-informe-${format(selectedMonth, 'yyyy-MM')}.pdf`);
        } finally {
            setGeneratingPDF(false);
        }
    }

    // === EXPORT PDF (legacy — transacciones completas) ===
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

    // === COMPARAR PERÍODOS HELPERS ===
    function calcPeriodStats(txList: Transaction[]) {
        const inc = txList.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
        const exp = txList.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
        const bal = inc - exp;
        const rate = inc > 0 ? (bal / inc) * 100 : 0;
        const count = txList.length;
        const catData = txList.filter(t => t.type === 'expense')
            .reduce((acc: Record<string, number>, t) => { const k = t.category_id || 'other'; acc[k] = (acc[k] || 0) + Number(t.amount); return acc; }, {});
        const top5 = Object.entries(catData)
            .map(([id, amount]) => { const c = categories.find(x => x.id === id); return { name: c?.name || 'Otros', amount, color: c?.color || '#6B7280' }; })
            .sort((a, b) => b.amount - a.amount).slice(0, 5);
        return { inc, exp, bal, rate, count, top5 };
    }

    const statsA = calcPeriodStats(periodATx);
    const statsB = calcPeriodStats(periodBTx);

    function pctChange(a: number, b: number) {
        if (a === 0 && b === 0) return 0;
        if (a === 0) return 100;
        return ((b - a) / Math.abs(a)) * 100;
    }

    // For change indicators: positive = good (green), negative = bad (red)
    // Income ↑ = good, Expenses ↑ = bad, Balance ↑ = good, Rate ↑ = good, Count neutral
    function changeIndicator(a: number, b: number, higherIsBetter: boolean) {
        const diff = b - a;
        const pct = pctChange(a, b);
        if (Math.abs(pct) < 0.1) return { icon: 'neutral', color: 'cmp-neutral', label: '0%' };
        const improved = higherIsBetter ? diff > 0 : diff < 0;
        return {
            icon: diff > 0 ? 'up' : 'down',
            color: improved ? 'cmp-positive' : 'cmp-negative',
            label: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`,
        };
    }

    const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const YEARS = [2022, 2023, 2024, 2025, 2026];

    function periodLabel(p: { month: number; year: number }) {
        return `${MONTHS_ES[p.month - 1]} ${p.year}`;
    }

    // Grouped bar chart data
    const compareBarData = [
        { name: 'Ingresos', periodoA: statsA.inc, periodoB: statsB.inc },
        { name: 'Gastos', periodoA: statsA.exp, periodoB: statsB.exp },
        { name: 'Balance', periodoA: Math.max(statsA.bal, 0), periodoB: Math.max(statsB.bal, 0) },
    ];

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
                    <button
                        className="btn btn-export informe-pdf"
                        onClick={generatePDF}
                        disabled={generatingPDF}
                        title="Generar informe PDF mensual"
                    >
                        <FileDown size={16} />
                        {generatingPDF ? 'Generando...' : 'Informe PDF'}
                    </button>
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

            {/* Treemap — Mapa de Gastos */}
            <div className="treemap-section">
                <h3>
                    Mapa de Gastos
                    <span className="treemap-section-period">{monthLabel}</span>
                </h3>
                {treemapData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={400}>
                        <Treemap
                            data={treemapData}
                            dataKey="size"
                            aspectRatio={4 / 3}
                            content={<CustomContent currency={currency} />}
                        >
                            <Tooltip content={<TreemapTooltip />} />
                        </Treemap>
                    </ResponsiveContainer>
                ) : (
                    <p className="no-data">Sin gastos registrados en este período</p>
                )}
            </div>

            {/* ── Mapa de calor de gastos diarios ── */}
            <div className="heatmap-section">
                <h3>Calor de Gastos — {monthLabel}</h3>
                <div className="heatmap-weekdays">
                    {['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(d => (
                        <span key={d} className="heatmap-wd">{d}</span>
                    ))}
                </div>
                <div className="heatmap-grid">
                    {/* Celdas vacías hasta el primer día */}
                    {Array.from({ length: heatmapData.firstWeekday }).map((_, i) => (
                        <div key={`empty-${i}`} className="heatmap-cell heatmap-cell--empty" />
                    ))}
                    {Array.from({ length: heatmapData.daysInMonth }, (_, i) => {
                        const day = String(i + 1);
                        const amount = heatmapData.daily[day] ?? 0;
                        const intensity = amount / heatmapData.maxDay;
                        const alpha = amount > 0 ? 0.15 + intensity * 0.85 : 0;
                        return (
                            <div
                                key={day}
                                className={`heatmap-cell ${amount > 0 ? 'heatmap-cell--active' : ''}`}
                                style={{ backgroundColor: amount > 0 ? `rgba(239,68,68,${alpha.toFixed(2)})` : undefined }}
                                title={amount > 0 ? `Día ${day}: ${currency} ${amount.toLocaleString()}` : `Día ${day}: sin gastos`}
                            >
                                <span className="heatmap-day">{day}</span>
                                {amount > 0 && (
                                    <span className="heatmap-amount">
                                        {amount >= 1_000_000 ? `${(amount/1_000_000).toFixed(1)}M` : amount >= 1_000 ? `${(amount/1_000).toFixed(0)}k` : String(Math.round(amount))}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
                <div className="heatmap-legend">
                    <span>Sin gasto</span>
                    <div className="heatmap-legend-bar">
                        {[0.1,0.3,0.5,0.7,0.9,1.0].map(a => (
                            <div key={a} style={{ background: `rgba(239,68,68,${a})`, flex: 1, height: '100%' }} />
                        ))}
                    </div>
                    <span>Máximo</span>
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
                                        <td>{format(parseLocalDate(tx.date), 'd MMM', { locale: es })}</td>
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

            {/* ── COMPARAR PERÍODOS ── */}
            <div className="cmp-section">
                <h2 className="cmp-title">
                    <Calendar size={20} />
                    Comparar Períodos
                </h2>

                {/* Period selectors */}
                <div className="cmp-selectors">
                    {/* Period A */}
                    <div className="cmp-period-selector cmp-period-a">
                        <span className="cmp-period-label">Período A</span>
                        <div className="cmp-select-row">
                            <select
                                className="cmp-select"
                                title="Mes del Período A"
                                value={periodA.month}
                                onChange={e => setPeriodA(p => ({ ...p, month: Number(e.target.value) }))}
                            >
                                {MONTHS_ES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                            </select>
                            <select
                                className="cmp-select"
                                title="Año del Período A"
                                value={periodA.year}
                                onChange={e => setPeriodA(p => ({ ...p, year: Number(e.target.value) }))}
                            >
                                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="cmp-vs">VS</div>

                    {/* Period B */}
                    <div className="cmp-period-selector cmp-period-b">
                        <span className="cmp-period-label">Período B</span>
                        <div className="cmp-select-row">
                            <select
                                className="cmp-select"
                                title="Mes del Período B"
                                value={periodB.month}
                                onChange={e => setPeriodB(p => ({ ...p, month: Number(e.target.value) }))}
                            >
                                {MONTHS_ES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                            </select>
                            <select
                                className="cmp-select"
                                title="Año del Período B"
                                value={periodB.year}
                                onChange={e => setPeriodB(p => ({ ...p, year: Number(e.target.value) }))}
                            >
                                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Metrics side-by-side */}
                <div className="cmp-metrics-grid">
                    {/* Header row */}
                    <div className="cmp-metric-header"></div>
                    <div className="cmp-metric-header cmp-header-a">{periodLabel(periodA)}</div>
                    <div className="cmp-metric-header cmp-change-col">Variación</div>
                    <div className="cmp-metric-header cmp-header-b">{periodLabel(periodB)}</div>

                    {/* Ingresos */}
                    {(() => { const ch = changeIndicator(statsA.inc, statsB.inc, true); return (<>
                        <div className="cmp-metric-name">Ingresos</div>
                        <div className="cmp-metric-val cmp-val-a">{currency} {statsA.inc.toLocaleString()}</div>
                        <div className={`cmp-change ${ch.color}`}>
                            {ch.icon === 'up' ? <ArrowUpRight size={14}/> : ch.icon === 'down' ? <ArrowDownRight size={14}/> : <Minus size={14}/>}
                            {ch.label}
                        </div>
                        <div className="cmp-metric-val cmp-val-b">{currency} {statsB.inc.toLocaleString()}</div>
                    </>); })()}

                    {/* Gastos */}
                    {(() => { const ch = changeIndicator(statsA.exp, statsB.exp, false); return (<>
                        <div className="cmp-metric-name">Gastos</div>
                        <div className="cmp-metric-val cmp-val-a">{currency} {statsA.exp.toLocaleString()}</div>
                        <div className={`cmp-change ${ch.color}`}>
                            {ch.icon === 'up' ? <ArrowUpRight size={14}/> : ch.icon === 'down' ? <ArrowDownRight size={14}/> : <Minus size={14}/>}
                            {ch.label}
                        </div>
                        <div className="cmp-metric-val cmp-val-b">{currency} {statsB.exp.toLocaleString()}</div>
                    </>); })()}

                    {/* Balance */}
                    {(() => { const ch = changeIndicator(statsA.bal, statsB.bal, true); return (<>
                        <div className="cmp-metric-name">Balance</div>
                        <div className={`cmp-metric-val cmp-val-a ${statsA.bal >= 0 ? 'positive' : 'negative'}`}>{currency} {statsA.bal.toLocaleString()}</div>
                        <div className={`cmp-change ${ch.color}`}>
                            {ch.icon === 'up' ? <ArrowUpRight size={14}/> : ch.icon === 'down' ? <ArrowDownRight size={14}/> : <Minus size={14}/>}
                            {ch.label}
                        </div>
                        <div className={`cmp-metric-val cmp-val-b ${statsB.bal >= 0 ? 'positive' : 'negative'}`}>{currency} {statsB.bal.toLocaleString()}</div>
                    </>); })()}

                    {/* Tasa de ahorro */}
                    {(() => { const ch = changeIndicator(statsA.rate, statsB.rate, true); return (<>
                        <div className="cmp-metric-name">Tasa de Ahorro</div>
                        <div className="cmp-metric-val cmp-val-a">{statsA.rate.toFixed(1)}%</div>
                        <div className={`cmp-change ${ch.color}`}>
                            {ch.icon === 'up' ? <ArrowUpRight size={14}/> : ch.icon === 'down' ? <ArrowDownRight size={14}/> : <Minus size={14}/>}
                            {ch.label}
                        </div>
                        <div className="cmp-metric-val cmp-val-b">{statsB.rate.toFixed(1)}%</div>
                    </>); })()}

                    {/* Transacciones */}
                    {(() => { const ch = changeIndicator(statsA.count, statsB.count, true); return (<>
                        <div className="cmp-metric-name">Transacciones</div>
                        <div className="cmp-metric-val cmp-val-a">{statsA.count}</div>
                        <div className={`cmp-change ${ch.color}`}>
                            {ch.icon === 'up' ? <ArrowUpRight size={14}/> : ch.icon === 'down' ? <ArrowDownRight size={14}/> : <Minus size={14}/>}
                            {ch.label}
                        </div>
                        <div className="cmp-metric-val cmp-val-b">{statsB.count}</div>
                    </>); })()}
                </div>

                {/* Grouped bar chart */}
                <div className="cmp-chart-card">
                    <h3>Ingresos y Gastos — Comparativa</h3>
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={compareBarData} barCategoryGap="30%" barGap={4}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                            <XAxis dataKey="name" stroke="var(--color-text-tertiary)" fontSize={12} />
                            <YAxis stroke="var(--color-text-tertiary)" fontSize={12} tickFormatter={(v: number) => `${currency} ${v.toLocaleString()}`} width={90} />
                            <Tooltip
                                contentStyle={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px' }}
                                formatter={(v: unknown, name: string) => [`${currency} ${Number(v).toLocaleString()}`, name]}
                            />
                            <Bar dataKey="periodoA" name={periodLabel(periodA)} fill="#3B82F6" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="periodoB" name={periodLabel(periodB)} fill="#10B981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                    <div className="cmp-chart-legend">
                        <span className="cmp-legend-dot cmp-dot-a"></span>
                        <span>{periodLabel(periodA)}</span>
                        <span className="cmp-legend-dot cmp-dot-b"></span>
                        <span>{periodLabel(periodB)}</span>
                    </div>
                </div>

                {/* Top 5 categorías side-by-side */}
                <div className="cmp-top-cats">
                    <div className="cmp-top-cat-col">
                        <h4 className="cmp-col-title-a">Top 5 Gastos — {periodLabel(periodA)}</h4>
                        {statsA.top5.length > 0 ? (
                            <div className="cmp-cat-list">
                                {statsA.top5.map((c, i) => (
                                    <div key={i} className="cmp-cat-row">
                                        <span className="cmp-cat-rank">{i + 1}</span>
                                        <span className="cmp-cat-dot" style={{ '--dot-color': c.color } as React.CSSProperties}></span>
                                        <span className="cmp-cat-name">{c.name}</span>
                                        <span className="cmp-cat-amount">{currency} {c.amount.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        ) : <p className="no-data">Sin gastos</p>}
                    </div>

                    <div className="cmp-top-cat-divider" />

                    <div className="cmp-top-cat-col">
                        <h4 className="cmp-col-title-b">Top 5 Gastos — {periodLabel(periodB)}</h4>
                        {statsB.top5.length > 0 ? (
                            <div className="cmp-cat-list">
                                {statsB.top5.map((c, i) => (
                                    <div key={i} className="cmp-cat-row">
                                        <span className="cmp-cat-rank">{i + 1}</span>
                                        <span className="cmp-cat-dot" style={{ '--dot-color': c.color } as React.CSSProperties}></span>
                                        <span className="cmp-cat-name">{c.name}</span>
                                        <span className="cmp-cat-amount">{currency} {c.amount.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        ) : <p className="no-data">Sin gastos</p>}
                    </div>
                </div>
            </div>
        </div>
    );
}
