import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    FileText, TrendingUp, TrendingDown, Receipt, Landmark, CreditCard,
    Download, AlertTriangle, CheckSquare, Square, Calculator, RefreshCw,
    ShieldAlert, Info,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './Declaracion.css';

// ─── Colombian tax constants ────────────────────────────────────────────────
const UVT_2024 = 47065;
const UVT_2025 = 49799; // Resolution DIAN 2025
const UVT_BY_YEAR: Record<number, number> = {
    2023: 42412,
    2024: 47065,
    2025: 49799,
    2026: 49799, // use 2025 until official
};

// Tarifa impuesto renta - personas naturales (Art. 241 E.T.)
// Rangos en UVT: [desde, hasta, tarifa%, base_fija_uvt]
const TAX_BRACKETS: Array<{ from: number; to: number; rate: number; base: number }> = [
    { from: 0,    to: 1090, rate: 0,   base: 0   },
    { from: 1090, to: 1700, rate: 19,  base: 0   },
    { from: 1700, to: 4100, rate: 28,  base: 116 },
    { from: 4100, to: 8670, rate: 33,  base: 788 },
    { from: 8670, to: 18970, rate: 35, base: 2296 },
    { from: 18970, to: 31000, rate: 37, base: 5901 },
    { from: 31000, to: Infinity, rate: 39, base: 10352 },
];

// Tax-relevant expense category keywords
const DEDUCTIBLE_KEYWORDS = [
    'salud', 'medicina', 'medico', 'hospital', 'educacion', 'educación',
    'universidad', 'arriendo', 'vivienda', 'hipoteca', 'interes', 'interés',
    'pension', 'pensión', 'aporte', 'seguro', 'impuesto', 'gmf', '4x1000',
    'donacion', 'donación', 'deducible', 'profesional', 'trabajo',
];

// Required documents checklist
const REQUIRED_DOCS = [
    {
        id: 'cedula',
        title: 'Cédula de ciudadanía',
        desc: 'Documento de identidad vigente',
    },
    {
        id: 'cert_ingresos',
        title: 'Certificado de ingresos y retenciones',
        desc: 'Emitido por empleador(es) del año fiscal',
    },
    {
        id: 'extractos',
        title: 'Extractos bancarios',
        desc: 'De todas las cuentas activas al 31 de diciembre',
    },
    {
        id: 'certificados_rte',
        title: 'Certificados de retención en la fuente',
        desc: 'De clientes o pagadores que aplicaron RteFte',
    },
    {
        id: 'escrituras',
        title: 'Escrituras o certificados catastrales',
        desc: 'Para bienes inmuebles de tu patrimonio',
    },
    {
        id: 'tarjetas',
        title: 'Extractos tarjetas de crédito',
        desc: 'Para informar pasivos al 31 de diciembre',
    },
    {
        id: 'inversiones',
        title: 'Certificados de inversiones',
        desc: 'CDT, acciones, fondos, bonos del año',
    },
    {
        id: 'deudas',
        title: 'Paz y salvos / certificados de deuda',
        desc: 'Para pasivos con entidades financieras',
    },
    {
        id: 'facturas_ded',
        title: 'Facturas de gastos deducibles',
        desc: 'Salud, educación, vivienda, dependientes',
    },
    {
        id: 'rut',
        title: 'RUT actualizado',
        desc: 'Registro Único Tributario con información al día',
    },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(n: number, currency = 'COP') {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency', currency,
        minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(n);
}

function fmtUVT(uvt: number) {
    return uvt.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcTax(rentaLiquida: number, uvt: number): number {
    if (rentaLiquida <= 0) return 0;
    const uvtUnits = rentaLiquida / uvt;
    for (const bracket of [...TAX_BRACKETS].reverse()) {
        if (uvtUnits > bracket.from) {
            const taxableUvt = uvtUnits - bracket.from;
            const tax = (taxableUvt * (bracket.rate / 100) + bracket.base) * uvt;
            return Math.max(0, tax);
        }
    }
    return 0;
}

function getActiveBracket(uvtUnits: number) {
    for (let i = TAX_BRACKETS.length - 1; i >= 0; i--) {
        if (uvtUnits > TAX_BRACKETS[i].from) return i;
    }
    return 0;
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface TaxData {
    ingresos: number;
    gastosDeducibles: number;
    ivaGenerado: number;
    retencionesRcibidas: number;
    patrimonioBruto: number;
    deudas: number;
}

const EMPTY_DATA: TaxData = {
    ingresos: 0,
    gastosDeducibles: 0,
    ivaGenerado: 0,
    retencionesRcibidas: 0,
    patrimonioBruto: 0,
    deudas: 0,
};

// ─── Component ───────────────────────────────────────────────────────────────
export function Declaracion() {
    const { user, profile } = useAuth();
    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState<number>(
        currentYear >= 2024 ? currentYear - 1 : 2023
    );
    const [data, setData] = useState<TaxData>(EMPTY_DATA);
    const [loading, setLoading] = useState(true);
    const [checkedDocs, setCheckedDocs] = useState<Set<string>>(new Set());

    const currency = profile?.currency || 'COP';
    const uvt = UVT_BY_YEAR[selectedYear] ?? UVT_2024;

    const fetchData = useCallback(async () => {
        if (!user) return;
        setLoading(true);

        const yearStart = `${selectedYear}-01-01`;
        const yearEnd = `${selectedYear}-12-31`;

        // ── Transactions ────────────────────────────────────────────────────
        const { data: txs } = await supabase
            .from('transactions')
            .select('id, amount, type, category_id, description')
            .eq('user_id', user.id)
            .gte('date', yearStart)
            .lte('date', yearEnd);

        const ingresos = (txs ?? [])
            .filter(t => t.type === 'income')
            .reduce((s, t) => s + (t.amount || 0), 0);

        // ── Deductible expenses ─────────────────────────────────────────────
        // We fetch categories to find names for matching
        const { data: cats } = await supabase
            .from('categories')
            .select('id, name')
            .or(`user_id.eq.${user.id},user_id.is.null`);

        const deductibleCatIds = new Set(
            (cats ?? [])
                .filter(c => DEDUCTIBLE_KEYWORDS.some(kw =>
                    c.name.toLowerCase().includes(kw)
                ))
                .map(c => c.id)
        );

        const gastosDeducibles = (txs ?? [])
            .filter(t =>
                t.type === 'expense' &&
                (
                    (t.category_id && deductibleCatIds.has(t.category_id)) ||
                    DEDUCTIBLE_KEYWORDS.some(kw =>
                        (t.description || '').toLowerCase().includes(kw)
                    )
                )
            )
            .reduce((s, t) => s + (t.amount || 0), 0);

        // ── Invoices (billing module) ───────────────────────────────────────
        let ivaGenerado = 0;
        let retencionesRcibidas = 0;
        try {
            const { data: invoices, error } = await supabase
                .from('invoices')
                .select('total_iva, total_rtefte, total_rteica, total_rteiva')
                .eq('user_id', user.id)
                .gte('fecha', yearStart)
                .lte('fecha', yearEnd)
                .neq('estado', 'anulada');

            if (!error && invoices) {
                ivaGenerado = invoices.reduce((s, i) => s + (i.total_iva || 0), 0);
                retencionesRcibidas = invoices.reduce(
                    (s, i) => s + (i.total_rtefte || 0) + (i.total_rteica || 0) + (i.total_rteiva || 0),
                    0
                );
            }
        } catch {
            // invoices table may not exist for all users
        }

        // ── Net worth snapshot ──────────────────────────────────────────────
        let patrimonioBruto = 0;
        try {
            const { data: snapshots, error } = await supabase
                .from('net_worth_snapshots')
                .select('total_assets')
                .eq('user_id', user.id)
                .gte('snapshot_date', yearStart)
                .lte('snapshot_date', yearEnd)
                .order('snapshot_date', { ascending: false })
                .limit(1);

            if (!error && snapshots && snapshots.length > 0) {
                patrimonioBruto = snapshots[0].total_assets || 0;
            }
        } catch {
            // table might not exist
        }

        // ── Debts ───────────────────────────────────────────────────────────
        let deudas = 0;
        try {
            const { data: debts, error } = await supabase
                .from('debts')
                .select('remaining_amount')
                .eq('user_id', user.id)
                .eq('status', 'active');

            if (!error && debts) {
                deudas = debts.reduce((s, d) => s + (d.remaining_amount || 0), 0);
            }
        } catch {
            // ignore
        }

        setData({ ingresos, gastosDeducibles, ivaGenerado, retencionesRcibidas, patrimonioBruto, deudas });
        setLoading(false);
    }, [user, selectedYear]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // ── Derived calculations ─────────────────────────────────────────────────
    const { rentaLiquida, impuesto, patrimonioLiquido, uvtUnits, activeBracket } = useMemo(() => {
        const rentaLiquida = Math.max(0, data.ingresos - data.gastosDeducibles);
        const impuesto = calcTax(rentaLiquida, uvt);
        const patrimonioLiquido = Math.max(0, data.patrimonioBruto - data.deudas);
        const uvtUnits = rentaLiquida / uvt;
        const activeBracket = getActiveBracket(uvtUnits);
        return { rentaLiquida, impuesto, patrimonioLiquido, uvtUnits, activeBracket };
    }, [data, uvt]);

    // ── Checklist toggle ─────────────────────────────────────────────────────
    const toggleDoc = useCallback((id: string) => {
        setCheckedDocs(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

    const checkProgress = Math.round((checkedDocs.size / REQUIRED_DOCS.length) * 100);

    // ── PDF Export ───────────────────────────────────────────────────────────
    const exportPDF = useCallback(() => {
        const doc = new jsPDF();
        const userName = profile?.full_name || 'Usuario';
        const dateStr = new Date().toLocaleDateString('es-CO');

        // Header
        doc.setFontSize(20);
        doc.setTextColor(79, 70, 229);
        doc.text('BC MONEY - Declaración de Renta', 14, 20);

        doc.setFontSize(11);
        doc.setTextColor(100, 116, 139);
        doc.text(`Año fiscal: ${selectedYear}  |  Contribuyente: ${userName}  |  Generado: ${dateStr}`, 14, 29);

        doc.setDrawColor(79, 70, 229);
        doc.setLineWidth(0.5);
        doc.line(14, 33, 196, 33);

        // Summary table
        doc.setFontSize(13);
        doc.setTextColor(15, 23, 42);
        doc.text('Resumen Fiscal', 14, 42);

        autoTable(doc, {
            startY: 46,
            head: [['Concepto', 'Valor (COP)', 'En UVT']],
            body: [
                ['Ingresos del año', fmt(data.ingresos, 'COP'), fmtUVT(data.ingresos / uvt)],
                ['Gastos deducibles', fmt(data.gastosDeducibles, 'COP'), fmtUVT(data.gastosDeducibles / uvt)],
                ['IVA generado (facturación)', fmt(data.ivaGenerado, 'COP'), fmtUVT(data.ivaGenerado / uvt)],
                ['Retenciones recibidas', fmt(data.retencionesRcibidas, 'COP'), fmtUVT(data.retencionesRcibidas / uvt)],
                ['Patrimonio bruto', fmt(data.patrimonioBruto, 'COP'), fmtUVT(data.patrimonioBruto / uvt)],
                ['Pasivos (deudas activas)', fmt(data.deudas, 'COP'), fmtUVT(data.deudas / uvt)],
            ],
            headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [238, 242, 255] },
            styles: { fontSize: 10 },
        });

        const afterSummary = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

        doc.setFontSize(13);
        doc.setTextColor(15, 23, 42);
        doc.text('Liquidación Estimada', 14, afterSummary);

        autoTable(doc, {
            startY: afterSummary + 4,
            head: [['Concepto', 'Valor']],
            body: [
                ['Renta líquida gravable', fmt(rentaLiquida, 'COP')],
                ['Renta líquida en UVT', `${fmtUVT(uvtUnits)} UVT`],
                [`UVT ${selectedYear}`, fmt(uvt, 'COP')],
                ['Tarifa marginal aplicable', `${TAX_BRACKETS[activeBracket].rate}%`],
                ['Impuesto estimado (Art. 241 E.T.)', fmt(impuesto, 'COP')],
                ['Retenciones recibidas (anticipo)', fmt(data.retencionesRcibidas, 'COP')],
                ['Saldo a pagar estimado', fmt(Math.max(0, impuesto - data.retencionesRcibidas), 'COP')],
                ['Patrimonio líquido al cierre', fmt(patrimonioLiquido, 'COP')],
            ],
            headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
            bodyStyles: { fontSize: 10 },
            didParseCell: (data) => {
                if (data.row.index === 4 && data.section === 'body') {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.textColor = [79, 70, 229];
                }
            },
        });

        const afterLiq = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

        // Disclaimer
        doc.setFontSize(8.5);
        doc.setTextColor(120, 53, 15);
        doc.setFillColor(255, 251, 235);
        doc.rect(14, afterLiq, 182, 18, 'F');
        doc.text(
            'AVISO: Este documento es una estimación orientativa. Los valores reales dependen de su situación tributaria\n' +
            'específica. Se recomienda verificar con un contador o asesor tributario certificado ante la DIAN.',
            17, afterLiq + 6,
        );

        doc.save(`declaracion-renta-${selectedYear}-${userName.replace(/\s/g, '_')}.pdf`);
    }, [data, rentaLiquida, impuesto, patrimonioLiquido, uvtUnits, activeBracket, uvt, selectedYear, profile]);

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="declaracion-page">
            {/* Header */}
            <div className="decl-header">
                <h1>Declaración de Renta</h1>
                <p>Estimador tributario — personas naturales Colombia (E.T. Art. 241)</p>
            </div>

            {/* Hero */}
            <div className="decl-hero">
                <div className="decl-hero-text">
                    <h2>Año Gravable {selectedYear}</h2>
                    <p>Resumen automático basado en tus transacciones y datos registrados</p>
                </div>
                <div className="decl-hero-controls">
                    <select
                        className="decl-year-select"
                        value={selectedYear}
                        onChange={e => setSelectedYear(Number(e.target.value))}
                        aria-label="Año fiscal"
                    >
                        {[2023, 2024, 2025, 2026].map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                    <button
                        className="btn-export-pdf"
                        onClick={exportPDF}
                        disabled={loading}
                    >
                        <Download size={16} />
                        Exportar PDF
                    </button>
                    <button
                        className="btn-export-pdf"
                        onClick={fetchData}
                        disabled={loading}
                        title="Actualizar datos"
                    >
                        <RefreshCw size={16} />
                    </button>
                </div>
            </div>

            {/* Loading */}
            {loading && (
                <div className="decl-loading">
                    <RefreshCw size={18} className="spin" />
                    Cargando datos fiscales…
                </div>
            )}

            {!loading && (
                <>
                    {/* Summary cards */}
                    <div className="decl-summary-grid">
                        <SummaryCard
                            className="card-income"
                            iconClass="icon-income"
                            icon={<TrendingUp size={18} />}
                            label="Ingresos del año"
                            value={fmt(data.ingresos, currency)}
                            note={`${fmtUVT(data.ingresos / uvt)} UVT`}
                        />
                        <SummaryCard
                            className="card-expense"
                            iconClass="icon-expense"
                            icon={<TrendingDown size={18} />}
                            label="Gastos deducibles estimados"
                            value={fmt(data.gastosDeducibles, currency)}
                            note={`${fmtUVT(data.gastosDeducibles / uvt)} UVT · salud, educación, vivienda…`}
                        />
                        <SummaryCard
                            className="card-iva"
                            iconClass="icon-iva"
                            icon={<Receipt size={18} />}
                            label="IVA generado (facturación)"
                            value={fmt(data.ivaGenerado, currency)}
                            note={data.ivaGenerado === 0 ? 'Sin módulo de facturación activo' : `${fmtUVT(data.ivaGenerado / uvt)} UVT`}
                        />
                        <SummaryCard
                            className="card-rte"
                            iconClass="icon-rte"
                            icon={<FileText size={18} />}
                            label="Retenciones recibidas"
                            value={fmt(data.retencionesRcibidas, currency)}
                            note="RteFte + RteICA + RteIVA de facturas"
                        />
                        <SummaryCard
                            className="card-patrimonio"
                            iconClass="icon-patrimonio"
                            icon={<Landmark size={18} />}
                            label="Patrimonio bruto"
                            value={fmt(data.patrimonioBruto, currency)}
                            note="Último snapshot del año"
                        />
                        <SummaryCard
                            className="card-deuda"
                            iconClass="icon-deuda"
                            icon={<CreditCard size={18} />}
                            label="Pasivos (deudas activas)"
                            value={fmt(data.deudas, currency)}
                            note={`Patrimonio líquido: ${fmt(patrimonioLiquido, currency)}`}
                        />
                    </div>

                    {/* Liquidación */}
                    <div className="decl-section">
                        <h2 className="decl-section-title">
                            <Calculator size={20} />
                            Liquidación Estimada del Impuesto
                        </h2>

                        <table className="decl-tax-table">
                            <thead>
                                <tr>
                                    <th>Concepto</th>
                                    <th style={{ textAlign: 'right' }}>Valor (COP)</th>
                                    <th style={{ textAlign: 'right' }}>UVT ({uvt.toLocaleString('es-CO')})</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>Ingresos brutos del año</td>
                                    <td style={{ textAlign: 'right' }} className="tax-amount-positive">
                                        {fmt(data.ingresos, currency)}
                                    </td>
                                    <td style={{ textAlign: 'right', color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>
                                        {fmtUVT(data.ingresos / uvt)}
                                    </td>
                                </tr>
                                <tr>
                                    <td>(-) Gastos deducibles</td>
                                    <td style={{ textAlign: 'right' }} className="tax-amount-negative">
                                        ({fmt(data.gastosDeducibles, currency)})
                                    </td>
                                    <td style={{ textAlign: 'right', color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>
                                        ({fmtUVT(data.gastosDeducibles / uvt)})
                                    </td>
                                </tr>
                                <tr className="row-highlight">
                                    <td><strong>= Renta líquida gravable</strong></td>
                                    <td style={{ textAlign: 'right' }}>
                                        <strong>{fmt(rentaLiquida, currency)}</strong>
                                    </td>
                                    <td style={{ textAlign: 'right', fontSize: '0.8rem' }}>
                                        <strong>{fmtUVT(uvtUnits)} UVT</strong>
                                    </td>
                                </tr>
                                <tr>
                                    <td>
                                        Tarifa marginal (rango activo: {TAX_BRACKETS[activeBracket].from}–
                                        {TAX_BRACKETS[activeBracket].to === Infinity ? '∞' : TAX_BRACKETS[activeBracket].to} UVT)
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        {TAX_BRACKETS[activeBracket].rate}%
                                    </td>
                                    <td />
                                </tr>
                                <tr className="row-total">
                                    <td>Impuesto estimado (Art. 241 E.T.)</td>
                                    <td style={{ textAlign: 'right', color: 'var(--color-primary)' }}>
                                        {fmt(impuesto, currency)}
                                    </td>
                                    <td style={{ textAlign: 'right', fontSize: '0.8rem' }}>
                                        {fmtUVT(impuesto / uvt)} UVT
                                    </td>
                                </tr>
                                {data.retencionesRcibidas > 0 && (
                                    <>
                                        <tr>
                                            <td>(-) Retenciones recibidas (anticipo)</td>
                                            <td style={{ textAlign: 'right' }} className="tax-amount-negative">
                                                ({fmt(data.retencionesRcibidas, currency)})
                                            </td>
                                            <td />
                                        </tr>
                                        <tr className="row-total">
                                            <td>Saldo neto a pagar estimado</td>
                                            <td style={{ textAlign: 'right', color: impuesto - data.retencionesRcibidas > 0 ? '#DC2626' : '#059669' }}>
                                                {fmt(Math.max(0, impuesto - data.retencionesRcibidas), currency)}
                                            </td>
                                            <td />
                                        </tr>
                                    </>
                                )}
                            </tbody>
                        </table>

                        <div className="decl-result-box">
                            <span className="decl-result-label">Impuesto de renta estimado {selectedYear}</span>
                            <span className="decl-result-value">{fmt(impuesto, currency)}</span>
                            <span className="decl-result-sub">
                                Renta líquida: {fmtUVT(uvtUnits)} UVT · Tarifa: {TAX_BRACKETS[activeBracket].rate}% · UVT {selectedYear}: ${uvt.toLocaleString('es-CO')}
                            </span>
                        </div>

                        {/* UVT scale */}
                        <details style={{ marginTop: '1.25rem' }}>
                            <summary style={{ cursor: 'pointer', fontSize: 'var(--font-size-sm)', color: 'var(--color-primary)', fontWeight: 600, userSelect: 'none' }}>
                                Ver tabla tarifaria completa (Art. 241 E.T.)
                            </summary>
                            <div style={{ overflowX: 'auto', marginTop: '0.75rem' }}>
                                <table className="decl-uvt-table">
                                    <thead>
                                        <tr>
                                            <th>Desde (UVT)</th>
                                            <th>Hasta (UVT)</th>
                                            <th>Tarifa</th>
                                            <th>Base fija (UVT)</th>
                                            <th>Desde (COP)</th>
                                            <th>Hasta (COP)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {TAX_BRACKETS.map((b, i) => (
                                            <tr key={i} className={i === activeBracket ? 'active-bracket' : ''}>
                                                <td>{b.from.toLocaleString('es-CO')}</td>
                                                <td>{b.to === Infinity ? 'En adelante' : b.to.toLocaleString('es-CO')}</td>
                                                <td><strong>{b.rate}%</strong></td>
                                                <td>{b.base.toLocaleString('es-CO')}</td>
                                                <td>{fmt(b.from * uvt, 'COP')}</td>
                                                <td>{b.to === Infinity ? '—' : fmt(b.to * uvt, 'COP')}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </details>
                    </div>

                    {/* Bottom grid: checklist + patrimony */}
                    <div className="decl-bottom-grid">
                        {/* Documents checklist */}
                        <div className="decl-section">
                            <h2 className="decl-section-title">
                                <CheckSquare size={20} />
                                Documentos Requeridos
                            </h2>
                            <div className="decl-check-progress">
                                <div className="decl-check-progress-bar">
                                    <div
                                        className="decl-check-progress-fill"
                                        style={{ width: `${checkProgress}%` }}
                                    />
                                </div>
                                <span className="decl-check-progress-label">
                                    {checkedDocs.size}/{REQUIRED_DOCS.length} listos
                                </span>
                            </div>
                            <div className="decl-checklist">
                                {REQUIRED_DOCS.map(doc => {
                                    const done = checkedDocs.has(doc.id);
                                    return (
                                        <div
                                            key={doc.id}
                                            className={`decl-check-item ${done ? 'checked' : ''}`}
                                            onClick={() => toggleDoc(doc.id)}
                                            role="checkbox"
                                            aria-checked={done}
                                            tabIndex={0}
                                            onKeyDown={e => e.key === ' ' && toggleDoc(doc.id)}
                                        >
                                            <span className={`decl-check-icon ${done ? 'done' : 'pending'}`}>
                                                {done
                                                    ? <CheckSquare size={18} />
                                                    : <Square size={18} />
                                                }
                                            </span>
                                            <div className="decl-check-text">
                                                <div className="decl-check-title">{doc.title}</div>
                                                <div className="decl-check-desc">{doc.desc}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Patrimony summary */}
                        <div className="decl-section">
                            <h2 className="decl-section-title">
                                <Landmark size={20} />
                                Resumen Patrimonial
                            </h2>
                            <table className="decl-tax-table">
                                <thead>
                                    <tr>
                                        <th>Concepto</th>
                                        <th style={{ textAlign: 'right' }}>Valor</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>Patrimonio bruto</td>
                                        <td style={{ textAlign: 'right' }} className="tax-amount-positive">
                                            {fmt(data.patrimonioBruto, currency)}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>(-) Pasivos (deudas activas)</td>
                                        <td style={{ textAlign: 'right' }} className="tax-amount-negative">
                                            ({fmt(data.deudas, currency)})
                                        </td>
                                    </tr>
                                    <tr className="row-total">
                                        <td>Patrimonio líquido</td>
                                        <td style={{ textAlign: 'right' }}>
                                            {fmt(patrimonioLiquido, currency)}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>Patrimonio líquido en UVT</td>
                                        <td style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                            {fmtUVT(patrimonioLiquido / uvt)} UVT
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            <div style={{ marginTop: '1.5rem' }}>
                                <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <Info size={14} />
                                    Umbrales obligados a declarar {selectedYear}
                                </h3>
                                <ThresholdRow
                                    label="Patrimonio bruto"
                                    threshold={4500 * uvt}
                                    value={data.patrimonioBruto}
                                    currency={currency}
                                    thresholdLabel={`> 4.500 UVT (${fmt(4500 * uvt, 'COP')})`}
                                />
                                <ThresholdRow
                                    label="Ingresos brutos"
                                    threshold={1400 * uvt}
                                    value={data.ingresos}
                                    currency={currency}
                                    thresholdLabel={`> 1.400 UVT (${fmt(1400 * uvt, 'COP')})`}
                                />
                                <ThresholdRow
                                    label="Consumos tarjetas"
                                    threshold={1400 * uvt}
                                    value={0}
                                    currency={currency}
                                    thresholdLabel={`> 1.400 UVT (verificar extractos)`}
                                    noValue
                                />
                            </div>
                        </div>
                    </div>

                    {/* Disclaimer */}
                    <div className="decl-disclaimer">
                        <ShieldAlert size={20} />
                        <p>
                            <strong>Aviso legal:</strong> Esta herramienta proporciona una <strong>estimación orientativa</strong> basada
                            en los datos registrados en BC Money. Los valores reales de su declaración de renta dependen de su situación
                            tributaria específica, deducciones especiales, rentas exentas, ingresos no constitutivos de renta y otros factores.
                            Se recomienda siempre verificar y presentar su declaración con un <strong>contador público o asesor tributario
                            certificado</strong> ante la DIAN. BC Money no asume responsabilidad por decisiones tributarias basadas en estas estimaciones.
                        </p>
                    </div>
                </>
            )}
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
interface SummaryCardProps {
    className: string;
    iconClass: string;
    icon: React.ReactNode;
    label: string;
    value: string;
    note?: string;
}

function SummaryCard({ className, iconClass, icon, label, value, note }: SummaryCardProps) {
    return (
        <div className={`decl-summary-card ${className}`}>
            <div className={`decl-card-icon ${iconClass}`}>{icon}</div>
            <div className="decl-card-label">{label}</div>
            <div className="decl-card-value">{value}</div>
            {note && <div className="decl-card-note">{note}</div>}
        </div>
    );
}

interface ThresholdRowProps {
    label: string;
    threshold: number;
    value: number;
    currency: string;
    thresholdLabel: string;
    noValue?: boolean;
}

function ThresholdRow({ label, threshold, value, currency, thresholdLabel, noValue }: ThresholdRowProps) {
    const exceeds = !noValue && value >= threshold;
    return (
        <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '0.5rem 0', borderBottom: '1px solid var(--color-border-light)',
            fontSize: 'var(--font-size-sm)',
        }}>
            <div>
                <div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{label}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)' }}>{thresholdLabel}</div>
            </div>
            {noValue ? (
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>Verificar</span>
            ) : (
                <span style={{
                    padding: '0.2rem 0.6rem', borderRadius: 'var(--radius-full)',
                    fontSize: '0.72rem', fontWeight: 700,
                    background: exceeds ? '#FEE2E2' : '#D1FAE5',
                    color: exceeds ? '#DC2626' : '#059669',
                }}>
                    {exceeds ? 'Obligado' : 'No aplica'}
                </span>
            )}
        </div>
    );
}
