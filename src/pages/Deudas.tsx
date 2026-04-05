import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Plus, Edit2, Trash2, X, Search, AlertTriangle, CheckCircle,
    Home, CreditCard, Users, Car, GraduationCap, CircleDollarSign, Clock,
    type LucideIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Debt, DebtPayment } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import './Deudas.css';

const DEBT_TYPES: { value: Debt['type']; label: string; icon: LucideIcon }[] = [
    { value: 'mortgage', label: 'Hipoteca', icon: Home },
    { value: 'personal_loan', label: 'Préstamo Personal', icon: CircleDollarSign },
    { value: 'credit_card', label: 'Tarjeta de Crédito', icon: CreditCard },
    { value: 'car_loan', label: 'Préstamo Vehículo', icon: Car },
    { value: 'student_loan', label: 'Préstamo Estudiantil', icon: GraduationCap },
    { value: 'informal', label: 'Deuda Informal', icon: Users },
    { value: 'other', label: 'Otra', icon: CircleDollarSign },
];

const TYPE_LABELS = Object.fromEntries(DEBT_TYPES.map(t => [t.value, t.label]));
const TYPE_ICONS: Record<string, LucideIcon> = Object.fromEntries(DEBT_TYPES.map(t => [t.value, t.icon]));

const COLORS = ['#EF4444', '#F97316', '#F59E0B', '#10B981', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#64748B'];

function fmt(amount: number, currency: string) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

function getNextPaymentDate(paymentDay: number | null): Date | null {
    if (!paymentDay) return null;
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), paymentDay);
    if (thisMonth > now) return thisMonth;
    return new Date(now.getFullYear(), now.getMonth() + 1, paymentDay);
}

interface DebtFormData {
    name: string; type: Debt['type']; creditor: string; original_amount: string;
    remaining_amount: string; interest_rate: string; currency: string;
    total_installments: string; installment_amount: string; payment_day: string;
    start_date: string; end_date: string; color: string; notes: string;
}

const DEFAULT_FORM: DebtFormData = {
    name: '', type: 'personal_loan', creditor: '', original_amount: '', remaining_amount: '',
    interest_rate: '0', currency: 'COP', total_installments: '', installment_amount: '',
    payment_day: '', start_date: format(new Date(), 'yyyy-MM-dd'), end_date: '', color: '#EF4444', notes: '',
};

export function Deudas() {
    const { user, profile } = useAuth();
    const [debts, setDebts] = useState<Debt[]>([]);
    const [payments, setPayments] = useState<DebtPayment[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isPayModal, setIsPayModal] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<Debt | null>(null);
    const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
    const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [formData, setFormData] = useState<DebtFormData>(DEFAULT_FORM);

    const currency = profile?.currency || 'COP';

    const showToast = useCallback((msg: string, type: 'success' | 'error') => {
        setToast({ message: msg, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    const fetchData = useCallback(async () => {
        if (!user) return;
        const [dRes, pRes] = await Promise.all([
            supabase.from('debts').select('*').eq('user_id', user.id).order('created_at'),
            supabase.from('debt_payments').select('*').eq('user_id', user.id).order('payment_date', { ascending: false }),
        ]);
        setDebts(dRes.data || []);
        setPayments(pRes.data || []);
        setLoading(false);
    }, [user]);

    useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

    const filtered = useMemo(() => {
        const active = debts.filter(d => d.status === 'active');
        if (!searchTerm) return active;
        const t = searchTerm.toLowerCase();
        return active.filter(d => d.name.toLowerCase().includes(t) || (d.creditor || '').toLowerCase().includes(t));
    }, [debts, searchTerm]);

    const paidOff = useMemo(() => debts.filter(d => d.status === 'paid_off'), [debts]);

    const totalDebt = useMemo(() => filtered.reduce((s, d) => s + Number(d.remaining_amount), 0), [filtered]);
    const totalOriginal = useMemo(() => filtered.reduce((s, d) => s + Number(d.original_amount), 0), [filtered]);

    // Upcoming payment alerts (within 5 days)
    const alerts = useMemo(() => filtered.filter(d => {
        if (!d.payment_day) return false;
        const next = getNextPaymentDate(d.payment_day);
        if (!next) return false;
        return differenceInDays(next, new Date()) <= 5;
    }), [filtered]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!user || saving) return;
        setSaving(true);
        try {
            const remaining = formData.remaining_amount ? parseFloat(formData.remaining_amount) : parseFloat(formData.original_amount);
            const data = {
                user_id: user.id, name: formData.name, type: formData.type,
                creditor: formData.creditor || null, original_amount: parseFloat(formData.original_amount),
                remaining_amount: remaining, interest_rate: parseFloat(formData.interest_rate) || 0,
                currency: formData.currency, total_installments: formData.total_installments ? parseInt(formData.total_installments) : null,
                installment_amount: formData.installment_amount ? parseFloat(formData.installment_amount) : null,
                payment_day: formData.payment_day ? parseInt(formData.payment_day) : null,
                start_date: formData.start_date, end_date: formData.end_date || null,
                color: formData.color, notes: formData.notes || null,
            };
            if (editingDebt) {
                await supabase.from('debts').update(data).eq('id', editingDebt.id);
                showToast('Deuda actualizada', 'success');
            } else {
                await supabase.from('debts').insert(data);
                showToast('Deuda registrada', 'success');
            }
            setIsModalOpen(false);
            setEditingDebt(null);
            setFormData(DEFAULT_FORM);
            fetchData();
        } catch { showToast('Error al guardar', 'error'); }
        finally { setSaving(false); }
    }

    async function handlePay(e: React.FormEvent) {
        e.preventDefault();
        if (!selectedDebt || !user) return;
        try {
            await supabase.from('debt_payments').insert({
                debt_id: selectedDebt.id, user_id: user.id,
                amount: parseFloat(payAmount), payment_date: format(new Date(), 'yyyy-MM-dd'),
                installment_number: selectedDebt.paid_installments + 1,
            });
            showToast('Pago registrado', 'success');
            setIsPayModal(false);
            setPayAmount('');
            setSelectedDebt(null);
            fetchData();
        } catch { showToast('Error al registrar pago', 'error'); }
    }

    async function handleDelete(debt: Debt) {
        try {
            await supabase.from('debts').delete().eq('id', debt.id);
            setDeleteConfirm(null);
            showToast('Deuda eliminada', 'success');
            fetchData();
        } catch { showToast('Error al eliminar', 'error'); setDeleteConfirm(null); }
    }

    function openEdit(debt: Debt) {
        setEditingDebt(debt);
        setFormData({
            name: debt.name, type: debt.type, creditor: debt.creditor || '',
            original_amount: debt.original_amount.toString(), remaining_amount: debt.remaining_amount.toString(),
            interest_rate: debt.interest_rate.toString(), currency: debt.currency,
            total_installments: debt.total_installments?.toString() || '',
            installment_amount: debt.installment_amount?.toString() || '',
            payment_day: debt.payment_day?.toString() || '', start_date: debt.start_date,
            end_date: debt.end_date || '', color: debt.color, notes: debt.notes || '',
        });
        setIsModalOpen(true);
    }

    if (loading) return <div className="loading-screen">Cargando...</div>;

    return (
        <div className="deudas-container">
            {toast && <div className={`deu-toast ${toast.type}`}>{toast.message}</div>}

            {/* Payment Alerts */}
            {alerts.length > 0 && (
                <div className="debt-alerts">
                    {alerts.map(d => {
                        const next = getNextPaymentDate(d.payment_day!);
                        const days = next ? differenceInDays(next, new Date()) : 0;
                        return (
                            <div key={d.id} className="debt-alert">
                                <Clock size={16} />
                                <span>
                                    <strong>{d.name}</strong> — pago en {days === 0 ? 'hoy' : `${days} día${days > 1 ? 's' : ''}`}
                                    {d.installment_amount && ` (${fmt(d.installment_amount, d.currency)})`}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="deudas-header">
                <div>
                    <h1>Deudas</h1>
                    <p>Seguimiento de préstamos, hipotecas y deudas</p>
                </div>
            </div>

            {/* Summary */}
            <div className="deudas-summary">
                <div className="sum-card total-debt">
                    <span className="sum-label">Deuda Total Pendiente</span>
                    <span className="sum-amount">{fmt(totalDebt, currency)}</span>
                </div>
                <div className="sum-card">
                    <span className="sum-label">Deuda Original</span>
                    <span className="sum-amount">{fmt(totalOriginal, currency)}</span>
                </div>
                <div className="sum-card">
                    <span className="sum-label">Pagado</span>
                    <span className="sum-amount paid">{fmt(totalOriginal - totalDebt, currency)}</span>
                </div>
                <div className="sum-card">
                    <span className="sum-label">Progreso</span>
                    <span className="sum-amount">{totalOriginal > 0 ? ((1 - totalDebt / totalOriginal) * 100).toFixed(0) : 0}%</span>
                </div>
            </div>

            {/* Search */}
            <div className="deudas-search">
                <Search size={18} className="search-icon" />
                <input type="text" placeholder="Buscar deudas..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="search-input" />
            </div>

            {/* Debt Cards */}
            {filtered.length === 0 ? (
                <div className="deudas-empty">
                    <CircleDollarSign size={48} />
                    <h3>{searchTerm ? 'No se encontraron deudas' : 'No tienes deudas registradas'}</h3>
                    <p>{searchTerm ? 'Intenta con otro término' : 'Registra tu primera deuda para llevar control'}</p>
                    {!searchTerm && <button type="button" className="empty-add-btn" onClick={() => { setFormData({ ...DEFAULT_FORM, currency }); setEditingDebt(null); setIsModalOpen(true); }}><Plus size={20} /> Agregar Deuda</button>}
                </div>
            ) : (
                <div className="deudas-grid">
                    {filtered.map(debt => {
                        const Icon = TYPE_ICONS[debt.type] || CircleDollarSign;
                        const progress = debt.original_amount > 0 ? ((debt.original_amount - debt.remaining_amount) / debt.original_amount) * 100 : 0;
                        const nextPay = getNextPaymentDate(debt.payment_day);
                        const daysUntil = nextPay ? differenceInDays(nextPay, new Date()) : null;
                        const debtPayments = payments.filter(p => p.debt_id === debt.id).slice(0, 3);

                        return (
                            <div key={debt.id} className="debt-card" style={{ borderLeftColor: debt.color }}>
                                <div className="debt-card-header">
                                    <div className="debt-icon" style={{ backgroundColor: `${debt.color}20`, color: debt.color }}>
                                        <Icon size={22} />
                                    </div>
                                    <div className="debt-card-actions">
                                        <button type="button" title="Editar" className="dc-btn edit" onClick={() => openEdit(debt)}><Edit2 size={14} /></button>
                                        <button type="button" title="Eliminar" className="dc-btn delete" onClick={() => setDeleteConfirm(debt)}><Trash2 size={14} /></button>
                                    </div>
                                </div>

                                <h3 className="debt-name">{debt.name}</h3>
                                <span className="debt-type">{TYPE_LABELS[debt.type]}</span>
                                {debt.creditor && <span className="debt-creditor">{debt.creditor}</span>}

                                <div className="debt-amounts">
                                    <span className="debt-remaining">{fmt(debt.remaining_amount, debt.currency)}</span>
                                    <span className="debt-original">de {fmt(debt.original_amount, debt.currency)}</span>
                                </div>

                                <div className="debt-progress">
                                    <div className="debt-progress-bar" style={{ width: `${progress}%`, backgroundColor: debt.color }}></div>
                                </div>
                                <span className="debt-progress-text">{progress.toFixed(0)}% pagado</span>

                                {debt.total_installments && (
                                    <span className="debt-installments">Cuota {debt.paid_installments} de {debt.total_installments}</span>
                                )}

                                {daysUntil !== null && (
                                    <div className={`debt-next-pay ${daysUntil <= 3 ? 'urgent' : daysUntil <= 7 ? 'soon' : ''}`}>
                                        <Clock size={13} />
                                        <span>Próximo pago: {daysUntil === 0 ? 'Hoy' : `en ${daysUntil} día${daysUntil > 1 ? 's' : ''}`}</span>
                                        {debt.installment_amount && <span className="pay-amount">{fmt(debt.installment_amount, debt.currency)}</span>}
                                    </div>
                                )}

                                {/* Recent payments */}
                                {debtPayments.length > 0 && (
                                    <div className="debt-recent-payments">
                                        {debtPayments.map(p => (
                                            <div key={p.id} className="recent-pay">
                                                <CheckCircle size={12} />
                                                <span>{format(new Date(p.payment_date), 'd MMM', { locale: es })}</span>
                                                <span className="rp-amount">{fmt(p.amount, debt.currency)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <button type="button" className="pay-btn" onClick={() => { setSelectedDebt(debt); setPayAmount(debt.installment_amount?.toString() || ''); setIsPayModal(true); }}>
                                    Registrar Pago
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Paid off */}
            {paidOff.length > 0 && (
                <div className="paid-off-section">
                    <h3>Deudas Pagadas ({paidOff.length})</h3>
                    <div className="paid-off-list">
                        {paidOff.map(d => (
                            <div key={d.id} className="paid-off-item">
                                <CheckCircle size={16} color="#10B981" />
                                <span>{d.name}</span>
                                <span className="po-amount">{fmt(d.original_amount, d.currency)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* FAB */}
            <button type="button" className="fab-add" onClick={() => { setFormData({ ...DEFAULT_FORM, currency }); setEditingDebt(null); setIsModalOpen(true); }}>
                <Plus size={20} /> Agregar
            </button>

            {/* Modal Crear/Editar Deuda */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingDebt ? 'Editar Deuda' : 'Nueva Deuda'}</h2>
                            <button type="button" className="close-btn" title="Cerrar" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="modal-form">
                            <div className="form-group">
                                <label>Nombre</label>
                                <input type="text" className="form-input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required placeholder="Ej: Hipoteca Bancolombia" />
                            </div>

                            <div className="form-row two-cols">
                                <div className="form-group">
                                    <label>Tipo</label>
                                    <select className="form-select" title="Tipo" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value as Debt['type'] })}>
                                        {DEBT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Acreedor</label>
                                    <input type="text" className="form-input" value={formData.creditor} onChange={e => setFormData({ ...formData, creditor: e.target.value })} placeholder="Ej: Bancolombia" />
                                </div>
                            </div>

                            <div className="form-row two-cols">
                                <div className="form-group">
                                    <label>Monto Original</label>
                                    <input type="number" className="form-input" value={formData.original_amount} onChange={e => setFormData({ ...formData, original_amount: e.target.value })} required min="0" step="0.01" />
                                </div>
                                <div className="form-group">
                                    <label>Tasa de Interés (%)</label>
                                    <input type="number" className="form-input" value={formData.interest_rate} onChange={e => setFormData({ ...formData, interest_rate: e.target.value })} min="0" step="0.01" />
                                </div>
                            </div>

                            <div className="form-row two-cols">
                                <div className="form-group">
                                    <label>Total de Cuotas</label>
                                    <input type="number" className="form-input" value={formData.total_installments} onChange={e => setFormData({ ...formData, total_installments: e.target.value })} placeholder="Ej: 36" min="1" />
                                </div>
                                <div className="form-group">
                                    <label>Valor de Cuota</label>
                                    <input type="number" className="form-input" value={formData.installment_amount} onChange={e => setFormData({ ...formData, installment_amount: e.target.value })} min="0" step="0.01" />
                                </div>
                            </div>

                            <div className="form-row two-cols">
                                <div className="form-group">
                                    <label>Día de Pago (1-31)</label>
                                    <input type="number" className="form-input" value={formData.payment_day} onChange={e => setFormData({ ...formData, payment_day: e.target.value })} min="1" max="31" placeholder="Ej: 15" />
                                </div>
                                <div className="form-group">
                                    <label>Moneda</label>
                                    <select className="form-select" title="Moneda" value={formData.currency} onChange={e => setFormData({ ...formData, currency: e.target.value })}>
                                        <option value="COP">COP</option><option value="USD">USD</option><option value="EUR">EUR</option>
                                    </select>
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Color</label>
                                <div className="color-grid">
                                    {COLORS.map(c => <button key={c} type="button" title={c} className={`color-swatch ${formData.color === c ? 'selected' : ''}`} style={{ backgroundColor: c }} onClick={() => setFormData({ ...formData, color: c })} />)}
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Notas (opcional)</label>
                                <input type="text" className="form-input" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Observaciones" />
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                                <button type="submit" className="btn-submit" disabled={saving}>{saving ? 'Guardando...' : editingDebt ? 'Guardar' : 'Crear'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Pago */}
            {isPayModal && selectedDebt && (
                <div className="modal-overlay" onClick={() => setIsPayModal(false)}>
                    <div className="modal-content pay-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Registrar Pago</h2>
                            <button type="button" className="close-btn" title="Cerrar" onClick={() => setIsPayModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handlePay} className="modal-form">
                            <p className="pay-info">
                                <strong>{selectedDebt.name}</strong><br />
                                Pendiente: {fmt(selectedDebt.remaining_amount, selectedDebt.currency)}
                            </p>
                            <div className="form-group">
                                <label>Monto del pago</label>
                                <input type="number" className="form-input" value={payAmount} onChange={e => setPayAmount(e.target.value)} required min="0" step="0.01" autoFocus />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setIsPayModal(false)}>Cancelar</button>
                                <button type="submit" className="btn-submit">Registrar Pago</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Eliminar */}
            {deleteConfirm && (
                <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
                    <div className="modal-content delete-modal" onClick={e => e.stopPropagation()}>
                        <AlertTriangle size={40} color="#F59E0B" />
                        <h2>¿Eliminar "{deleteConfirm.name}"?</h2>
                        <p>Se eliminarán todos los pagos asociados.</p>
                        <div className="modal-actions">
                            <button type="button" className="btn-cancel" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
                            <button type="button" className="btn-delete" onClick={() => handleDelete(deleteConfirm)}>Eliminar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
