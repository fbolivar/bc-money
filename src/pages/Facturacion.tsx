import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import {
    FileText, Plus, Search, Settings, Users, Building2, Trash2, Edit2,
    X, Save, Download, Eye, CheckCircle, Clock, Ban, ChevronDown, Upload,
    Receipt, AlertTriangle, Printer, MessageCircle, Mail, CreditCard,
    RefreshCw, BarChart2, ArrowRightCircle, Repeat, Copy,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './Facturacion.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type BillingConfig = {
    id: string;
    user_id: string;
    razon_social: string;
    nit: string;
    direccion: string;
    ciudad: string;
    departamento: string;
    telefono: string;
    email_empresa: string;
    regimen: string;
    actividad_economica: string;
    resolucion_dian: string;
    prefijo_factura: string;
    numero_desde: number;
    numero_hasta: number;
    numero_actual: number;
    fecha_resolucion: string | null;
    vigencia_hasta: string | null;
    logo_base64: string | null;
    notas_defecto: string;
};

type BillingClient = {
    id: string;
    user_id: string;
    tipo_persona: string;
    nombre: string;
    nit_cedula: string;
    direccion: string;
    ciudad: string;
    departamento: string;
    telefono: string;
    email: string;
    regimen: string;
    is_active: boolean;
    notes: string | null;
    created_at: string;
};

type InvoiceItem = {
    id?: string;
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    pct_iva: number;
    valor_iva: number;
    subtotal: number;
    total: number;
    sort_order: number;
};

type Invoice = {
    id: string;
    user_id: string;
    client_id: string | null;
    numero: string;
    fecha: string;
    fecha_vencimiento: string | null;
    subtotal: number;
    total_iva: number;
    pct_rtefte: number;
    total_rtefte: number;
    pct_rteica: number;
    total_rteica: number;
    aplica_rteiva: boolean;
    total_rteiva: number;
    total: number;
    datos_empresa: Record<string, unknown> | null;
    datos_cliente: Record<string, unknown> | null;
    estado: string;
    notas: string | null;
    created_at: string;
    billing_clients?: { nombre: string } | null;
};

type Tab = 'facturas' | 'clientes' | 'empresa' | 'cotizaciones' | 'notas' | 'recurrentes' | 'reportes';

// ─── New Types ─────────────────────────────────────────────────────────────────

type QuoteEstado = 'borrador' | 'enviada' | 'aceptada' | 'rechazada';

type Quote = {
    id: string;
    user_id: string;
    client_id: string | null;
    numero: string;
    fecha: string;
    fecha_vencimiento: string | null;
    subtotal: number;
    total_iva: number;
    pct_rtefte: number;
    total_rtefte: number;
    pct_rteica: number;
    total_rteica: number;
    aplica_rteiva: boolean;
    total_rteiva: number;
    total: number;
    datos_empresa: Record<string, unknown> | null;
    datos_cliente: Record<string, unknown> | null;
    estado: QuoteEstado;
    notas: string | null;
    created_at: string;
    billing_clients?: { nombre: string } | null;
};

type CreditNote = {
    id: string;
    user_id: string;
    client_id: string | null;
    invoice_id: string | null;
    numero: string;
    tipo: 'credito' | 'debito';
    concepto: string;
    fecha: string;
    subtotal: number;
    total_iva: number;
    total: number;
    datos_empresa: Record<string, unknown> | null;
    datos_cliente: Record<string, unknown> | null;
    notas: string | null;
    created_at: string;
    billing_clients?: { nombre: string } | null;
    invoices?: { numero: string } | null;
};

type RecurringInvoice = {
    id: string;
    user_id: string;
    client_id: string | null;
    nombre: string;
    frecuencia: 'semanal' | 'mensual' | 'trimestral' | 'anual';
    proximo_vencimiento: string;
    items_template: InvoiceItem[];
    pct_rtefte: number;
    pct_rteica: number;
    aplica_rteiva: boolean;
    notas: string | null;
    is_active: boolean;
    created_at: string;
    billing_clients?: { nombre: string } | null;
};

// ─── Constants ─────────────────────────────────────────────────────────────────

const IVA_OPTIONS = [0, 5, 19];

const ESTADO_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    borrador: { label: 'Borrador', color: '#94A3B8', icon: Clock },
    emitida: { label: 'Emitida', color: '#3B82F6', icon: FileText },
    pagada: { label: 'Pagada', color: '#10B981', icon: CheckCircle },
    anulada: { label: 'Anulada', color: '#EF4444', icon: Ban },
};

const QUOTE_ESTADO_CONFIG: Record<QuoteEstado, { label: string; color: string; icon: React.ElementType }> = {
    borrador: { label: 'Borrador', color: '#94A3B8', icon: Clock },
    enviada:  { label: 'Enviada',  color: '#3B82F6', icon: FileText },
    aceptada: { label: 'Aceptada', color: '#10B981', icon: CheckCircle },
    rechazada:{ label: 'Rechazada',color: '#EF4444', icon: Ban },
};

const REGIMEN_OPTIONS = [
    { value: 'simplificado', label: 'Régimen Simplificado' },
    { value: 'comun', label: 'Régimen Común (Responsable de IVA)' },
    { value: 'gran_contribuyente', label: 'Gran Contribuyente' },
    { value: 'persona_natural', label: 'Persona Natural No Responsable' },
];

const fmtCOP = (v: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);

function emptyItem(): InvoiceItem {
    return { descripcion: '', cantidad: 1, precio_unitario: 0, pct_iva: 19, valor_iva: 0, subtotal: 0, total: 0, sort_order: 0 };
}

function calcItem(item: InvoiceItem): InvoiceItem {
    const subtotal = +(item.cantidad * item.precio_unitario).toFixed(2);
    const valor_iva = +(subtotal * (item.pct_iva / 100)).toFixed(2);
    return { ...item, subtotal, valor_iva, total: subtotal + valor_iva };
}

// ─── PDF Generation ────────────────────────────────────────────────────────────

async function generatePDF(invoice: Invoice, items: InvoiceItem[], config: BillingConfig | null) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    const W = doc.internal.pageSize.getWidth();
    let y = 15;

    // Logo
    if (config?.logo_base64) {
        try {
            doc.addImage(config.logo_base64, 'PNG', 15, y, 35, 20);
        } catch { /* skip */ }
    }

    // Company header
    const empresa = (invoice.datos_empresa as BillingConfig) || config;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(empresa?.razon_social || '', config?.logo_base64 ? 55 : 15, y + 5);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    const compLines = [
        `NIT: ${empresa?.nit || ''}`,
        empresa?.direccion || '',
        `${empresa?.ciudad || ''} - ${empresa?.departamento || ''}`,
        empresa?.telefono || '',
        empresa?.email_empresa || '',
    ].filter(Boolean);
    compLines.forEach((line, i) => doc.text(line, config?.logo_base64 ? 55 : 15, y + 11 + i * 4));

    // Invoice header box (right side)
    const boxX = W - 75;
    doc.setFillColor(79, 70, 229);
    doc.roundedRect(boxX, y, 60, 28, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('FACTURA DE VENTA', boxX + 30, y + 7, { align: 'center' });
    doc.setFontSize(14);
    doc.text(`${empresa?.prefijo_factura || 'F'}-${invoice.numero}`, boxX + 30, y + 15, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha: ${invoice.fecha}`, boxX + 30, y + 21, { align: 'center' });
    if (invoice.fecha_vencimiento) doc.text(`Vence: ${invoice.fecha_vencimiento}`, boxX + 30, y + 25, { align: 'center' });

    y = Math.max(y + 40, y + compLines.length * 4 + 20);

    // DIAN resolution
    if (empresa?.resolucion_dian) {
        doc.setTextColor(80, 80, 80);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'italic');
        doc.text(
            `Autorización DIAN: Res. ${empresa.resolucion_dian}  |  Rango: ${empresa.numero_desde}-${empresa.numero_hasta}  |  Vigencia: ${empresa.vigencia_hasta || 'N/A'}`,
            15, y
        );
        y += 6;
    }

    // Divider
    doc.setDrawColor(200, 200, 200);
    doc.line(15, y, W - 15, y);
    y += 5;

    // Client section
    const cliente = invoice.datos_cliente as BillingClient | null;
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(15, y, W - 30, 22, 2, 2, 'F');
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENTE', 20, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(cliente?.nombre || 'Sin cliente', 20, y + 12);
    doc.text(`NIT/CC: ${cliente?.nit_cedula || '—'}`, 20, y + 17);
    if (cliente?.direccion) doc.text(cliente.direccion, 90, y + 12);
    if (cliente?.ciudad) doc.text(`${cliente.ciudad}, ${cliente.departamento || ''}`, 90, y + 17);
    if (cliente?.email) doc.text(cliente.email, 150, y + 12);
    if (cliente?.telefono) doc.text(cliente.telefono, 150, y + 17);
    y += 27;

    // Items table
    autoTable(doc, {
        startY: y,
        head: [['Descripción', 'Cant.', 'Precio Unit.', '% IVA', 'IVA', 'Total']],
        body: items.map(it => [
            it.descripcion,
            it.cantidad.toString(),
            fmtCOP(it.precio_unitario),
            `${it.pct_iva}%`,
            fmtCOP(it.valor_iva),
            fmtCOP(it.total),
        ]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
            0: { cellWidth: 'auto' },
            1: { halign: 'center', cellWidth: 15 },
            2: { halign: 'right', cellWidth: 28 },
            3: { halign: 'center', cellWidth: 15 },
            4: { halign: 'right', cellWidth: 24 },
            5: { halign: 'right', cellWidth: 28 },
        },
        margin: { left: 15, right: 15 },
    });

    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;

    // Totals box
    const totW = 75;
    const totX = W - 15 - totW;
    let ty = finalY;
    const row = (label: string, value: string, bold = false) => {
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(8);
        doc.setTextColor(60, 60, 60);
        doc.text(label, totX, ty);
        doc.text(value, totX + totW, ty, { align: 'right' });
        ty += 5;
    };
    row('Subtotal:', fmtCOP(invoice.subtotal));
    row('IVA:', fmtCOP(invoice.total_iva));
    if (invoice.pct_rtefte > 0) row(`RteFte (${invoice.pct_rtefte}%):`, `- ${fmtCOP(invoice.total_rtefte)}`);
    if (invoice.pct_rteica > 0) row(`RteICA (${invoice.pct_rteica}%):`, `- ${fmtCOP(invoice.total_rteica)}`);
    if (invoice.aplica_rteiva && invoice.total_rteiva > 0) row('RteIVA (15%):', `- ${fmtCOP(invoice.total_rteiva)}`);
    doc.setDrawColor(200, 200, 200);
    doc.line(totX, ty, totX + totW, ty);
    ty += 3;
    doc.setFillColor(79, 70, 229);
    doc.roundedRect(totX - 2, ty - 4, totW + 4, 9, 1, 1, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('TOTAL A PAGAR:', totX, ty + 2);
    doc.text(fmtCOP(invoice.total), totX + totW, ty + 2, { align: 'right' });

    // Notes
    if (invoice.notas || empresa?.notas_defecto) {
        const noteY = Math.max(ty + 15, finalY + 5);
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'italic');
        doc.text(invoice.notas || empresa?.notas_defecto || '', 15, noteY, { maxWidth: 100 });
    }

    // Footer
    const pgH = doc.internal.pageSize.getHeight();
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text('Generado con BC Money · bc-money.app', W / 2, pgH - 8, { align: 'center' });

    doc.save(`Factura-${empresa?.prefijo_factura || 'F'}-${invoice.numero}.pdf`);
}

// ─── Credit Note PDF ───────────────────────────────────────────────────────────

async function generateCreditNotePDF(cn: CreditNote, items: InvoiceItem[], config: BillingConfig | null) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    const W = doc.internal.pageSize.getWidth();
    let y = 15;

    if (config?.logo_base64) {
        try { doc.addImage(config.logo_base64, 'PNG', 15, y, 35, 20); } catch { /* skip */ }
    }

    const empresa = config;
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text(empresa?.razon_social || '', config?.logo_base64 ? 55 : 15, y + 5);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
    const compLines = [`NIT: ${empresa?.nit || ''}`, empresa?.direccion || '', `${empresa?.ciudad || ''} - ${empresa?.departamento || ''}`, empresa?.telefono || ''].filter(Boolean);
    compLines.forEach((line, i) => doc.text(line, config?.logo_base64 ? 55 : 15, y + 11 + i * 4));

    const boxX = W - 75;
    const headerColor: [number, number, number] = cn.tipo === 'credito' ? [16, 185, 129] : [239, 68, 68];
    doc.setFillColor(...headerColor);
    doc.roundedRect(boxX, y, 60, 28, 3, 3, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text(cn.tipo === 'credito' ? 'NOTA CRÉDITO' : 'NOTA DÉBITO', boxX + 30, y + 7, { align: 'center' });
    doc.setFontSize(14);
    doc.text(`NC-${cn.numero}`, boxX + 30, y + 15, { align: 'center' });
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(`Fecha: ${cn.fecha}`, boxX + 30, y + 21, { align: 'center' });

    y = Math.max(y + 40, y + compLines.length * 4 + 20);

    doc.setDrawColor(200, 200, 200); doc.line(15, y, W - 15, y); y += 5;

    const cliente = cn.datos_cliente as BillingClient | null;
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(15, y, W - 30, 22, 2, 2, 'F');
    doc.setTextColor(30, 30, 30); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('CLIENTE', 20, y + 6); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(cliente?.nombre || 'Sin cliente', 20, y + 12);
    doc.text(`NIT/CC: ${cliente?.nit_cedula || '—'}`, 20, y + 17);
    if (cn.concepto) { doc.setFont('helvetica', 'italic'); doc.text(`Concepto: ${cn.concepto}`, 90, y + 12); }
    y += 27;

    autoTable(doc, {
        startY: y,
        head: [['Descripción', 'Cant.', 'Precio Unit.', '% IVA', 'IVA', 'Total']],
        body: items.map(it => [it.descripcion, it.cantidad.toString(), fmtCOP(it.precio_unitario), `${it.pct_iva}%`, fmtCOP(it.valor_iva), fmtCOP(it.total)]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: headerColor, textColor: 255, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'center', cellWidth: 15 }, 2: { halign: 'right', cellWidth: 28 }, 3: { halign: 'center', cellWidth: 15 }, 4: { halign: 'right', cellWidth: 24 }, 5: { halign: 'right', cellWidth: 28 } },
        margin: { left: 15, right: 15 },
    });

    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
    const totW = 75; const totX = W - 15 - totW; let ty = finalY;
    const row = (label: string, value: string, bold = false) => {
        doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(8); doc.setTextColor(60, 60, 60);
        doc.text(label, totX, ty); doc.text(value, totX + totW, ty, { align: 'right' }); ty += 5;
    };
    row('Subtotal:', fmtCOP(cn.subtotal)); row('IVA:', fmtCOP(cn.total_iva));
    doc.setDrawColor(200, 200, 200); doc.line(totX, ty, totX + totW, ty); ty += 3;
    doc.setFillColor(...headerColor);
    doc.roundedRect(totX - 2, ty - 4, totW + 4, 9, 1, 1, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('TOTAL:', totX, ty + 2); doc.text(fmtCOP(cn.total), totX + totW, ty + 2, { align: 'right' });

    const pgH = doc.internal.pageSize.getHeight();
    doc.setFontSize(7); doc.setTextColor(150, 150, 150);
    doc.text('Generado con BC Money · bc-money.app', W / 2, pgH - 8, { align: 'center' });
    doc.save(`NotaCredito-NC-${cn.numero}.pdf`);
}

// ─── Invoice Form Modal ────────────────────────────────────────────────────────

function InvoiceModal({
    onClose, onSaved, config, clients, editInvoice,
}: {
    onClose: () => void;
    onSaved: () => void;
    config: BillingConfig | null;
    clients: BillingClient[];
    editInvoice: Invoice | null;
}) {
    const { user } = useAuth();
    const [saving, setSaving] = useState(false);
    const [clientId, setClientId] = useState(editInvoice?.client_id || '');
    const [fecha, setFecha] = useState(editInvoice?.fecha || new Date().toISOString().split('T')[0]);
    const [fechaVenc, setFechaVenc] = useState(editInvoice?.fecha_vencimiento || '');
    const [estado, setEstado] = useState(editInvoice?.estado || 'borrador');
    const [notas, setNotas] = useState(editInvoice?.notas || config?.notas_defecto || '');
    const [pctRtefte, setPctRtefte] = useState(editInvoice?.pct_rtefte ?? 0);
    const [pctRteica, setPctRteica] = useState(editInvoice?.pct_rteica ?? 0);
    const [aplicaRteiva, setAplicaRteiva] = useState(editInvoice?.aplica_rteiva ?? false);
    const [items, setItems] = useState<InvoiceItem[]>([emptyItem()]);
    const [loadingItems, setLoadingItems] = useState(!!editInvoice);

    useEffect(() => {
        if (!editInvoice) return;
        (async () => {
            const { data } = await supabase.from('invoice_items').select('*').eq('invoice_id', editInvoice.id).eq('user_id', user?.id).order('sort_order');
            if (data && data.length > 0) setItems(data as InvoiceItem[]);
            setLoadingItems(false);
        })();
    }, [editInvoice]);

    const updateItem = (idx: number, patch: Partial<InvoiceItem>) => {
        setItems(prev => prev.map((it, i) => i === idx ? calcItem({ ...it, ...patch }) : it));
    };

    const addItem = () => setItems(prev => [...prev, emptyItem()]);
    const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

    const subtotal = items.reduce((s, it) => s + it.subtotal, 0);
    const totalIva = items.reduce((s, it) => s + it.valor_iva, 0);
    const totalRtefte = +(subtotal * (pctRtefte / 100)).toFixed(2);
    const totalRteica = +(subtotal * (pctRteica / 100)).toFixed(2);
    const totalRteiva = aplicaRteiva ? +(totalIva * 0.15).toFixed(2) : 0;
    const total = +(subtotal + totalIva - totalRtefte - totalRteica - totalRteiva).toFixed(2);

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        try {
            const selectedClient = clients.find(c => c.id === clientId) || null;
            const invoiceData = {
                user_id: user.id,
                client_id: clientId || null,
                fecha,
                fecha_vencimiento: fechaVenc || null,
                estado,
                notas,
                subtotal,
                total_iva: totalIva,
                pct_rtefte: pctRtefte,
                total_rtefte: totalRtefte,
                pct_rteica: pctRteica,
                total_rteica: totalRteica,
                aplica_rteiva: aplicaRteiva,
                total_rteiva: totalRteiva,
                total,
                datos_empresa: config ? { ...config } : null,
                datos_cliente: selectedClient ? { ...selectedClient } : null,
            };

            let invoiceId = editInvoice?.id;

            if (editInvoice) {
                await supabase.from('invoices').update(invoiceData).eq('id', editInvoice.id);
                await supabase.from('invoice_items').delete().eq('invoice_id', editInvoice.id);
            } else {
                // Atomic invoice number via DB function (prevents race conditions / duplicate numbers)
                const { data: numero, error: numError } = await supabase.rpc('get_next_invoice_number', { p_user_id: user.id });
                if (numError) throw numError;
                const { data: inv, error } = await supabase.from('invoices').insert({ ...invoiceData, numero }).select().single();
                if (error) throw error;
                invoiceId = inv.id;
            }

            if (invoiceId && items.length > 0) {
                await supabase.from('invoice_items').insert(
                    items.map((it, i) => ({ ...it, id: undefined, invoice_id: invoiceId, user_id: user.id, sort_order: i }))
                );
            }

            onSaved();
        } catch (err) {
            alert('Error al guardar: ' + (err instanceof Error ? err.message : 'Error desconocido'));
        } finally {
            setSaving(false);
        }
    };

    if (loadingItems) return (
        <div className="modal-overlay"><div className="modal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
            <div className="loading-spinner" />
        </div></div>
    );

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{editInvoice ? `Editar Factura ${editInvoice.numero}` : 'Nueva Factura'}</h3>
                    <button onClick={onClose} className="close-btn"><X size={20} /></button>
                </div>

                <div className="modal-content invoice-form">
                    {/* Header row */}
                    <div className="invoice-header-grid">
                        <div className="form-group">
                            <label>Cliente</label>
                            <select className="form-input" value={clientId} onChange={e => setClientId(e.target.value)}>
                                <option value="">— Sin cliente —</option>
                                {clients.filter(c => c.is_active).map(c => (
                                    <option key={c.id} value={c.id}>{c.nombre} ({c.nit_cedula})</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Fecha</label>
                            <input type="date" className="form-input" value={fecha} onChange={e => setFecha(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>Vencimiento</label>
                            <input type="date" className="form-input" value={fechaVenc} onChange={e => setFechaVenc(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>Estado</label>
                            <select className="form-input" value={estado} onChange={e => setEstado(e.target.value)}>
                                {Object.entries(ESTADO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Items */}
                    <div className="items-section">
                        <div className="items-header">
                            <span>Descripción</span>
                            <span>Cant.</span>
                            <span>Precio Unit.</span>
                            <span>% IVA</span>
                            <span>IVA</span>
                            <span>Total</span>
                            <span></span>
                        </div>
                        {items.map((item, idx) => (
                            <div key={idx} className="item-row">
                                <input className="form-input" placeholder="Descripción del servicio/producto"
                                    value={item.descripcion} onChange={e => updateItem(idx, { descripcion: e.target.value })} />
                                <input className="form-input" type="number" min="0.001" step="0.001"
                                    value={item.cantidad} onChange={e => updateItem(idx, { cantidad: parseFloat(e.target.value) || 0 })} />
                                <input className="form-input" type="number" min="0" step="1"
                                    value={item.precio_unitario} onChange={e => updateItem(idx, { precio_unitario: parseFloat(e.target.value) || 0 })} />
                                <select className="form-input" value={item.pct_iva} onChange={e => updateItem(idx, { pct_iva: parseFloat(e.target.value) })}>
                                    {IVA_OPTIONS.map(v => <option key={v} value={v}>{v}%</option>)}
                                </select>
                                <span className="item-calc">{fmtCOP(item.valor_iva)}</span>
                                <span className="item-calc font-bold">{fmtCOP(item.total)}</span>
                                <button className="icon-btn text-danger" onClick={() => removeItem(idx)} disabled={items.length === 1}>
                                    <Trash2 size={15} />
                                </button>
                            </div>
                        ))}
                        <button className="btn btn-ghost add-item-btn" onClick={addItem}>
                            <Plus size={16} /> Agregar ítem
                        </button>
                    </div>

                    {/* Retenciones + Totals */}
                    <div className="invoice-bottom">
                        <div className="retenciones-section">
                            <h4>Retenciones</h4>
                            <div className="retencion-row">
                                <label>RteFte %</label>
                                <input className="form-input small-input" type="number" min="0" max="100" step="0.1"
                                    value={pctRtefte} onChange={e => setPctRtefte(parseFloat(e.target.value) || 0)} />
                                <span className="retencion-value">- {fmtCOP(totalRtefte)}</span>
                            </div>
                            <div className="retencion-row">
                                <label>RteICA %</label>
                                <input className="form-input small-input" type="number" min="0" max="100" step="0.001"
                                    value={pctRteica} onChange={e => setPctRteica(parseFloat(e.target.value) || 0)} />
                                <span className="retencion-value">- {fmtCOP(totalRteica)}</span>
                            </div>
                            <div className="retencion-row">
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                    <input type="checkbox" checked={aplicaRteiva} onChange={e => setAplicaRteiva(e.target.checked)} />
                                    RteIVA 15%
                                </label>
                                <span className="retencion-value">- {fmtCOP(totalRteiva)}</span>
                            </div>
                            <div className="form-group" style={{ marginTop: '1rem' }}>
                                <label>Notas</label>
                                <textarea className="form-input" rows={3} value={notas} onChange={e => setNotas(e.target.value)} />
                            </div>
                        </div>

                        <div className="totals-section">
                            <div className="total-row"><span>Subtotal</span><span>{fmtCOP(subtotal)}</span></div>
                            <div className="total-row"><span>IVA</span><span>{fmtCOP(totalIva)}</span></div>
                            {pctRtefte > 0 && <div className="total-row text-danger"><span>RteFte ({pctRtefte}%)</span><span>- {fmtCOP(totalRtefte)}</span></div>}
                            {pctRteica > 0 && <div className="total-row text-danger"><span>RteICA ({pctRteica}%)</span><span>- {fmtCOP(totalRteica)}</span></div>}
                            {aplicaRteiva && <div className="total-row text-danger"><span>RteIVA (15%)</span><span>- {fmtCOP(totalRteiva)}</span></div>}
                            <div className="total-row total-final"><span>TOTAL A PAGAR</span><span>{fmtCOP(total)}</span></div>
                        </div>
                    </div>
                </div>

                <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Guardando...' : <><Save size={16} /> {editInvoice ? 'Actualizar' : 'Crear Factura'}</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Quote Modal ───────────────────────────────────────────────────────────────

function QuoteModal({ onClose, onSaved, config, clients, editQuote }: {
    onClose: () => void; onSaved: () => void; config: BillingConfig | null;
    clients: BillingClient[]; editQuote: Quote | null;
}) {
    const { user } = useAuth();
    const [saving, setSaving] = useState(false);
    const [clientId, setClientId] = useState(editQuote?.client_id || '');
    const [fecha, setFecha] = useState(editQuote?.fecha || new Date().toISOString().split('T')[0]);
    const [fechaVenc, setFechaVenc] = useState(editQuote?.fecha_vencimiento || '');
    const [estado, setEstado] = useState<QuoteEstado>(editQuote?.estado || 'borrador');
    const [notas, setNotas] = useState(editQuote?.notas || config?.notas_defecto || '');
    const [pctRtefte, setPctRtefte] = useState(editQuote?.pct_rtefte ?? 0);
    const [pctRteica, setPctRteica] = useState(editQuote?.pct_rteica ?? 0);
    const [aplicaRteiva, setAplicaRteiva] = useState(editQuote?.aplica_rteiva ?? false);
    const [items, setItems] = useState<InvoiceItem[]>([emptyItem()]);
    const [loadingItems, setLoadingItems] = useState(!!editQuote);

    useEffect(() => {
        if (!editQuote) return;
        (async () => {
            const { data } = await supabase.from('quote_items').select('*').eq('quote_id', editQuote.id).eq('user_id', user?.id).order('sort_order');
            if (data && data.length > 0) setItems(data as InvoiceItem[]);
            setLoadingItems(false);
        })();
    }, [editQuote]);

    const updateItem = (idx: number, patch: Partial<InvoiceItem>) =>
        setItems(prev => prev.map((it, i) => i === idx ? calcItem({ ...it, ...patch }) : it));
    const addItem = () => setItems(prev => [...prev, emptyItem()]);
    const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

    const subtotal = items.reduce((s, it) => s + it.subtotal, 0);
    const totalIva = items.reduce((s, it) => s + it.valor_iva, 0);
    const totalRtefte = +(subtotal * (pctRtefte / 100)).toFixed(2);
    const totalRteica = +(subtotal * (pctRteica / 100)).toFixed(2);
    const totalRteiva = aplicaRteiva ? +(totalIva * 0.15).toFixed(2) : 0;
    const total = +(subtotal + totalIva - totalRtefte - totalRteica - totalRteiva).toFixed(2);

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        try {
            const selectedClient = clients.find(c => c.id === clientId) || null;
            const qData = {
                user_id: user.id, client_id: clientId || null, fecha,
                fecha_vencimiento: fechaVenc || null, estado, notas,
                subtotal, total_iva: totalIva,
                pct_rtefte: pctRtefte, total_rtefte: totalRtefte,
                pct_rteica: pctRteica, total_rteica: totalRteica,
                aplica_rteiva: aplicaRteiva, total_rteiva: totalRteiva, total,
                datos_empresa: config ? { ...config } : null,
                datos_cliente: selectedClient ? { ...selectedClient } : null,
            };
            let quoteId = editQuote?.id;
            if (editQuote) {
                await supabase.from('quotes').update(qData).eq('id', editQuote.id);
                await supabase.from('quote_items').delete().eq('quote_id', editQuote.id);
            } else {
                const { data: numero, error: numError } = await supabase.rpc('get_next_quote_number', { p_user_id: user.id });
                if (numError) throw numError;
                const { data: q, error } = await supabase.from('quotes').insert({ ...qData, numero }).select().single();
                if (error) throw error;
                quoteId = q.id;
            }
            if (quoteId && items.length > 0) {
                await supabase.from('quote_items').insert(
                    items.map((it, i) => ({ ...it, id: undefined, quote_id: quoteId, user_id: user.id, sort_order: i }))
                );
            }
            onSaved();
        } catch (err) {
            alert('Error al guardar: ' + (err instanceof Error ? err.message : 'Error desconocido'));
        } finally { setSaving(false); }
    };

    if (loadingItems) return (
        <div className="modal-overlay"><div className="modal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
            <div className="loading-spinner" />
        </div></div>
    );

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{editQuote ? `Editar Cotización ${editQuote.numero}` : 'Nueva Cotización'}</h3>
                    <button onClick={onClose} className="close-btn"><X size={20} /></button>
                </div>
                <div className="modal-content invoice-form">
                    <div className="invoice-header-grid">
                        <div className="form-group">
                            <label>Cliente</label>
                            <select className="form-input" value={clientId} onChange={e => setClientId(e.target.value)}>
                                <option value="">— Sin cliente —</option>
                                {clients.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.nit_cedula})</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Fecha</label>
                            <input type="date" className="form-input" value={fecha} onChange={e => setFecha(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>Vigencia hasta</label>
                            <input type="date" className="form-input" value={fechaVenc} onChange={e => setFechaVenc(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>Estado</label>
                            <select className="form-input" value={estado} onChange={e => setEstado(e.target.value as QuoteEstado)}>
                                {Object.entries(QUOTE_ESTADO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="items-section">
                        <div className="items-header">
                            <span>Descripción</span><span>Cant.</span><span>Precio Unit.</span>
                            <span>% IVA</span><span>IVA</span><span>Total</span><span></span>
                        </div>
                        {items.map((item, idx) => (
                            <div key={idx} className="item-row">
                                <input className="form-input" placeholder="Descripción" value={item.descripcion} onChange={e => updateItem(idx, { descripcion: e.target.value })} />
                                <input className="form-input" type="number" min="0.001" step="0.001" value={item.cantidad} onChange={e => updateItem(idx, { cantidad: parseFloat(e.target.value) || 0 })} />
                                <input className="form-input" type="number" min="0" value={item.precio_unitario} onChange={e => updateItem(idx, { precio_unitario: parseFloat(e.target.value) || 0 })} />
                                <select className="form-input" value={item.pct_iva} onChange={e => updateItem(idx, { pct_iva: parseFloat(e.target.value) })}>
                                    {IVA_OPTIONS.map(v => <option key={v} value={v}>{v}%</option>)}
                                </select>
                                <span className="item-calc">{fmtCOP(item.valor_iva)}</span>
                                <span className="item-calc font-bold">{fmtCOP(item.total)}</span>
                                <button className="icon-btn text-danger" onClick={() => removeItem(idx)} disabled={items.length === 1}><Trash2 size={15} /></button>
                            </div>
                        ))}
                        <button className="btn btn-ghost add-item-btn" onClick={addItem}><Plus size={16} /> Agregar ítem</button>
                    </div>
                    <div className="invoice-bottom">
                        <div className="retenciones-section">
                            <h4>Retenciones</h4>
                            <div className="retencion-row">
                                <label>RteFte %</label>
                                <input className="form-input small-input" type="number" min="0" max="100" step="0.1" value={pctRtefte} onChange={e => setPctRtefte(parseFloat(e.target.value) || 0)} />
                                <span className="retencion-value">- {fmtCOP(totalRtefte)}</span>
                            </div>
                            <div className="retencion-row">
                                <label>RteICA %</label>
                                <input className="form-input small-input" type="number" min="0" max="100" step="0.001" value={pctRteica} onChange={e => setPctRteica(parseFloat(e.target.value) || 0)} />
                                <span className="retencion-value">- {fmtCOP(totalRteica)}</span>
                            </div>
                            <div className="retencion-row">
                                <label className="retencion-checkbox-label">
                                    <input type="checkbox" checked={aplicaRteiva} onChange={e => setAplicaRteiva(e.target.checked)} /> RteIVA 15%
                                </label>
                                <span className="retencion-value">- {fmtCOP(totalRteiva)}</span>
                            </div>
                            <div className="form-group" style={{ marginTop: '1rem' }}>
                                <label>Notas</label>
                                <textarea className="form-input" rows={3} value={notas} onChange={e => setNotas(e.target.value)} />
                            </div>
                        </div>
                        <div className="totals-section">
                            <div className="total-row"><span>Subtotal</span><span>{fmtCOP(subtotal)}</span></div>
                            <div className="total-row"><span>IVA</span><span>{fmtCOP(totalIva)}</span></div>
                            {pctRtefte > 0 && <div className="total-row text-danger"><span>RteFte ({pctRtefte}%)</span><span>- {fmtCOP(totalRtefte)}</span></div>}
                            {pctRteica > 0 && <div className="total-row text-danger"><span>RteICA ({pctRteica}%)</span><span>- {fmtCOP(totalRteica)}</span></div>}
                            {aplicaRteiva && <div className="total-row text-danger"><span>RteIVA (15%)</span><span>- {fmtCOP(totalRteiva)}</span></div>}
                            <div className="total-row total-final"><span>TOTAL</span><span>{fmtCOP(total)}</span></div>
                        </div>
                    </div>
                </div>
                <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Guardando...' : <><Save size={16} /> {editQuote ? 'Actualizar' : 'Crear Cotización'}</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Credit Note Modal ─────────────────────────────────────────────────────────

function CreditNoteModal({ onClose, onSaved, config, clients, invoices }: {
    onClose: () => void; onSaved: () => void; config: BillingConfig | null;
    clients: BillingClient[]; invoices: Invoice[];
}) {
    const { user } = useAuth();
    const [saving, setSaving] = useState(false);
    const [tipo, setTipo] = useState<'credito' | 'debito'>('credito');
    const [clientId, setClientId] = useState('');
    const [invoiceId, setInvoiceId] = useState('');
    const [concepto, setConcepto] = useState('');
    const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
    const [notas, setNotas] = useState('');
    const [items, setItems] = useState<InvoiceItem[]>([emptyItem()]);

    const updateItem = (idx: number, patch: Partial<InvoiceItem>) =>
        setItems(prev => prev.map((it, i) => i === idx ? calcItem({ ...it, ...patch }) : it));
    const addItem = () => setItems(prev => [...prev, emptyItem()]);
    const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

    const subtotal = items.reduce((s, it) => s + it.subtotal, 0);
    const totalIva = items.reduce((s, it) => s + it.valor_iva, 0);
    const total = +(subtotal + totalIva).toFixed(2);

    const handleSave = async () => {
        if (!user || !concepto) { alert('El concepto es requerido'); return; }
        setSaving(true);
        try {
            const selectedClient = clients.find(c => c.id === clientId) || null;
            const cnData = {
                user_id: user.id, client_id: clientId || null,
                invoice_id: invoiceId || null, tipo, concepto, fecha,
                subtotal, total_iva: totalIva, total, notas,
                datos_empresa: config ? { ...config } : null,
                datos_cliente: selectedClient ? { ...selectedClient } : null,
            };
            const { data: numero, error: numError } = await supabase.rpc('get_next_credit_note_number', { p_user_id: user.id });
            if (numError) throw numError;
            const { data: cn, error } = await supabase.from('credit_notes').insert({ ...cnData, numero }).select().single();
            if (error) throw error;
            if (cn && items.length > 0) {
                await supabase.from('credit_note_items').insert(
                    items.map((it, i) => ({ ...it, id: undefined, credit_note_id: cn.id, user_id: user.id, sort_order: i }))
                );
            }
            onSaved();
        } catch (err) {
            alert('Error al guardar: ' + (err instanceof Error ? err.message : 'Error desconocido'));
        } finally { setSaving(false); }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Nueva Nota Crédito / Débito</h3>
                    <button onClick={onClose} className="close-btn"><X size={20} /></button>
                </div>
                <div className="modal-content invoice-form">
                    <div className="invoice-header-grid">
                        <div className="form-group">
                            <label>Tipo</label>
                            <select className="form-input" value={tipo} onChange={e => setTipo(e.target.value as 'credito' | 'debito')}>
                                <option value="credito">Nota Crédito</option>
                                <option value="debito">Nota Débito</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Factura de referencia</label>
                            <select className="form-input" value={invoiceId} onChange={e => setInvoiceId(e.target.value)}>
                                <option value="">— Sin referencia —</option>
                                {invoices.map(inv => <option key={inv.id} value={inv.id}>{config?.prefijo_factura || 'F'}-{inv.numero}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Cliente</label>
                            <select className="form-input" value={clientId} onChange={e => setClientId(e.target.value)}>
                                <option value="">— Sin cliente —</option>
                                {clients.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Fecha</label>
                            <input type="date" className="form-input" value={fecha} onChange={e => setFecha(e.target.value)} />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Concepto *</label>
                        <input className="form-input" placeholder="Motivo de la nota..." value={concepto} onChange={e => setConcepto(e.target.value)} />
                    </div>
                    <div className="items-section">
                        <div className="items-header">
                            <span>Descripción</span><span>Cant.</span><span>Precio Unit.</span>
                            <span>% IVA</span><span>IVA</span><span>Total</span><span></span>
                        </div>
                        {items.map((item, idx) => (
                            <div key={idx} className="item-row">
                                <input className="form-input" placeholder="Descripción" value={item.descripcion} onChange={e => updateItem(idx, { descripcion: e.target.value })} />
                                <input className="form-input" type="number" min="0.001" step="0.001" value={item.cantidad} onChange={e => updateItem(idx, { cantidad: parseFloat(e.target.value) || 0 })} />
                                <input className="form-input" type="number" min="0" value={item.precio_unitario} onChange={e => updateItem(idx, { precio_unitario: parseFloat(e.target.value) || 0 })} />
                                <select className="form-input" value={item.pct_iva} onChange={e => updateItem(idx, { pct_iva: parseFloat(e.target.value) })}>
                                    {IVA_OPTIONS.map(v => <option key={v} value={v}>{v}%</option>)}
                                </select>
                                <span className="item-calc">{fmtCOP(item.valor_iva)}</span>
                                <span className="item-calc font-bold">{fmtCOP(item.total)}</span>
                                <button className="icon-btn text-danger" onClick={() => removeItem(idx)} disabled={items.length === 1}><Trash2 size={15} /></button>
                            </div>
                        ))}
                        <button className="btn btn-ghost add-item-btn" onClick={addItem}><Plus size={16} /> Agregar ítem</button>
                    </div>
                    <div className="invoice-bottom">
                        <div className="form-group">
                            <label>Notas</label>
                            <textarea className="form-input" rows={3} value={notas} onChange={e => setNotas(e.target.value)} />
                        </div>
                        <div className="totals-section">
                            <div className="total-row"><span>Subtotal</span><span>{fmtCOP(subtotal)}</span></div>
                            <div className="total-row"><span>IVA</span><span>{fmtCOP(totalIva)}</span></div>
                            <div className="total-row total-final"><span>TOTAL</span><span>{fmtCOP(total)}</span></div>
                        </div>
                    </div>
                </div>
                <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Guardando...' : <><Save size={16} /> Crear Nota</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Recurring Invoice Modal ───────────────────────────────────────────────────

function RecurringModal({ onClose, onSaved, config, clients, editRecurring }: {
    onClose: () => void; onSaved: () => void; config: BillingConfig | null;
    clients: BillingClient[]; editRecurring: RecurringInvoice | null;
}) {
    const { user } = useAuth();
    const [saving, setSaving] = useState(false);
    const [nombre, setNombre] = useState(editRecurring?.nombre || '');
    const [clientId, setClientId] = useState(editRecurring?.client_id || '');
    const [frecuencia, setFrecuencia] = useState<RecurringInvoice['frecuencia']>(editRecurring?.frecuencia || 'mensual');
    const [proximoVenc, setProximoVenc] = useState(editRecurring?.proximo_vencimiento || new Date().toISOString().split('T')[0]);
    const [notas, setNotas] = useState(editRecurring?.notas || '');
    const [pctRtefte, setPctRtefte] = useState(editRecurring?.pct_rtefte ?? 0);
    const [pctRteica, setPctRteica] = useState(editRecurring?.pct_rteica ?? 0);
    const [aplicaRteiva, setAplicaRteiva] = useState(editRecurring?.aplica_rteiva ?? false);
    const [items, setItems] = useState<InvoiceItem[]>(editRecurring?.items_template || [emptyItem()]);

    const updateItem = (idx: number, patch: Partial<InvoiceItem>) =>
        setItems(prev => prev.map((it, i) => i === idx ? calcItem({ ...it, ...patch }) : it));
    const addItem = () => setItems(prev => [...prev, emptyItem()]);
    const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

    const handleSave = async () => {
        if (!user || !nombre) { alert('El nombre es requerido'); return; }
        setSaving(true);
        try {
            const rData = {
                user_id: user.id, nombre, client_id: clientId || null,
                frecuencia, proximo_vencimiento: proximoVenc, notas,
                pct_rtefte: pctRtefte, pct_rteica: pctRteica,
                aplica_rteiva: aplicaRteiva, is_active: true,
                items_template: items,
            };
            if (editRecurring) {
                const { error } = await supabase.from('recurring_invoices').update(rData).eq('id', editRecurring.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('recurring_invoices').insert(rData);
                if (error) throw error;
            }
            onSaved();
        } catch (err) {
            alert('Error al guardar: ' + (err instanceof Error ? err.message : 'Error desconocido'));
        } finally { setSaving(false); }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{editRecurring ? 'Editar Recurrente' : 'Nueva Factura Recurrente'}</h3>
                    <button onClick={onClose} className="close-btn"><X size={20} /></button>
                </div>
                <div className="modal-content invoice-form">
                    <div className="invoice-header-grid">
                        <div className="form-group">
                            <label>Nombre de la plantilla *</label>
                            <input className="form-input" placeholder="Ej: Arriendo mensual" value={nombre} onChange={e => setNombre(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>Cliente</label>
                            <select className="form-input" value={clientId} onChange={e => setClientId(e.target.value)}>
                                <option value="">— Sin cliente —</option>
                                {clients.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Frecuencia</label>
                            <select className="form-input" value={frecuencia} onChange={e => setFrecuencia(e.target.value as RecurringInvoice['frecuencia'])}>
                                <option value="semanal">Semanal</option>
                                <option value="mensual">Mensual</option>
                                <option value="trimestral">Trimestral</option>
                                <option value="anual">Anual</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Próximo vencimiento</label>
                            <input type="date" className="form-input" value={proximoVenc} onChange={e => setProximoVenc(e.target.value)} />
                        </div>
                    </div>
                    <div className="items-section">
                        <div className="items-header">
                            <span>Descripción</span><span>Cant.</span><span>Precio Unit.</span>
                            <span>% IVA</span><span>IVA</span><span>Total</span><span></span>
                        </div>
                        {items.map((item, idx) => (
                            <div key={idx} className="item-row">
                                <input className="form-input" placeholder="Descripción" value={item.descripcion} onChange={e => updateItem(idx, { descripcion: e.target.value })} />
                                <input className="form-input" type="number" min="0.001" step="0.001" value={item.cantidad} onChange={e => updateItem(idx, { cantidad: parseFloat(e.target.value) || 0 })} />
                                <input className="form-input" type="number" min="0" value={item.precio_unitario} onChange={e => updateItem(idx, { precio_unitario: parseFloat(e.target.value) || 0 })} />
                                <select className="form-input" value={item.pct_iva} onChange={e => updateItem(idx, { pct_iva: parseFloat(e.target.value) })}>
                                    {IVA_OPTIONS.map(v => <option key={v} value={v}>{v}%</option>)}
                                </select>
                                <span className="item-calc">{fmtCOP(item.valor_iva)}</span>
                                <span className="item-calc font-bold">{fmtCOP(item.total)}</span>
                                <button className="icon-btn text-danger" onClick={() => removeItem(idx)} disabled={items.length === 1}><Trash2 size={15} /></button>
                            </div>
                        ))}
                        <button className="btn btn-ghost add-item-btn" onClick={addItem}><Plus size={16} /> Agregar ítem</button>
                    </div>
                    <div className="invoice-bottom">
                        <div className="retenciones-section">
                            <h4>Retenciones</h4>
                            <div className="retencion-row">
                                <label>RteFte %</label>
                                <input className="form-input small-input" type="number" min="0" max="100" step="0.1" value={pctRtefte} onChange={e => setPctRtefte(parseFloat(e.target.value) || 0)} />
                            </div>
                            <div className="retencion-row">
                                <label>RteICA %</label>
                                <input className="form-input small-input" type="number" min="0" max="100" step="0.001" value={pctRteica} onChange={e => setPctRteica(parseFloat(e.target.value) || 0)} />
                            </div>
                            <div className="retencion-row">
                                <label className="retencion-checkbox-label">
                                    <input type="checkbox" checked={aplicaRteiva} onChange={e => setAplicaRteiva(e.target.checked)} /> RteIVA 15%
                                </label>
                            </div>
                            <div className="form-group" style={{ marginTop: '1rem' }}>
                                <label>Notas</label>
                                <textarea className="form-input" rows={2} value={notas} onChange={e => setNotas(e.target.value)} />
                            </div>
                        </div>
                        <div className="totals-section">
                            <div className="total-row"><span>Items configurados</span><span>{items.length}</span></div>
                        </div>
                    </div>
                </div>
                <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Guardando...' : <><Save size={16} /> {editRecurring ? 'Actualizar' : 'Crear Plantilla'}</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Client Modal ──────────────────────────────────────────────────────────────

function ClientModal({ onClose, onSaved, editClient }: {
    onClose: () => void;
    onSaved: () => void;
    editClient: BillingClient | null;
}) {
    const { user } = useAuth();
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        tipo_persona: editClient?.tipo_persona || 'natural',
        nombre: editClient?.nombre || '',
        nit_cedula: editClient?.nit_cedula || '',
        direccion: editClient?.direccion || '',
        ciudad: editClient?.ciudad || '',
        departamento: editClient?.departamento || '',
        telefono: editClient?.telefono || '',
        email: editClient?.email || '',
        regimen: editClient?.regimen || 'simplificado',
        notes: editClient?.notes || '',
    });

    const handleSave = async () => {
        if (!user || !form.nombre) { alert('El nombre es requerido'); return; }
        setSaving(true);
        const data = { ...form, user_id: user.id };
        const { error } = editClient
            ? await supabase.from('billing_clients').update(data).eq('id', editClient.id)
            : await supabase.from('billing_clients').insert(data);
        if (error) alert('Error: ' + error.message);
        else onSaved();
        setSaving(false);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{editClient ? 'Editar Cliente' : 'Nuevo Cliente'}</h3>
                    <button onClick={onClose} className="close-btn"><X size={20} /></button>
                </div>
                <div className="modal-content">
                    <div className="form-grid-2">
                        <div className="form-group">
                            <label>Tipo de persona</label>
                            <select className="form-input" value={form.tipo_persona} onChange={e => setForm({ ...form, tipo_persona: e.target.value })}>
                                <option value="natural">Persona Natural</option>
                                <option value="juridica">Persona Jurídica</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Régimen</label>
                            <select className="form-input" value={form.regimen} onChange={e => setForm({ ...form, regimen: e.target.value })}>
                                {REGIMEN_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                        </div>
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label>Nombre / Razón Social *</label>
                            <input className="form-input" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>NIT / Cédula</label>
                            <input className="form-input" value={form.nit_cedula} onChange={e => setForm({ ...form, nit_cedula: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>Email</label>
                            <input type="email" className="form-input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>Teléfono</label>
                            <input className="form-input" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>Ciudad</label>
                            <input className="form-input" value={form.ciudad} onChange={e => setForm({ ...form, ciudad: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label>Departamento</label>
                            <input className="form-input" value={form.departamento} onChange={e => setForm({ ...form, departamento: e.target.value })} />
                        </div>
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label>Dirección</label>
                            <input className="form-input" value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} />
                        </div>
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                            <label>Notas</label>
                            <textarea className="form-input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                        </div>
                    </div>
                </div>
                <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Guardando...' : <><Save size={16} /> Guardar Cliente</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Company Config Tab ────────────────────────────────────────────────────────

function EmpresaTab({ config, onSaved }: { config: BillingConfig | null; onSaved: () => void }) {
    const { user } = useAuth();
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<Partial<BillingConfig>>({
        razon_social: config?.razon_social || '',
        nit: config?.nit || '',
        direccion: config?.direccion || '',
        ciudad: config?.ciudad || '',
        departamento: config?.departamento || '',
        telefono: config?.telefono || '',
        email_empresa: config?.email_empresa || '',
        regimen: config?.regimen || 'simplificado',
        actividad_economica: config?.actividad_economica || '',
        resolucion_dian: config?.resolucion_dian || '',
        prefijo_factura: config?.prefijo_factura || 'F',
        numero_desde: config?.numero_desde || 1,
        numero_hasta: config?.numero_hasta || 9999,
        numero_actual: config?.numero_actual || 1,
        fecha_resolucion: config?.fecha_resolucion || '',
        vigencia_hasta: config?.vigencia_hasta || '',
        logo_base64: config?.logo_base64 || null,
        notas_defecto: config?.notas_defecto || 'Gracias por su preferencia.',
    });
    const logoRef = useRef<HTMLInputElement>(null);

    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 300 * 1024) { alert('El logo no debe superar 300KB'); return; }

        // Validate MIME type (not just the accept attribute)
        if (!['image/png', 'image/jpeg'].includes(file.type)) {
            alert('Solo se aceptan imágenes PNG o JPG');
            return;
        }

        // Validate magic bytes to prevent disguised files (SVG, HTML, etc.)
        const headerReader = new FileReader();
        headerReader.onload = (ev) => {
            const arr = new Uint8Array(ev.target?.result as ArrayBuffer);
            const isPNG = arr[0] === 0x89 && arr[1] === 0x50 && arr[2] === 0x4E && arr[3] === 0x47;
            const isJPEG = arr[0] === 0xFF && arr[1] === 0xD8 && arr[2] === 0xFF;
            if (!isPNG && !isJPEG) {
                alert('El archivo no es una imagen PNG o JPG válida');
                return;
            }
            // Re-encode via canvas to strip metadata and any embedded payloads
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                ctx.drawImage(img, 0, 0);
                const safeBase64 = canvas.toDataURL('image/png');
                URL.revokeObjectURL(url);
                setForm(f => ({ ...f, logo_base64: safeBase64 }));
            };
            img.onerror = () => { URL.revokeObjectURL(url); alert('No se pudo procesar la imagen'); };
            img.src = url;
        };
        headerReader.readAsArrayBuffer(file.slice(0, 8));
    };

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        const data = {
            ...form,
            user_id: user.id,
            updated_at: new Date().toISOString(),
            fecha_resolucion: form.fecha_resolucion || null,
            vigencia_hasta: form.vigencia_hasta || null,
        };
        const { error } = config
            ? await supabase.from('billing_config').update(data).eq('user_id', user.id)
            : await supabase.from('billing_config').insert(data);
        if (error) alert('Error: ' + error.message);
        else { alert('Configuración guardada correctamente'); onSaved(); }
        setSaving(false);
    };

    return (
        <div className="empresa-tab animate-fadeIn">
            <div className="section-card">
                <h3><Building2 size={18} /> Datos de la Empresa</h3>
                <div className="form-grid-2">
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label>Razón Social / Nombre *</label>
                        <input className="form-input" value={form.razon_social} onChange={e => setForm(f => ({ ...f, razon_social: e.target.value }))} placeholder="Ej: BC Fabric SAS" />
                    </div>
                    <div className="form-group">
                        <label>NIT *</label>
                        <input className="form-input" value={form.nit} onChange={e => setForm(f => ({ ...f, nit: e.target.value }))} placeholder="Ej: 900.123.456-7" />
                    </div>
                    <div className="form-group">
                        <label>Régimen Tributario</label>
                        <select className="form-input" value={form.regimen} onChange={e => setForm(f => ({ ...f, regimen: e.target.value }))}>
                            {REGIMEN_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Actividad Económica (CIIU)</label>
                        <input className="form-input" value={form.actividad_economica} onChange={e => setForm(f => ({ ...f, actividad_economica: e.target.value }))} placeholder="Ej: 7490" />
                    </div>
                    <div className="form-group">
                        <label>Teléfono</label>
                        <input className="form-input" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} placeholder="Ej: 300 123 4567" />
                    </div>
                    <div className="form-group">
                        <label>Email empresa</label>
                        <input type="email" className="form-input" value={form.email_empresa} onChange={e => setForm(f => ({ ...f, email_empresa: e.target.value }))} />
                    </div>
                    <div className="form-group">
                        <label>Ciudad</label>
                        <input className="form-input" value={form.ciudad} onChange={e => setForm(f => ({ ...f, ciudad: e.target.value }))} />
                    </div>
                    <div className="form-group">
                        <label>Departamento</label>
                        <input className="form-input" value={form.departamento} onChange={e => setForm(f => ({ ...f, departamento: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label>Dirección</label>
                        <input className="form-input" value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
                    </div>
                </div>
            </div>

            <div className="section-card">
                <h3><Receipt size={18} /> Información DIAN</h3>
                <div className="dian-info-box">
                    <AlertTriangle size={16} />
                    <span>Ingresa exactamente los datos de tu resolución de facturación emitida por la DIAN.</span>
                </div>
                <div className="form-grid-2">
                    <div className="form-group">
                        <label>N° Resolución DIAN</label>
                        <input className="form-input" value={form.resolucion_dian} onChange={e => setForm(f => ({ ...f, resolucion_dian: e.target.value }))} placeholder="Ej: 18764000001234" />
                    </div>
                    <div className="form-group">
                        <label>Prefijo de factura</label>
                        <input className="form-input" value={form.prefijo_factura} onChange={e => setForm(f => ({ ...f, prefijo_factura: e.target.value }))} placeholder="Ej: F, FE, FV" maxLength={5} />
                    </div>
                    <div className="form-group">
                        <label>Rango autorizado — Desde</label>
                        <input className="form-input" type="number" value={form.numero_desde} onChange={e => setForm(f => ({ ...f, numero_desde: parseInt(e.target.value) || 1 }))} />
                    </div>
                    <div className="form-group">
                        <label>Rango autorizado — Hasta</label>
                        <input className="form-input" type="number" value={form.numero_hasta} onChange={e => setForm(f => ({ ...f, numero_hasta: parseInt(e.target.value) || 9999 }))} />
                    </div>
                    <div className="form-group">
                        <label>Número actual (próxima factura)</label>
                        <input className="form-input" type="number" value={form.numero_actual} onChange={e => setForm(f => ({ ...f, numero_actual: parseInt(e.target.value) || 1 }))} />
                    </div>
                    <div className="form-group">
                        <label>Fecha de resolución</label>
                        <input className="form-input" type="date" value={form.fecha_resolucion || ''} onChange={e => setForm(f => ({ ...f, fecha_resolucion: e.target.value }))} />
                    </div>
                    <div className="form-group">
                        <label>Vigencia hasta</label>
                        <input className="form-input" type="date" value={form.vigencia_hasta || ''} onChange={e => setForm(f => ({ ...f, vigencia_hasta: e.target.value }))} />
                    </div>
                </div>
            </div>

            <div className="section-card">
                <h3><Upload size={18} /> Logo de la Empresa</h3>
                <p className="text-secondary" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
                    PNG o JPG, máximo 300KB. Se incluirá en el PDF de las facturas.
                </p>
                <div className="logo-upload-area">
                    {form.logo_base64 && (
                        <img src={form.logo_base64} alt="Logo" className="logo-preview" />
                    )}
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary" onClick={() => logoRef.current?.click()}>
                            <Upload size={16} /> {form.logo_base64 ? 'Cambiar Logo' : 'Cargar Logo'}
                        </button>
                        {form.logo_base64 && (
                            <button className="btn btn-ghost text-danger" onClick={() => setForm(f => ({ ...f, logo_base64: null }))}>
                                <Trash2 size={16} /> Quitar logo
                            </button>
                        )}
                    </div>
                    <input ref={logoRef} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={handleLogoChange} />
                </div>
            </div>

            <div className="section-card">
                <h3>Notas por Defecto</h3>
                <textarea className="form-input" rows={3} value={form.notas_defecto}
                    onChange={e => setForm(f => ({ ...f, notas_defecto: e.target.value }))}
                    placeholder="Texto que aparece al pie de cada factura..." />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? 'Guardando...' : <><Save size={16} /> Guardar Configuración</>}
                </button>
            </div>
        </div>
    );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function Facturacion() {
    const { user, profile, isAdmin } = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>('facturas');
    const [config, setConfig] = useState<BillingConfig | null>(null);
    const [clients, setClients] = useState<BillingClient[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
    const [recurringInvoices, setRecurringInvoices] = useState<RecurringInvoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [estadoFilter, setEstadoFilter] = useState('all');
    const [showInvoiceModal, setShowInvoiceModal] = useState(false);
    const [showClientModal, setShowClientModal] = useState(false);
    const [showQuoteModal, setShowQuoteModal] = useState(false);
    const [showCreditNoteModal, setShowCreditNoteModal] = useState(false);
    const [showRecurringModal, setShowRecurringModal] = useState(false);
    const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);
    const [editClient, setEditClient] = useState<BillingClient | null>(null);
    const [editQuote, setEditQuote] = useState<Quote | null>(null);
    const [editRecurring, setEditRecurring] = useState<RecurringInvoice | null>(null);
    const [pdfLoading, setPdfLoading] = useState<string | null>(null);
    const [cnPdfLoading, setCnPdfLoading] = useState<string | null>(null);
    const [generatingInvoice, setGeneratingInvoice] = useState<string | null>(null);
    // Reportes state
    const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);
    const [reportYear, setReportYear] = useState(new Date().getFullYear());

    // Access guard
    if (!profile?.billing_enabled && !isAdmin) {
        return (
            <div className="facturacion-page animate-fadeIn facturacion-disabled">
                <Receipt size={48} className="disabled-icon" />
                <h3>Módulo no habilitado</h3>
                <p>Contacta al administrador para activar el módulo de facturación.</p>
            </div>
        );
    }

    const fetchAll = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        const [cfgRes, clientsRes, invoicesRes, quotesRes, cnRes, recRes] = await Promise.all([
            supabase.from('billing_config').select('*').eq('user_id', user.id).single(),
            supabase.from('billing_clients').select('*').eq('user_id', user.id).order('nombre'),
            supabase.from('invoices').select('*, billing_clients(nombre)').eq('user_id', user.id).order('created_at', { ascending: false }),
            supabase.from('quotes').select('*, billing_clients(nombre)').eq('user_id', user.id).order('created_at', { ascending: false }),
            supabase.from('credit_notes').select('*, billing_clients(nombre), invoices(numero)').eq('user_id', user.id).order('created_at', { ascending: false }),
            supabase.from('recurring_invoices').select('*, billing_clients(nombre)').eq('user_id', user.id).order('proximo_vencimiento'),
        ]);
        if (cfgRes.data) setConfig(cfgRes.data as BillingConfig);
        if (clientsRes.data) setClients(clientsRes.data as BillingClient[]);
        if (invoicesRes.data) setInvoices(invoicesRes.data as Invoice[]);
        if (quotesRes.data) setQuotes(quotesRes.data as Quote[]);
        if (cnRes.data) setCreditNotes(cnRes.data as CreditNote[]);
        if (recRes.data) setRecurringInvoices(recRes.data as RecurringInvoice[]);
        setLoading(false);
    }, [user]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const handleDownloadPDF = async (invoice: Invoice) => {
        setPdfLoading(invoice.id);
        const { data: items } = await supabase.from('invoice_items').select('*').eq('invoice_id', invoice.id).eq('user_id', user?.id).order('sort_order');
        await generatePDF(invoice, (items as InvoiceItem[]) || [], config);
        setPdfLoading(null);
    };

    const handleDownloadCreditNotePDF = async (cn: CreditNote) => {
        setCnPdfLoading(cn.id);
        const { data: items } = await supabase.from('credit_note_items').select('*').eq('credit_note_id', cn.id).eq('user_id', user?.id).order('sort_order');
        await generateCreditNotePDF(cn, (items as InvoiceItem[]) || [], config);
        setCnPdfLoading(null);
    };

    const handleDeleteInvoice = async (id: string) => {
        if (!confirm('¿Eliminar esta factura? Esta acción no se puede deshacer.')) return;
        await supabase.from('invoices').delete().eq('id', id);
        setInvoices(prev => prev.filter(i => i.id !== id));
    };

    const handleDeleteClient = async (id: string) => {
        if (!confirm('¿Eliminar este cliente?')) return;
        await supabase.from('billing_clients').delete().eq('id', id);
        setClients(prev => prev.filter(c => c.id !== id));
    };

    const handleDeleteQuote = async (id: string) => {
        if (!confirm('¿Eliminar esta cotización?')) return;
        await supabase.from('quotes').delete().eq('id', id);
        setQuotes(prev => prev.filter(q => q.id !== id));
    };

    const handleDeleteCreditNote = async (id: string) => {
        if (!confirm('¿Eliminar esta nota?')) return;
        await supabase.from('credit_notes').delete().eq('id', id);
        setCreditNotes(prev => prev.filter(c => c.id !== id));
    };

    const handleDeleteRecurring = async (id: string) => {
        if (!confirm('¿Eliminar esta plantilla recurrente?')) return;
        await supabase.from('recurring_invoices').delete().eq('id', id);
        setRecurringInvoices(prev => prev.filter(r => r.id !== id));
    };

    const handleConvertQuoteToInvoice = async (quote: Quote) => {
        if (!user) return;
        if (!confirm('¿Convertir esta cotización a factura?')) return;
        setGeneratingInvoice(quote.id);
        try {
            const { data: items } = await supabase.from('quote_items').select('*').eq('quote_id', quote.id).eq('user_id', user.id).order('sort_order');
            const { data: numero, error: numError } = await supabase.rpc('get_next_invoice_number', { p_user_id: user.id });
            if (numError) throw numError;
            const invData = {
                user_id: user.id, client_id: quote.client_id,
                numero, fecha: new Date().toISOString().split('T')[0],
                fecha_vencimiento: null, estado: 'borrador',
                notas: quote.notas,
                subtotal: quote.subtotal, total_iva: quote.total_iva,
                pct_rtefte: quote.pct_rtefte, total_rtefte: quote.total_rtefte,
                pct_rteica: quote.pct_rteica, total_rteica: quote.total_rteica,
                aplica_rteiva: quote.aplica_rteiva, total_rteiva: quote.total_rteiva,
                total: quote.total,
                datos_empresa: quote.datos_empresa,
                datos_cliente: quote.datos_cliente,
            };
            const { data: inv, error } = await supabase.from('invoices').insert(invData).select().single();
            if (error) throw error;
            if (inv && items && items.length > 0) {
                await supabase.from('invoice_items').insert(
                    items.map((it: InvoiceItem, i: number) => ({ ...it, id: undefined, invoice_id: inv.id, user_id: user.id, sort_order: i }))
                );
            }
            await supabase.from('quotes').update({ estado: 'aceptada' }).eq('id', quote.id);
            fetchAll();
            alert(`Factura ${config?.prefijo_factura || 'F'}-${numero} creada exitosamente.`);
        } catch (err) {
            alert('Error al convertir: ' + (err instanceof Error ? err.message : 'Error'));
        } finally { setGeneratingInvoice(null); }
    };

    const handleGenerateFromRecurring = async (rec: RecurringInvoice) => {
        if (!user) return;
        if (!confirm(`¿Generar factura desde la plantilla "${rec.nombre}"?`)) return;
        setGeneratingInvoice(rec.id);
        try {
            const selectedClient = clients.find(c => c.id === rec.client_id) || null;
            const items: InvoiceItem[] = rec.items_template || [];
            const subtotal = items.reduce((s, it) => s + it.subtotal, 0);
            const totalIva = items.reduce((s, it) => s + it.valor_iva, 0);
            const totalRtefte = +(subtotal * (rec.pct_rtefte / 100)).toFixed(2);
            const totalRteica = +(subtotal * (rec.pct_rteica / 100)).toFixed(2);
            const totalRteiva = rec.aplica_rteiva ? +(totalIva * 0.15).toFixed(2) : 0;
            const total = +(subtotal + totalIva - totalRtefte - totalRteica - totalRteiva).toFixed(2);
            const { data: numero, error: numError } = await supabase.rpc('get_next_invoice_number', { p_user_id: user.id });
            if (numError) throw numError;
            const invData = {
                user_id: user.id, client_id: rec.client_id,
                numero, fecha: new Date().toISOString().split('T')[0],
                fecha_vencimiento: null, estado: 'borrador',
                notas: rec.notas, subtotal, total_iva: totalIva,
                pct_rtefte: rec.pct_rtefte, total_rtefte: totalRtefte,
                pct_rteica: rec.pct_rteica, total_rteica: totalRteica,
                aplica_rteiva: rec.aplica_rteiva, total_rteiva: totalRteiva, total,
                datos_empresa: config ? { ...config } : null,
                datos_cliente: selectedClient ? { ...selectedClient } : null,
            };
            const { data: inv, error } = await supabase.from('invoices').insert(invData).select().single();
            if (error) throw error;
            if (inv && items.length > 0) {
                await supabase.from('invoice_items').insert(
                    items.map((it, i) => ({ ...it, id: undefined, invoice_id: inv.id, user_id: user.id, sort_order: i }))
                );
            }
            fetchAll();
            alert(`Factura ${config?.prefijo_factura || 'F'}-${numero} generada. Revísala en la pestaña Facturas.`);
        } catch (err) {
            alert('Error al generar: ' + (err instanceof Error ? err.message : 'Error'));
        } finally { setGeneratingInvoice(null); }
    };

    const filteredInvoices = invoices.filter(inv => {
        const clientName = (inv.billing_clients as { nombre: string } | null)?.nombre || '';
        const matchSearch = inv.numero.includes(search) || clientName.toLowerCase().includes(search.toLowerCase());
        const matchEstado = estadoFilter === 'all' || inv.estado === estadoFilter;
        return matchSearch && matchEstado;
    });

    const filteredClients = clients.filter(c =>
        c.nombre.toLowerCase().includes(search.toLowerCase()) ||
        c.nit_cedula.includes(search) ||
        c.email.toLowerCase().includes(search.toLowerCase())
    );

    const filteredQuotes = quotes.filter(q => {
        const clientName = (q.billing_clients as { nombre: string } | null)?.nombre || '';
        return q.numero.includes(search) || clientName.toLowerCase().includes(search.toLowerCase());
    });

    // Stats
    const totalEmitidas = invoices.filter(i => i.estado === 'emitida').reduce((s, i) => s + i.total, 0);
    const totalPagadas = invoices.filter(i => i.estado === 'pagada').reduce((s, i) => s + i.total, 0);
    const countPendientes = invoices.filter(i => i.estado === 'emitida').length;

    // Reportes calculation
    const periodInvoices = invoices.filter(inv => {
        const d = new Date(inv.fecha);
        return d.getFullYear() === reportYear && (d.getMonth() + 1) === reportMonth;
    });
    const reportIvaGenerado = periodInvoices.reduce((s, i) => s + i.total_iva, 0);
    const reportRtefte = periodInvoices.reduce((s, i) => s + i.total_rtefte, 0);
    const reportRteica = periodInvoices.reduce((s, i) => s + i.total_rteica, 0);
    const reportIngresos = periodInvoices.reduce((s, i) => s + i.subtotal, 0);
    const periodQuoteIva = quotes.filter(q => {
        const d = new Date(q.fecha);
        return d.getFullYear() === reportYear && (d.getMonth() + 1) === reportMonth;
    }).reduce((s, q) => s + q.total_iva, 0);
    const estadoCounts = Object.keys(ESTADO_CONFIG).map(k => ({
        label: ESTADO_CONFIG[k].label,
        color: ESTADO_CONFIG[k].color,
        count: periodInvoices.filter(i => i.estado === k).length,
    }));

    const exportReportPDF = () => {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
        const W = doc.internal.pageSize.getWidth();
        const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        doc.setFontSize(16); doc.setFont('helvetica', 'bold');
        doc.text('REPORTE TRIBUTARIO', W / 2, 20, { align: 'center' });
        doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
        doc.text(`${monthNames[reportMonth - 1]} ${reportYear}`, W / 2, 28, { align: 'center' });
        doc.setTextColor(30, 30, 30);
        autoTable(doc, {
            startY: 35,
            head: [['Concepto', 'Valor']],
            body: [
                ['IVA Generado (facturas)', fmtCOP(reportIvaGenerado)],
                ['IVA en Cotizaciones', fmtCOP(periodQuoteIva)],
                ['RteFte recibidas', fmtCOP(reportRtefte)],
                ['RteICA', fmtCOP(reportRteica)],
                ['Ingresos brutos (subtotal)', fmtCOP(reportIngresos)],
                ...estadoCounts.map(e => [`Facturas ${e.label}`, e.count.toString()]),
            ],
            headStyles: { fillColor: [79, 70, 229], textColor: 255 },
            styles: { fontSize: 9 },
            columnStyles: { 1: { halign: 'right' } },
            margin: { left: 20, right: 20 },
        });
        const pgH = doc.internal.pageSize.getHeight();
        doc.setFontSize(7); doc.setTextColor(150, 150, 150);
        doc.text('Generado con BC Money · bc-money.app', W / 2, pgH - 8, { align: 'center' });
        doc.save(`Reporte-Tributario-${monthNames[reportMonth - 1]}-${reportYear}.pdf`);
    };

    // WhatsApp / Email / Wompi helpers
    const sendWhatsApp = (inv: Invoice) => {
        const num = `${config?.prefijo_factura || 'F'}-${inv.numero}`;
        const msg = `Factura ${num} por ${fmtCOP(inv.total)}. Gracias por su preferencia.`;
        window.open('https://wa.me/?text=' + encodeURIComponent(msg));
    };
    const sendEmail = (inv: Invoice) => {
        const clientEmail = (inv.datos_cliente as BillingClient | null)?.email || '';
        const num = `${config?.prefijo_factura || 'F'}-${inv.numero}`;
        const subject = `Factura ${num}`;
        const body = `Estimado cliente,\n\nAdjuntamos la factura ${num} por valor de ${fmtCOP(inv.total)}.\n\nGracias por su preferencia.\n\n${config?.razon_social || ''}`;
        window.open(`mailto:${clientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    };
    const openWompi = (inv: Invoice) => {
        const key = (config as unknown as Record<string, string>)?.wompi_public_key;
        if (!key) { alert('Configura tu clave pública de Wompi en Mi Empresa.'); return; }
        window.open(`https://checkout.wompi.co/l/?public-key=${key}&currency=COP&amount-in-cents=${Math.round(inv.total * 100)}`);
    };

    // Days until date helper
    const daysUntil = (dateStr: string) => {
        const diff = new Date(dateStr).getTime() - new Date().setHours(0,0,0,0);
        return Math.ceil(diff / 86400000);
    };

    if (loading) return <div className="loading-container"><div className="loading-spinner" /></div>;

    return (
        <div className="facturacion-page animate-fadeIn">
            <div className="toolbar">
                <div>
                    <h2>Facturación</h2>
                    <p className="text-secondary">Gestión de facturas con IVA y retenciones · Colombia</p>
                </div>
                {activeTab === 'facturas' && (
                    <button className="btn btn-primary" onClick={() => { setEditInvoice(null); setShowInvoiceModal(true); }}>
                        <Plus size={18} /> Nueva Factura
                    </button>
                )}
                {activeTab === 'clientes' && (
                    <button className="btn btn-primary" onClick={() => { setEditClient(null); setShowClientModal(true); }}>
                        <Plus size={18} /> Nuevo Cliente
                    </button>
                )}
                {activeTab === 'cotizaciones' && (
                    <button className="btn btn-primary" onClick={() => { setEditQuote(null); setShowQuoteModal(true); }}>
                        <Plus size={18} /> Nueva Cotización
                    </button>
                )}
                {activeTab === 'notas' && (
                    <button className="btn btn-primary" onClick={() => setShowCreditNoteModal(true)}>
                        <Plus size={18} /> Nueva Nota
                    </button>
                )}
                {activeTab === 'recurrentes' && (
                    <button className="btn btn-primary" onClick={() => { setEditRecurring(null); setShowRecurringModal(true); }}>
                        <Plus size={18} /> Nueva Plantilla
                    </button>
                )}
            </div>

            {/* Summary cards */}
            {activeTab === 'facturas' && (
                <div className="billing-stats">
                    <div className="stat-card">
                        <span className="stat-label">Emitidas (por cobrar)</span>
                        <span className="stat-value text-primary">{fmtCOP(totalEmitidas)}</span>
                        <span className="stat-sub">{countPendientes} facturas</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-label">Pagadas (este período)</span>
                        <span className="stat-value text-success">{fmtCOP(totalPagadas)}</span>
                        <span className="stat-sub">{invoices.filter(i => i.estado === 'pagada').length} facturas</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-label">Total facturas</span>
                        <span className="stat-value">{invoices.length}</span>
                        <span className="stat-sub">{clients.length} clientes registrados</span>
                    </div>
                    <div className={`stat-card ${!config?.resolucion_dian ? 'stat-warning' : ''}`}>
                        <span className="stat-label">Resolución DIAN</span>
                        <span className="stat-value stat-value-sm">{config?.resolucion_dian || '—'}</span>
                        <span className="stat-sub">{config?.resolucion_dian ? `Vigencia: ${config.vigencia_hasta || 'N/A'}` : 'Sin configurar'}</span>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="billing-tabs billing-tabs-7">
                <button className={`tab-btn ${activeTab === 'facturas' ? 'active' : ''}`} onClick={() => { setActiveTab('facturas'); setSearch(''); }}>
                    <FileText size={15} /> Facturas
                </button>
                <button className={`tab-btn ${activeTab === 'clientes' ? 'active' : ''}`} onClick={() => { setActiveTab('clientes'); setSearch(''); }}>
                    <Users size={15} /> Clientes
                </button>
                <button className={`tab-btn ${activeTab === 'empresa' ? 'active' : ''}`} onClick={() => { setActiveTab('empresa'); setSearch(''); }}>
                    <Settings size={15} /> Mi Empresa
                </button>
                <button className={`tab-btn ${activeTab === 'cotizaciones' ? 'active' : ''}`} onClick={() => { setActiveTab('cotizaciones'); setSearch(''); }}>
                    <Eye size={15} /> Cotizaciones
                </button>
                <button className={`tab-btn ${activeTab === 'notas' ? 'active' : ''}`} onClick={() => { setActiveTab('notas'); setSearch(''); }}>
                    <Copy size={15} /> Notas Crédito
                </button>
                <button className={`tab-btn ${activeTab === 'recurrentes' ? 'active' : ''}`} onClick={() => { setActiveTab('recurrentes'); setSearch(''); }}>
                    <Repeat size={15} /> Recurrentes
                </button>
                <button className={`tab-btn ${activeTab === 'reportes' ? 'active' : ''}`} onClick={() => { setActiveTab('reportes'); setSearch(''); }}>
                    <BarChart2 size={15} /> Reportes
                </button>
            </div>

            {/* Facturas Tab */}
            {activeTab === 'facturas' && (
                <div className="tab-content animate-fadeIn">
                    {!config?.resolucion_dian && (
                        <div className="dian-warning-banner">
                            <AlertTriangle size={18} />
                            <span>Configura tu <strong>resolución DIAN</strong> en la pestaña "Mi Empresa" antes de emitir facturas.</span>
                        </div>
                    )}
                    <div className="list-filters">
                        <div className="search-box">
                            <Search size={16} />
                            <input placeholder="Buscar por número o cliente..." value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <div className="filter-select-wrap">
                            <ChevronDown size={14} />
                            <select value={estadoFilter} onChange={e => setEstadoFilter(e.target.value)}>
                                <option value="all">Todos los estados</option>
                                {Object.entries(ESTADO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                        </div>
                    </div>

                    {filteredInvoices.length === 0 ? (
                        <div className="empty-state">
                            <FileText size={48} />
                            <h3>Sin facturas</h3>
                            <p>Crea tu primera factura con el botón "Nueva Factura".</p>
                        </div>
                    ) : (
                        <div className="invoices-table-wrap">
                            <table className="invoices-table">
                                <thead>
                                    <tr>
                                        <th>N° Factura</th>
                                        <th>Cliente</th>
                                        <th>Fecha</th>
                                        <th>Vencimiento</th>
                                        <th>Total</th>
                                        <th>Estado</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredInvoices.map(inv => {
                                        const est = ESTADO_CONFIG[inv.estado] || ESTADO_CONFIG.borrador;
                                        const EstIcon = est.icon;
                                        const clientName = (inv.billing_clients as { nombre: string } | null)?.nombre;
                                        const clientEmail = (inv.datos_cliente as BillingClient | null)?.email || '';
                                        const wompiKey = (config as unknown as Record<string, string>)?.wompi_public_key;
                                        return (
                                            <tr key={inv.id}>
                                                <td><span className="invoice-number">{config?.prefijo_factura || 'F'}-{inv.numero}</span></td>
                                                <td>{clientName || <span className="text-secondary">—</span>}</td>
                                                <td>{inv.fecha}</td>
                                                <td>{inv.fecha_vencimiento || <span className="text-secondary">—</span>}</td>
                                                <td><strong>{fmtCOP(inv.total)}</strong></td>
                                                <td>
                                                    <span className="estado-badge" style={{ '--badge-color': est.color } as React.CSSProperties}>
                                                        <EstIcon size={12} /> {est.label}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="row-actions">
                                                        <button className="icon-btn" title="Descargar PDF"
                                                            onClick={() => handleDownloadPDF(inv)}
                                                            disabled={pdfLoading === inv.id}>
                                                            {pdfLoading === inv.id ? <div className="loading-spinner" style={{ width: 14, height: 14 }} /> : <Download size={15} />}
                                                        </button>
                                                        <button className="icon-btn" title="Enviar por WhatsApp" onClick={() => sendWhatsApp(inv)}>
                                                            <MessageCircle size={15} />
                                                        </button>
                                                        <button className="icon-btn" title="Enviar por Email" onClick={() => sendEmail(inv)} disabled={!clientEmail}>
                                                            <Mail size={15} />
                                                        </button>
                                                        {wompiKey && (
                                                            <button className="icon-btn" title="Link de pago Wompi" onClick={() => openWompi(inv)}>
                                                                <CreditCard size={15} />
                                                            </button>
                                                        )}
                                                        <button className="icon-btn" title="Editar"
                                                            onClick={() => { setEditInvoice(inv); setShowInvoiceModal(true); }}>
                                                            <Edit2 size={15} />
                                                        </button>
                                                        <button className="icon-btn text-danger" title="Eliminar"
                                                            onClick={() => handleDeleteInvoice(inv.id)}>
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Clientes Tab */}
            {activeTab === 'clientes' && (
                <div className="tab-content animate-fadeIn">
                    <div className="list-filters">
                        <div className="search-box">
                            <Search size={16} />
                            <input placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                    </div>
                    {filteredClients.length === 0 ? (
                        <div className="empty-state">
                            <Users size={48} />
                            <h3>Sin clientes</h3>
                            <p>Agrega tus clientes para incluirlos en las facturas.</p>
                        </div>
                    ) : (
                        <div className="clients-grid">
                            {filteredClients.map(c => (
                                <div key={c.id} className="client-card">
                                    <div className="client-avatar">{c.nombre[0]?.toUpperCase()}</div>
                                    <div className="client-info">
                                        <span className="client-name">{c.nombre}</span>
                                        <span className="client-nit">{c.nit_cedula || 'Sin NIT'}</span>
                                        {c.email && <span className="client-email">{c.email}</span>}
                                        {c.ciudad && <span className="client-city">{c.ciudad}</span>}
                                    </div>
                                    <div className="client-meta">
                                        <span className="regimen-badge">{REGIMEN_OPTIONS.find(r => r.value === c.regimen)?.label?.split(' ')[1] || c.regimen}</span>
                                    </div>
                                    <div className="client-actions">
                                        <button className="icon-btn" onClick={() => { setEditClient(c); setShowClientModal(true); }}><Edit2 size={15} /></button>
                                        <button className="icon-btn text-danger" onClick={() => handleDeleteClient(c.id)}><Trash2 size={15} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Empresa Tab */}
            {activeTab === 'empresa' && (
                <EmpresaTab config={config} onSaved={fetchAll} />
            )}

            {/* Cotizaciones Tab */}
            {activeTab === 'cotizaciones' && (
                <div className="tab-content animate-fadeIn">
                    <div className="list-filters">
                        <div className="search-box">
                            <Search size={16} />
                            <input placeholder="Buscar por número o cliente..." value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                    </div>
                    {filteredQuotes.length === 0 ? (
                        <div className="empty-state">
                            <Eye size={48} />
                            <h3>Sin cotizaciones</h3>
                            <p>Crea tu primera cotización con el botón "Nueva Cotización".</p>
                        </div>
                    ) : (
                        <div className="invoices-table-wrap">
                            <table className="invoices-table">
                                <thead>
                                    <tr>
                                        <th>Número</th>
                                        <th>Cliente</th>
                                        <th>Fecha</th>
                                        <th>Total</th>
                                        <th>Estado</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredQuotes.map(q => {
                                        const est = QUOTE_ESTADO_CONFIG[q.estado] || QUOTE_ESTADO_CONFIG.borrador;
                                        const EstIcon = est.icon;
                                        const clientName = (q.billing_clients as { nombre: string } | null)?.nombre;
                                        return (
                                            <tr key={q.id}>
                                                <td><span className="invoice-number">COT-{q.numero}</span></td>
                                                <td>{clientName || <span className="text-secondary">—</span>}</td>
                                                <td>{q.fecha}</td>
                                                <td><strong>{fmtCOP(q.total)}</strong></td>
                                                <td>
                                                    <span className="estado-badge" style={{ '--badge-color': est.color } as React.CSSProperties}>
                                                        <EstIcon size={12} /> {est.label}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="row-actions">
                                                        {q.estado === 'aceptada' && (
                                                            <button className="icon-btn" title="Convertir a Factura"
                                                                onClick={() => handleConvertQuoteToInvoice(q)}
                                                                disabled={generatingInvoice === q.id}>
                                                                {generatingInvoice === q.id
                                                                    ? <div className="loading-spinner" style={{ width: 14, height: 14 }} />
                                                                    : <ArrowRightCircle size={15} />}
                                                            </button>
                                                        )}
                                                        <button className="icon-btn" title="Editar"
                                                            onClick={() => { setEditQuote(q); setShowQuoteModal(true); }}>
                                                            <Edit2 size={15} />
                                                        </button>
                                                        <button className="icon-btn text-danger" title="Eliminar"
                                                            onClick={() => handleDeleteQuote(q.id)}>
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Notas Crédito Tab */}
            {activeTab === 'notas' && (
                <div className="tab-content animate-fadeIn">
                    {creditNotes.length === 0 ? (
                        <div className="empty-state">
                            <Copy size={48} />
                            <h3>Sin notas crédito/débito</h3>
                            <p>Crea una nota con el botón "Nueva Nota".</p>
                        </div>
                    ) : (
                        <div className="invoices-table-wrap">
                            <table className="invoices-table">
                                <thead>
                                    <tr>
                                        <th>Número</th>
                                        <th>Tipo</th>
                                        <th>Cliente</th>
                                        <th>Factura Ref.</th>
                                        <th>Fecha</th>
                                        <th>Total</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {creditNotes.map(cn => {
                                        const clientName = (cn.billing_clients as { nombre: string } | null)?.nombre;
                                        const invNum = (cn.invoices as { numero: string } | null)?.numero;
                                        return (
                                            <tr key={cn.id}>
                                                <td><span className="invoice-number">NC-{cn.numero}</span></td>
                                                <td>
                                                    <span className="estado-badge" style={{ '--badge-color': cn.tipo === 'credito' ? '#10B981' : '#EF4444' } as React.CSSProperties}>
                                                        {cn.tipo === 'credito' ? 'Crédito' : 'Débito'}
                                                    </span>
                                                </td>
                                                <td>{clientName || <span className="text-secondary">—</span>}</td>
                                                <td>{invNum ? <span className="invoice-number">{config?.prefijo_factura || 'F'}-{invNum}</span> : <span className="text-secondary">—</span>}</td>
                                                <td>{cn.fecha}</td>
                                                <td><strong>{fmtCOP(cn.total)}</strong></td>
                                                <td>
                                                    <div className="row-actions">
                                                        <button className="icon-btn" title="Descargar PDF"
                                                            onClick={() => handleDownloadCreditNotePDF(cn)}
                                                            disabled={cnPdfLoading === cn.id}>
                                                            {cnPdfLoading === cn.id ? <div className="loading-spinner" style={{ width: 14, height: 14 }} /> : <Download size={15} />}
                                                        </button>
                                                        <button className="icon-btn text-danger" title="Eliminar"
                                                            onClick={() => handleDeleteCreditNote(cn.id)}>
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Recurrentes Tab */}
            {activeTab === 'recurrentes' && (
                <div className="tab-content animate-fadeIn">
                    {recurringInvoices.length === 0 ? (
                        <div className="empty-state">
                            <Repeat size={48} />
                            <h3>Sin plantillas recurrentes</h3>
                            <p>Crea una plantilla para generar facturas periódicas automáticamente.</p>
                        </div>
                    ) : (
                        <div className="invoices-table-wrap">
                            <table className="invoices-table">
                                <thead>
                                    <tr>
                                        <th>Nombre</th>
                                        <th>Cliente</th>
                                        <th>Frecuencia</th>
                                        <th>Próx. Vencimiento</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recurringInvoices.map(rec => {
                                        const clientName = (rec.billing_clients as { nombre: string } | null)?.nombre;
                                        const days = daysUntil(rec.proximo_vencimiento);
                                        const vencePronto = days <= 7;
                                        return (
                                            <tr key={rec.id}>
                                                <td>
                                                    <span className="rec-name">{rec.nombre}</span>
                                                    {vencePronto && <span className="badge-vence-pronto">Vence pronto</span>}
                                                </td>
                                                <td>{clientName || <span className="text-secondary">—</span>}</td>
                                                <td className="capitalize">{rec.frecuencia}</td>
                                                <td className={vencePronto ? 'text-danger' : ''}>{rec.proximo_vencimiento}</td>
                                                <td>
                                                    <div className="row-actions">
                                                        <button className="icon-btn" title="Generar Ahora"
                                                            onClick={() => handleGenerateFromRecurring(rec)}
                                                            disabled={generatingInvoice === rec.id}>
                                                            {generatingInvoice === rec.id
                                                                ? <div className="loading-spinner" style={{ width: 14, height: 14 }} />
                                                                : <RefreshCw size={15} />}
                                                        </button>
                                                        <button className="icon-btn" title="Editar"
                                                            onClick={() => { setEditRecurring(rec); setShowRecurringModal(true); }}>
                                                            <Edit2 size={15} />
                                                        </button>
                                                        <button className="icon-btn text-danger" title="Eliminar"
                                                            onClick={() => handleDeleteRecurring(rec.id)}>
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Reportes Tributarios Tab */}
            {activeTab === 'reportes' && (
                <div className="tab-content animate-fadeIn">
                    <div className="reportes-toolbar">
                        <div className="reportes-period">
                            <label>Mes</label>
                            <select className="form-input" value={reportMonth} onChange={e => setReportMonth(parseInt(e.target.value))}>
                                {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m, i) => (
                                    <option key={i + 1} value={i + 1}>{m}</option>
                                ))}
                            </select>
                            <label>Año</label>
                            <input className="form-input report-year-input" type="number" min="2020" max="2099"
                                value={reportYear} onChange={e => setReportYear(parseInt(e.target.value) || new Date().getFullYear())} />
                        </div>
                        <button className="btn btn-secondary" onClick={exportReportPDF}>
                            <Download size={16} /> Exportar PDF
                        </button>
                    </div>
                    <div className="reportes-grid">
                        <div className="reporte-card">
                            <span className="reporte-label">IVA Generado</span>
                            <span className="reporte-value text-primary">{fmtCOP(reportIvaGenerado)}</span>
                            <span className="reporte-sub">Facturas del período</span>
                        </div>
                        <div className="reporte-card">
                            <span className="reporte-label">IVA en Cotizaciones</span>
                            <span className="reporte-value">{fmtCOP(periodQuoteIva)}</span>
                            <span className="reporte-sub">Cotizaciones del período</span>
                        </div>
                        <div className="reporte-card">
                            <span className="reporte-label">RteFte Recibidas</span>
                            <span className="reporte-value text-danger">{fmtCOP(reportRtefte)}</span>
                            <span className="reporte-sub">Retención en la fuente</span>
                        </div>
                        <div className="reporte-card">
                            <span className="reporte-label">RteICA</span>
                            <span className="reporte-value text-danger">{fmtCOP(reportRteica)}</span>
                            <span className="reporte-sub">Retención ICA</span>
                        </div>
                        <div className="reporte-card reporte-card-wide">
                            <span className="reporte-label">Ingresos Brutos (Subtotal)</span>
                            <span className="reporte-value text-success">{fmtCOP(reportIngresos)}</span>
                            <span className="reporte-sub">{periodInvoices.length} facturas en el período</span>
                        </div>
                    </div>
                    <div className="section-card" style={{ marginTop: '1rem' }}>
                        <h3><BarChart2 size={18} /> Facturas por Estado</h3>
                        <div className="estado-counts-grid">
                            {estadoCounts.map(e => (
                                <div key={e.label} className="estado-count-item">
                                    <span className="estado-badge" style={{ '--badge-color': e.color } as React.CSSProperties}>{e.label}</span>
                                    <span className="estado-count-num">{e.count}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Modals */}
            {showInvoiceModal && (
                <InvoiceModal
                    onClose={() => setShowInvoiceModal(false)}
                    onSaved={() => { setShowInvoiceModal(false); fetchAll(); }}
                    config={config}
                    clients={clients}
                    editInvoice={editInvoice}
                />
            )}
            {showClientModal && (
                <ClientModal
                    onClose={() => setShowClientModal(false)}
                    onSaved={() => { setShowClientModal(false); fetchAll(); }}
                    editClient={editClient}
                />
            )}
            {showQuoteModal && (
                <QuoteModal
                    onClose={() => setShowQuoteModal(false)}
                    onSaved={() => { setShowQuoteModal(false); fetchAll(); }}
                    config={config}
                    clients={clients}
                    editQuote={editQuote}
                />
            )}
            {showCreditNoteModal && (
                <CreditNoteModal
                    onClose={() => setShowCreditNoteModal(false)}
                    onSaved={() => { setShowCreditNoteModal(false); fetchAll(); }}
                    config={config}
                    clients={clients}
                    invoices={invoices}
                />
            )}
            {showRecurringModal && (
                <RecurringModal
                    onClose={() => setShowRecurringModal(false)}
                    onSaved={() => { setShowRecurringModal(false); fetchAll(); }}
                    config={config}
                    clients={clients}
                    editRecurring={editRecurring}
                />
            )}
        </div>
    );
}
