import { useState, useEffect, useMemo } from 'react';
import { Users, Plus, X, CheckCircle, AlertTriangle, ArrowUpRight, ArrowDownRight, DollarSign } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format, differenceInDays, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import './Prestamos.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type Direction = 'lent' | 'borrowed';
type Status = 'pending' | 'partial' | 'paid';

interface PersonalLoan {
    id: string;
    user_id: string;
    person_name: string;
    amount: number;
    direction: Direction;
    description: string | null;
    loan_date: string;
    due_date: string | null;
    status: Status;
    amount_paid: number;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

interface LoanFormData {
    person_name: string;
    amount: string;
    direction: Direction;
    description: string;
    loan_date: string;
    due_date: string;
    notes: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatCOP = (value: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value);

const today = () => new Date().toISOString().split('T')[0];

const statusLabel: Record<Status, string> = {
    pending: 'Pendiente',
    partial: 'Parcial',
    paid: 'Pagado',
};

function isDueSoon(due_date: string | null, status: Status): boolean {
    if (!due_date || status === 'paid') return false;
    const days = differenceInDays(parseISO(due_date), new Date());
    return days >= 0 && days <= 7;
}

function isOverdue(due_date: string | null, status: Status): boolean {
    if (!due_date || status === 'paid') return false;
    return differenceInDays(parseISO(due_date), new Date()) < 0;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Prestamos() {
    const { user } = useAuth();

    const [loans, setLoans] = useState<PersonalLoan[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<Direction>('lent');

    // Modal – new loan
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState<LoanFormData>({
        person_name: '',
        amount: '',
        direction: 'lent',
        description: '',
        loan_date: today(),
        due_date: '',
        notes: '',
    });
    const [saving, setSaving] = useState(false);

    // Modal – partial payment
    const [paymentLoan, setPaymentLoan] = useState<PersonalLoan | null>(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentSaving, setPaymentSaving] = useState(false);

    // ── Data ────────────────────────────────────────────────────────────────

    async function fetchLoans() {
        if (!user) return;
        setLoading(true);
        const { data, error } = await supabase
            .from('personal_loans')
            .select('*')
            .eq('user_id', user.id)
            .order('loan_date', { ascending: false });
        if (!error && data) setLoans(data as PersonalLoan[]);
        setLoading(false);
    }

    useEffect(() => { fetchLoans(); }, [user]);

    // ── Derived ─────────────────────────────────────────────────────────────

    const totalLent = useMemo(
        () => loans.filter(l => l.direction === 'lent' && l.status !== 'paid')
            .reduce((sum, l) => sum + (l.amount - l.amount_paid), 0),
        [loans],
    );
    const totalBorrowed = useMemo(
        () => loans.filter(l => l.direction === 'borrowed' && l.status !== 'paid')
            .reduce((sum, l) => sum + (l.amount - l.amount_paid), 0),
        [loans],
    );

    const filteredLoans = useMemo(
        () => loans.filter(l => l.direction === activeTab),
        [loans, activeTab],
    );

    const alerts = useMemo(
        () => loans.filter(l => (isDueSoon(l.due_date, l.status) || isOverdue(l.due_date, l.status))),
        [loans],
    );

    // ── Actions ─────────────────────────────────────────────────────────────

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (!user) return;
        setSaving(true);
        const payload = {
            user_id: user.id,
            person_name: formData.person_name.trim(),
            amount: parseFloat(formData.amount),
            direction: formData.direction,
            description: formData.description.trim() || null,
            loan_date: formData.loan_date,
            due_date: formData.due_date || null,
            notes: formData.notes.trim() || null,
            status: 'pending' as Status,
            amount_paid: 0,
        };
        const { error } = await supabase.from('personal_loans').insert(payload);
        if (!error) {
            setShowModal(false);
            setFormData({ person_name: '', amount: '', direction: 'lent', description: '', loan_date: today(), due_date: '', notes: '' });
            fetchLoans();
        }
        setSaving(false);
    }

    async function handleMarkPaid(loan: PersonalLoan) {
        const { error } = await supabase
            .from('personal_loans')
            .update({ status: 'paid', amount_paid: loan.amount, updated_at: new Date().toISOString() })
            .eq('id', loan.id);
        if (!error) fetchLoans();
    }

    async function handlePartialPayment(e: React.FormEvent) {
        e.preventDefault();
        if (!paymentLoan) return;
        setPaymentSaving(true);
        const extra = parseFloat(paymentAmount);
        const newPaid = Math.min(paymentLoan.amount_paid + extra, paymentLoan.amount);
        const newStatus: Status = newPaid >= paymentLoan.amount ? 'paid' : 'partial';
        const { error } = await supabase
            .from('personal_loans')
            .update({ amount_paid: newPaid, status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', paymentLoan.id);
        if (!error) {
            setPaymentLoan(null);
            setPaymentAmount('');
            fetchLoans();
        }
        setPaymentSaving(false);
    }

    async function handleDelete(id: string) {
        const { error } = await supabase.from('personal_loans').delete().eq('id', id);
        if (!error) fetchLoans();
    }

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="prestamos-page">

            {/* ── Header ── */}
            <div className="prestamos-header">
                <div className="prestamos-title-row">
                    <div className="prestamos-icon-wrap">
                        <Users size={24} />
                    </div>
                    <div>
                        <h1 className="prestamos-title">Préstamos Personales</h1>
                        <p className="prestamos-subtitle">Lleva el control de lo que prestas y te prestan</p>
                    </div>
                </div>
                <button className="btn-primary" onClick={() => setShowModal(true)}>
                    <Plus size={18} />
                    Nuevo préstamo
                </button>
            </div>

            {/* ── Summary Cards ── */}
            <div className="prestamos-summary">
                <div className="summary-card summary-lent">
                    <div className="summary-card-icon">
                        <ArrowUpRight size={20} />
                    </div>
                    <div className="summary-card-body">
                        <span className="summary-card-label">Total prestado</span>
                        <span className="summary-card-amount">{formatCOP(totalLent)}</span>
                        <span className="summary-card-hint">Pendiente por cobrar</span>
                    </div>
                </div>
                <div className="summary-card summary-borrowed">
                    <div className="summary-card-icon">
                        <ArrowDownRight size={20} />
                    </div>
                    <div className="summary-card-body">
                        <span className="summary-card-label">Total que debo</span>
                        <span className="summary-card-amount">{formatCOP(totalBorrowed)}</span>
                        <span className="summary-card-hint">Pendiente por pagar</span>
                    </div>
                </div>
            </div>

            {/* ── Due Alerts ── */}
            {alerts.length > 0 && (
                <div className="prestamos-alerts">
                    {alerts.map(l => (
                        <div key={l.id} className={`prestamos-alert ${isOverdue(l.due_date, l.status) ? 'alert-danger' : 'alert-warning'}`}>
                            <AlertTriangle size={16} />
                            <span>
                                {isOverdue(l.due_date, l.status)
                                    ? `Préstamo con ${l.person_name} venció el ${format(parseISO(l.due_date!), 'd MMM yyyy', { locale: es })}`
                                    : `Préstamo con ${l.person_name} vence el ${format(parseISO(l.due_date!), 'd MMM yyyy', { locale: es })} (${differenceInDays(parseISO(l.due_date!), new Date())} días)`
                                }
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Tabs ── */}
            <div className="prestamos-tabs">
                <button
                    className={`prestamos-tab ${activeTab === 'lent' ? 'active' : ''}`}
                    onClick={() => setActiveTab('lent')}
                >
                    <ArrowUpRight size={16} />
                    Presté
                    <span className="tab-count">{loans.filter(l => l.direction === 'lent' && l.status !== 'paid').length}</span>
                </button>
                <button
                    className={`prestamos-tab ${activeTab === 'borrowed' ? 'active' : ''}`}
                    onClick={() => setActiveTab('borrowed')}
                >
                    <ArrowDownRight size={16} />
                    Me prestaron
                    <span className="tab-count">{loans.filter(l => l.direction === 'borrowed' && l.status !== 'paid').length}</span>
                </button>
            </div>

            {/* ── Loan List ── */}
            <div className="prestamos-list">
                {loading ? (
                    <div className="prestamos-empty">
                        <div className="loading-spinner" />
                    </div>
                ) : filteredLoans.length === 0 ? (
                    <div className="prestamos-empty">
                        <Users size={48} className="empty-icon" />
                        <p>No hay préstamos en esta sección</p>
                        <button className="btn-primary btn-sm" onClick={() => { setFormData(f => ({ ...f, direction: activeTab })); setShowModal(true); }}>
                            <Plus size={16} /> Agregar préstamo
                        </button>
                    </div>
                ) : (
                    filteredLoans.map(loan => {
                        const pending = loan.amount - loan.amount_paid;
                        const pct = loan.amount > 0 ? (loan.amount_paid / loan.amount) * 100 : 0;
                        const dueSoon = isDueSoon(loan.due_date, loan.status);
                        const overdue = isOverdue(loan.due_date, loan.status);
                        return (
                            <div key={loan.id} className={`loan-card ${dueSoon ? 'due-soon' : ''} ${overdue ? 'overdue' : ''}`}>
                                <div className="loan-card-header">
                                    <div className="loan-person">
                                        <div className="loan-avatar">
                                            {loan.person_name[0].toUpperCase()}
                                        </div>
                                        <div>
                                            <span className="loan-person-name">{loan.person_name}</span>
                                            <span className="loan-date">
                                                {format(parseISO(loan.loan_date), 'd MMM yyyy', { locale: es })}
                                                {loan.due_date && (
                                                    <> · Vence: {format(parseISO(loan.due_date), 'd MMM yyyy', { locale: es })}</>
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                    <span className={`status-badge status-${loan.status}`}>
                                        {statusLabel[loan.status]}
                                    </span>
                                </div>

                                {loan.description && (
                                    <p className="loan-description">{loan.description}</p>
                                )}

                                <div className="loan-amounts">
                                    <div className="loan-amount-item">
                                        <span className="loan-amount-label">Original</span>
                                        <span className="loan-amount-value">{formatCOP(loan.amount)}</span>
                                    </div>
                                    <div className="loan-amount-item">
                                        <span className="loan-amount-label">Pagado</span>
                                        <span className="loan-amount-value loan-paid">{formatCOP(loan.amount_paid)}</span>
                                    </div>
                                    <div className="loan-amount-item">
                                        <span className="loan-amount-label">Pendiente</span>
                                        <span className="loan-amount-value loan-pending">{formatCOP(pending)}</span>
                                    </div>
                                </div>

                                {loan.status !== 'paid' && (
                                    <div className="loan-progress-wrap">
                                        <div className="loan-progress-bar">
                                            <div className="loan-progress-fill" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="loan-progress-pct">{Math.round(pct)}%</span>
                                    </div>
                                )}

                                {(dueSoon || overdue) && (
                                    <div className={`loan-alert-chip ${overdue ? 'chip-danger' : 'chip-warning'}`}>
                                        <AlertTriangle size={13} />
                                        {overdue ? 'Vencido' : `Vence en ${differenceInDays(parseISO(loan.due_date!), new Date())} días`}
                                    </div>
                                )}

                                <div className="loan-actions">
                                    {loan.status !== 'paid' && (
                                        <>
                                            <button
                                                className="btn-action btn-partial"
                                                onClick={() => { setPaymentLoan(loan); setPaymentAmount(''); }}
                                                title="Registrar pago parcial"
                                            >
                                                <DollarSign size={15} />
                                                Registrar pago
                                            </button>
                                            <button
                                                className="btn-action btn-paid"
                                                onClick={() => handleMarkPaid(loan)}
                                                title="Marcar como pagado"
                                            >
                                                <CheckCircle size={15} />
                                                Pagado
                                            </button>
                                        </>
                                    )}
                                    <button
                                        className="btn-action btn-delete"
                                        onClick={() => handleDelete(loan.id)}
                                        title="Eliminar préstamo"
                                    >
                                        <X size={15} />
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* ── Modal – New Loan ── */}
            {showModal && (
                <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
                    <div className="modal-content">
                        <div className="modal-header">
                            <h2 className="modal-title">Nuevo préstamo</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleCreate} className="modal-form">
                            <div className="form-group">
                                <label className="form-label">Tipo de préstamo</label>
                                <div className="direction-toggle">
                                    <button
                                        type="button"
                                        className={`direction-btn ${formData.direction === 'lent' ? 'active-lent' : ''}`}
                                        onClick={() => setFormData(f => ({ ...f, direction: 'lent' }))}
                                    >
                                        <ArrowUpRight size={16} /> Presté dinero
                                    </button>
                                    <button
                                        type="button"
                                        className={`direction-btn ${formData.direction === 'borrowed' ? 'active-borrowed' : ''}`}
                                        onClick={() => setFormData(f => ({ ...f, direction: 'borrowed' }))}
                                    >
                                        <ArrowDownRight size={16} /> Me prestaron
                                    </button>
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Nombre de la persona *</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Ej: Juan Pérez"
                                        value={formData.person_name}
                                        onChange={e => setFormData(f => ({ ...f, person_name: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Monto *</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        placeholder="0"
                                        min="1"
                                        step="1000"
                                        value={formData.amount}
                                        onChange={e => setFormData(f => ({ ...f, amount: e.target.value }))}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Descripción</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="¿Para qué fue el préstamo?"
                                    value={formData.description}
                                    onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Fecha del préstamo *</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={formData.loan_date}
                                        onChange={e => setFormData(f => ({ ...f, loan_date: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Fecha límite (opcional)</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={formData.due_date}
                                        onChange={e => setFormData(f => ({ ...f, due_date: e.target.value }))}
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Notas adicionales</label>
                                <textarea
                                    className="form-input form-textarea"
                                    placeholder="Condiciones, recordatorios..."
                                    value={formData.notes}
                                    onChange={e => setFormData(f => ({ ...f, notes: e.target.value }))}
                                    rows={3}
                                />
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn-primary" disabled={saving}>
                                    {saving ? 'Guardando...' : 'Guardar préstamo'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Modal – Partial Payment ── */}
            {paymentLoan && (
                <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setPaymentLoan(null); }}>
                    <div className="modal-content modal-sm">
                        <div className="modal-header">
                            <h2 className="modal-title">Registrar pago</h2>
                            <button className="modal-close" onClick={() => setPaymentLoan(null)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="payment-info">
                            <p>Préstamo con <strong>{paymentLoan.person_name}</strong></p>
                            <p>Pendiente: <strong className="loan-pending">{formatCOP(paymentLoan.amount - paymentLoan.amount_paid)}</strong></p>
                        </div>
                        <form onSubmit={handlePartialPayment} className="modal-form">
                            <div className="form-group">
                                <label className="form-label">Monto pagado *</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    placeholder="0"
                                    min="1"
                                    max={paymentLoan.amount - paymentLoan.amount_paid}
                                    step="1000"
                                    value={paymentAmount}
                                    onChange={e => setPaymentAmount(e.target.value)}
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn-secondary" onClick={() => setPaymentLoan(null)}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn-primary" disabled={paymentSaving}>
                                    {paymentSaving ? 'Guardando...' : 'Registrar pago'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
