import { useState, useEffect, useCallback } from 'react';
import { Split, Users, CheckCircle, Plus, Trash2, X, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import './Division.css';

interface Participant {
    name: string;
    amount: number;
    paid: boolean;
}

interface ExpenseSplit {
    id: string;
    user_id: string;
    transaction_id: string | null;
    description: string;
    total_amount: number;
    currency: string;
    date: string;
    participants: Participant[];
    created_at: string;
}

interface FormState {
    description: string;
    total_amount: string;
    currency: string;
    date: string;
    participants: Participant[];
}

const defaultForm = (): FormState => ({
    description: '',
    total_amount: '',
    currency: 'COP',
    date: format(new Date(), 'yyyy-MM-dd'),
    participants: [
        { name: '', amount: 0, paid: false },
        { name: '', amount: 0, paid: false },
    ],
});

export function Division() {
    const { user, profile } = useAuth();
    const [splits, setSplits] = useState<ExpenseSplit[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingSplit, setEditingSplit] = useState<ExpenseSplit | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(defaultForm());
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const currency = profile?.currency || 'COP';

    const showToast = useCallback((msg: string, type: 'success' | 'error') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    const fetchSplits = useCallback(async () => {
        if (!user) return;
        const { data } = await supabase
            .from('expense_splits')
            .select('*')
            .eq('user_id', user.id)
            .order('date', { ascending: false });
        setSplits((data as ExpenseSplit[]) || []);
        setLoading(false);
    }, [user]);

    useEffect(() => {
        fetchSplits();
    }, [fetchSplits]);

    const splitEqually = () => {
        const total = parseFloat(form.total_amount) || 0;
        const count = form.participants.length;
        if (count === 0) return;
        const each = parseFloat((total / count).toFixed(2));
        setForm(prev => ({
            ...prev,
            participants: prev.participants.map(p => ({ ...p, amount: each })),
        }));
    };

    const addParticipant = () => {
        if (form.participants.length >= 10) return;
        setForm(prev => ({
            ...prev,
            participants: [...prev.participants, { name: '', amount: 0, paid: false }],
        }));
    };

    const removeParticipant = (idx: number) => {
        setForm(prev => ({
            ...prev,
            participants: prev.participants.filter((_, i) => i !== idx),
        }));
    };

    const updateParticipant = (idx: number, field: keyof Participant, value: string | number | boolean) => {
        setForm(prev => ({
            ...prev,
            participants: prev.participants.map((p, i) =>
                i === idx ? { ...p, [field]: value } : p
            ),
        }));
    };

    const openNew = () => {
        setEditingSplit(null);
        setForm(defaultForm());
        setShowModal(true);
    };

    const openEdit = (split: ExpenseSplit) => {
        setEditingSplit(split);
        setForm({
            description: split.description,
            total_amount: String(split.total_amount),
            currency: split.currency,
            date: split.date,
            participants: split.participants,
        });
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        const payload = {
            user_id: user.id,
            description: form.description,
            total_amount: parseFloat(form.total_amount),
            currency: form.currency,
            date: form.date,
            participants: form.participants,
        };
        if (editingSplit) {
            await supabase.from('expense_splits').update(payload).eq('id', editingSplit.id);
            showToast('División actualizada', 'success');
        } else {
            await supabase.from('expense_splits').insert(payload);
            showToast('División creada', 'success');
        }
        setShowModal(false);
        setEditingSplit(null);
        fetchSplits();
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        await supabase.from('expense_splits').delete().eq('id', deleteId);
        setDeleteId(null);
        showToast('División eliminada', 'success');
        fetchSplits();
    };

    const markPaid = async (split: ExpenseSplit, participantIdx: number, paid: boolean) => {
        const updated = split.participants.map((p, i) =>
            i === participantIdx ? { ...p, paid } : p
        );
        await supabase
            .from('expense_splits')
            .update({ participants: updated })
            .eq('id', split.id);
        fetchSplits();
    };

    const totalOwedToMe = splits.reduce((acc, s) => {
        const owed = s.participants
            .filter(p => !p.paid)
            .reduce((sum, p) => sum + Number(p.amount), 0);
        return acc + owed;
    }, 0);

    const totalPaid = splits.reduce((acc, s) => {
        const paid = s.participants
            .filter(p => p.paid)
            .reduce((sum, p) => sum + Number(p.amount), 0);
        return acc + paid;
    }, 0);

    if (loading) {
        return (
            <div className="division-page animate-fadeIn">
                <div className="division-loading">Cargando...</div>
            </div>
        );
    }

    return (
        <div className="division-page animate-fadeIn">
            {toast && <div className={`division-toast ${toast.type}`}>{toast.msg}</div>}

            <div className="division-header">
                <div className="division-title-row">
                    <Split size={28} className="division-title-icon" />
                    <h1>División de Gastos</h1>
                </div>
                <button type="button" className="btn btn-primary" onClick={openNew}>
                    <Plus size={18} /> Nueva división
                </button>
            </div>

            <div className="division-summary">
                <div className="division-summary-card pending">
                    <Users size={22} />
                    <div>
                        <span className="division-summary-label">Pendiente cobro</span>
                        <span className="division-summary-value">{currency} {totalOwedToMe.toLocaleString()}</span>
                    </div>
                </div>
                <div className="division-summary-card settled">
                    <CheckCircle size={22} />
                    <div>
                        <span className="division-summary-label">Ya pagado</span>
                        <span className="division-summary-value">{currency} {totalPaid.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            {splits.length === 0 ? (
                <div className="division-empty">
                    <Split size={48} className="division-empty-icon" />
                    <p>No hay divisiones de gastos aún.</p>
                    <button type="button" className="btn btn-primary" onClick={openNew}>
                        <Plus size={16} /> Crear primera división
                    </button>
                </div>
            ) : (
                <div className="division-list">
                    {splits.map(split => {
                        const unpaid = split.participants.filter(p => !p.paid);
                        const paid = split.participants.filter(p => p.paid);
                        return (
                            <div key={split.id} className="division-card">
                                <div className="division-card-header">
                                    <div className="division-card-meta">
                                        <h3 className="division-card-title">{split.description}</h3>
                                        <span className="division-card-date">
                                            {format(new Date(split.date + 'T00:00:00'), 'd MMM yyyy', { locale: es })}
                                        </span>
                                    </div>
                                    <div className="division-card-total">
                                        <span className="division-card-amount">{split.currency} {Number(split.total_amount).toLocaleString()}</span>
                                        <div className="division-card-actions">
                                            <button
                                                type="button"
                                                className="btn btn-icon btn-ghost"
                                                title="Editar"
                                                onClick={() => openEdit(split)}
                                            >
                                                <Split size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-icon btn-ghost"
                                                title="Eliminar"
                                                onClick={() => setDeleteId(split.id)}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {unpaid.length > 0 && (
                                    <div className="division-participants-group">
                                        <span className="division-group-label">Pendiente</span>
                                        {unpaid.map((p, idx) => {
                                            const realIdx = split.participants.indexOf(p);
                                            return (
                                                <div key={idx} className="division-participant pending">
                                                    <span className="participant-name">{p.name || 'Sin nombre'}</span>
                                                    <span className="participant-amount">{split.currency} {Number(p.amount).toLocaleString()}</span>
                                                    <button
                                                        type="button"
                                                        className="btn btn-icon btn-ghost mark-paid-btn"
                                                        title="Marcar como pagado"
                                                        onClick={() => markPaid(split, realIdx, true)}
                                                    >
                                                        <CheckCircle size={16} />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {paid.length > 0 && (
                                    <div className="division-participants-group">
                                        <span className="division-group-label settled-label">Pagado</span>
                                        {paid.map((p, idx) => {
                                            const realIdx = split.participants.indexOf(p);
                                            return (
                                                <div key={idx} className="division-participant settled">
                                                    <span className="participant-name">{p.name || 'Sin nombre'}</span>
                                                    <span className="participant-amount">{split.currency} {Number(p.amount).toLocaleString()}</span>
                                                    <button
                                                        type="button"
                                                        className="btn btn-icon btn-ghost"
                                                        title="Marcar como pendiente"
                                                        onClick={() => markPaid(split, realIdx, false)}
                                                    >
                                                        <CheckCircle size={16} className="icon-settled" />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal division-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingSplit ? 'Editar División' : 'Nueva División de Gasto'}</h2>
                            <button type="button" className="btn btn-icon btn-ghost" title="Cerrar" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="modal-body">
                            <div className="form-group">
                                <label className="form-label">Descripción</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={form.description}
                                    onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder="Ej: Cena de cumpleaños"
                                    required
                                />
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Monto total</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={form.total_amount}
                                        onChange={e => setForm(prev => ({ ...prev, total_amount: e.target.value }))}
                                        placeholder="0.00"
                                        step="0.01"
                                        min="0"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Moneda</label>
                                    <select
                                        className="form-select"
                                        value={form.currency}
                                        onChange={e => setForm(prev => ({ ...prev, currency: e.target.value }))}
                                        title="Moneda"
                                    >
                                        <option value="COP">COP</option>
                                        <option value="USD">USD</option>
                                        <option value="EUR">EUR</option>
                                        <option value="MXN">MXN</option>
                                        <option value="ARS">ARS</option>
                                        <option value="BRL">BRL</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Fecha</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={form.date}
                                        onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="division-participants-header">
                                <span className="form-label">Participantes</span>
                                <div className="division-participants-actions">
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={splitEqually}>
                                        <Split size={14} /> Dividir equitativamente
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={addParticipant}
                                        disabled={form.participants.length >= 10}
                                    >
                                        <Plus size={14} /> Añadir
                                    </button>
                                </div>
                            </div>

                            <div className="division-participants-list">
                                {form.participants.map((p, idx) => (
                                    <div key={idx} className="division-participant-row">
                                        <input
                                            type="text"
                                            className="form-input participant-name-input"
                                            placeholder="Nombre"
                                            value={p.name}
                                            onChange={e => updateParticipant(idx, 'name', e.target.value)}
                                        />
                                        <input
                                            type="number"
                                            className="form-input participant-amount-input"
                                            placeholder="0.00"
                                            step="0.01"
                                            min="0"
                                            value={p.amount === 0 ? '' : p.amount}
                                            onChange={e => updateParticipant(idx, 'amount', parseFloat(e.target.value) || 0)}
                                        />
                                        <label className="participant-paid-label" title="Ya pagó">
                                            <input
                                                type="checkbox"
                                                checked={p.paid}
                                                onChange={e => updateParticipant(idx, 'paid', e.target.checked)}
                                            />
                                            <CheckCircle size={16} className={p.paid ? 'icon-settled' : 'icon-pending'} />
                                        </label>
                                        <button
                                            type="button"
                                            className="btn btn-icon btn-ghost"
                                            title="Eliminar participante"
                                            onClick={() => removeParticipant(idx)}
                                            disabled={form.participants.length <= 2}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <div className="division-total-check">
                                <span>Suma de participantes:</span>
                                <span className={
                                    Math.abs(
                                        form.participants.reduce((s, p) => s + Number(p.amount), 0) -
                                        (parseFloat(form.total_amount) || 0)
                                    ) < 0.01 ? 'total-ok' : 'total-warn'
                                }>
                                    {form.currency} {form.participants.reduce((s, p) => s + Number(p.amount), 0).toLocaleString()}
                                </span>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {editingSplit ? 'Guardar' : 'Crear'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {deleteId && (
                <div className="modal-overlay" onClick={() => setDeleteId(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400, textAlign: 'center', padding: '2rem' }}>
                        <AlertTriangle size={40} color="#F59E0B" />
                        <h2 style={{ margin: '1rem 0 0.5rem', fontSize: '1.1rem' }}>¿Eliminar esta división?</h2>
                        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                            Esta acción no se puede deshacer.
                        </p>
                        <div className="modal-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancelar</button>
                            <button type="button" className="btn btn-danger" onClick={confirmDelete}>Eliminar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
