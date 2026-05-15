import { useState, useEffect, useCallback } from 'react';
import {
    MapPin, Calendar, DollarSign, Plus, Trash2, ChevronRight,
    ChevronLeft, X, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Event, Transaction } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { parseLocalDate } from '../lib/dates';
import './Eventos.css';

const EMOJI_OPTIONS = ['📅', '✈️', '🏖️', '🎉', '🏕️', '🎸', '🍽️', '🏃'];
const COLOR_OPTIONS = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
    '#8B5CF6', '#EC4899', '#14B8A6', '#F97316',
];

interface FormData {
    name: string;
    description: string;
    emoji: string;
    color: string;
    start_date: string;
    end_date: string;
    budget: string;
    currency: string;
}

const defaultForm = (): FormData => ({
    name: '',
    description: '',
    emoji: '📅',
    color: '#3B82F6',
    start_date: '',
    end_date: '',
    budget: '',
    currency: 'COP',
});

function progressClass(ratio: number) {
    if (ratio >= 1) return 'danger';
    if (ratio >= 0.8) return 'warning';
    return 'safe';
}

export function Eventos() {
    const { user, profile } = useAuth();
    const currency = profile?.currency || 'COP';

    const [events, setEvents] = useState<Event[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState<FormData>(defaultForm());
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const showToast = useCallback((msg: string, type: 'success' | 'error') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    const loadData = useCallback(async () => {
        if (!user) return;
        const [evRes, txRes] = await Promise.all([
            supabase.from('events').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
            supabase.from('transactions').select('*').eq('user_id', user.id).not('event_id', 'is', null),
        ]);
        setEvents((evRes.data as Event[]) || []);
        setTransactions((txRes.data as Transaction[]) || []);
        setLoading(false);
    }, [user]);

    useEffect(() => { loadData(); }, [loadData]);

    const spentForEvent = (eventId: string) =>
        transactions
            .filter(t => t.event_id === eventId && t.type === 'expense')
            .reduce((acc, t) => acc + Number(t.amount), 0);

    const txForEvent = (eventId: string) =>
        transactions.filter(t => t.event_id === eventId);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        const payload = {
            user_id: user.id,
            name: formData.name,
            description: formData.description || null,
            emoji: formData.emoji,
            color: formData.color,
            start_date: formData.start_date || null,
            end_date: formData.end_date || null,
            budget: formData.budget ? parseFloat(formData.budget) : null,
            currency: formData.currency,
            status: 'active',
        };
        const { error } = await supabase.from('events').insert(payload);
        if (error) { showToast('Error al crear el evento', 'error'); return; }
        showToast('Evento creado', 'success');
        setShowModal(false);
        setFormData(defaultForm());
        loadData();
    };

    const handleDelete = async () => {
        if (!deleteId) return;
        await supabase.from('events').delete().eq('id', deleteId);
        showToast('Evento eliminado', 'success');
        setDeleteId(null);
        if (selectedEvent?.id === deleteId) setSelectedEvent(null);
        loadData();
    };

    if (loading) {
        return (
            <div className="page-content">
                <div className="loading-spinner" />
            </div>
        );
    }

    if (selectedEvent) {
        const spent = spentForEvent(selectedEvent.id);
        const budget = selectedEvent.budget ? Number(selectedEvent.budget) : null;
        const ratio = budget ? spent / budget : 0;
        const remaining = budget !== null ? budget - spent : null;
        const eventTx = txForEvent(selectedEvent.id).sort((a, b) => b.date.localeCompare(a.date));

        return (
            <div className="eventos-page animate-fadeIn">
                {toast && <div className={`tx-toast ${toast.type}`}>{toast.msg}</div>}

                <button className="evento-detail-back" onClick={() => setSelectedEvent(null)}>
                    <ChevronLeft size={16} />
                    Volver a eventos
                </button>

                <div className="evento-detail-hero" style={{ borderLeftColor: selectedEvent.color }}>
                    <div className="evento-detail-hero-header">
                        <div className="evento-detail-title">
                            <span className="evento-detail-emoji">{selectedEvent.emoji}</span>
                            <div>
                                <div className="evento-detail-name">{selectedEvent.name}</div>
                            </div>
                        </div>
                        <button
                            className="btn btn-icon btn-ghost"
                            title="Eliminar evento"
                            onClick={() => setDeleteId(selectedEvent.id)}
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>

                    {selectedEvent.description && (
                        <p className="evento-detail-desc">{selectedEvent.description}</p>
                    )}

                    <div className="evento-detail-stats">
                        {budget !== null && (
                            <div className="evento-stat-card">
                                <span className="evento-stat-label">Presupuesto</span>
                                <span className="evento-stat-value">{currency} {budget.toLocaleString()}</span>
                            </div>
                        )}
                        <div className="evento-stat-card">
                            <span className="evento-stat-label">Gastado</span>
                            <span className={`evento-stat-value ${budget && ratio >= 1 ? 'danger' : ''}`}>
                                {currency} {spent.toLocaleString()}
                            </span>
                        </div>
                        {remaining !== null && (
                            <div className="evento-stat-card">
                                <span className="evento-stat-label">Disponible</span>
                                <span className={`evento-stat-value ${remaining < 0 ? 'danger' : 'success'}`}>
                                    {currency} {remaining.toLocaleString()}
                                </span>
                            </div>
                        )}
                        <div className="evento-stat-card">
                            <span className="evento-stat-label">Transacciones</span>
                            <span className="evento-stat-value">{eventTx.length}</span>
                        </div>
                        {selectedEvent.start_date && (
                            <div className="evento-stat-card">
                                <span className="evento-stat-label">Inicio</span>
                                <span className="evento-stat-value" style={{ fontSize: 'var(--font-size-md)' }}>
                                    {format(parseLocalDate(selectedEvent.start_date), 'd MMM yyyy', { locale: es })}
                                </span>
                            </div>
                        )}
                        {selectedEvent.end_date && (
                            <div className="evento-stat-card">
                                <span className="evento-stat-label">Fin</span>
                                <span className="evento-stat-value" style={{ fontSize: 'var(--font-size-md)' }}>
                                    {format(parseLocalDate(selectedEvent.end_date), 'd MMM yyyy', { locale: es })}
                                </span>
                            </div>
                        )}
                    </div>

                    {budget !== null && (
                        <div className="evento-progress-section">
                            <div className="evento-progress-info">
                                <span className="evento-progress-spent">{Math.round(ratio * 100)}% utilizado</span>
                            </div>
                            <div className="evento-progress-bar">
                                <div
                                    className={`evento-progress-fill ${progressClass(ratio)}`}
                                    style={{ width: `${Math.min(ratio * 100, 100)}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="evento-detail-transactions">
                    <h3>Transacciones del evento</h3>
                    {eventTx.length === 0 ? (
                        <p className="evento-tx-empty">No hay transacciones vinculadas a este evento.</p>
                    ) : (
                        <div className="evento-tx-list">
                            {eventTx.map(tx => (
                                <div key={tx.id} className="evento-tx-item">
                                    <div className="evento-tx-left">
                                        <span className="evento-tx-desc">{tx.description || 'Sin descripción'}</span>
                                        <span className="evento-tx-date">
                                            {format(parseLocalDate(tx.date), 'd MMM yyyy', { locale: es })}
                                        </span>
                                    </div>
                                    <span className={`evento-tx-amount ${tx.type}`}>
                                        {tx.type === 'income' ? '+' : '-'}{currency} {Number(tx.amount).toLocaleString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {deleteId && (
                    <div className="modal-overlay" onClick={() => setDeleteId(null)}>
                        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400, textAlign: 'center', padding: '2rem' }}>
                            <AlertTriangle size={40} color="#F59E0B" />
                            <h2 style={{ margin: '1rem 0 0.5rem', fontSize: '1.1rem' }}>¿Eliminar este evento?</h2>
                            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                                Las transacciones vinculadas no se eliminarán. Esta acción no se puede deshacer.
                            </p>
                            <div className="modal-actions">
                                <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancelar</button>
                                <button className="btn btn-danger" onClick={handleDelete}>Eliminar</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="eventos-page animate-fadeIn">
            {toast && <div className={`tx-toast ${toast.type}`}>{toast.msg}</div>}

            <div className="eventos-header">
                <h1>
                    <MapPin size={24} />
                    Viajes &amp; Eventos
                </h1>
                <button className="btn btn-primary" onClick={() => { setFormData(defaultForm()); setShowModal(true); }}>
                    <Plus size={18} /> Nuevo evento
                </button>
            </div>

            {events.length === 0 ? (
                <div className="eventos-empty">
                    <MapPin size={48} />
                    <p>No tienes eventos aún.</p>
                    <p>Crea tu primer viaje o evento y vincula transacciones para hacer seguimiento del presupuesto.</p>
                    <button className="btn btn-primary" onClick={() => { setFormData(defaultForm()); setShowModal(true); }}>
                        <Plus size={18} /> Crear evento
                    </button>
                </div>
            ) : (
                <div className="eventos-grid">
                    {events.map(ev => {
                        const spent = spentForEvent(ev.id);
                        const budget = ev.budget ? Number(ev.budget) : null;
                        const ratio = budget ? spent / budget : 0;
                        return (
                            <div
                                key={ev.id}
                                className="evento-card"
                                style={{ borderLeftColor: ev.color }}
                                onClick={() => setSelectedEvent(ev)}
                            >
                                <div className="evento-card-header">
                                    <div className="evento-card-title">
                                        <span className="evento-emoji">{ev.emoji}</span>
                                        <span className="evento-name">{ev.name}</span>
                                    </div>
                                    <div className="evento-card-actions">
                                        <button
                                            className="btn btn-icon btn-ghost"
                                            title="Eliminar"
                                            onClick={e => { e.stopPropagation(); setDeleteId(ev.id); }}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                {ev.description && (
                                    <p className="evento-desc">{ev.description}</p>
                                )}

                                <div className="evento-meta">
                                    {(ev.start_date || ev.end_date) && (
                                        <div className="evento-meta-row">
                                            <Calendar size={13} />
                                            <span>
                                                {ev.start_date ? format(parseLocalDate(ev.start_date), 'd MMM yyyy', { locale: es }) : '—'}
                                                {ev.end_date ? ` → ${format(parseLocalDate(ev.end_date), 'd MMM yyyy', { locale: es })}` : ''}
                                            </span>
                                        </div>
                                    )}
                                    {budget !== null && (
                                        <div className="evento-meta-row">
                                            <DollarSign size={13} />
                                            <span>Presupuesto: {currency} {budget.toLocaleString()}</span>
                                        </div>
                                    )}
                                </div>

                                {budget !== null && (
                                    <div className="evento-progress-section">
                                        <div className="evento-progress-info">
                                            <span className="evento-progress-spent">{currency} {spent.toLocaleString()}</span>
                                            <span className="evento-progress-budget">/ {currency} {budget.toLocaleString()}</span>
                                        </div>
                                        <div className="evento-progress-bar">
                                            <div
                                                className={`evento-progress-fill ${progressClass(ratio)}`}
                                                style={{ width: `${Math.min(ratio * 100, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="evento-chevron">
                                    <ChevronRight size={16} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Nuevo evento</h2>
                            <button className="btn btn-icon btn-ghost" onClick={() => setShowModal(false)} title="Cerrar">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="modal-body">
                            <div className="form-group">
                                <label className="form-label">Emoji</label>
                                <div className="evento-emoji-picker">
                                    {EMOJI_OPTIONS.map(em => (
                                        <button
                                            key={em}
                                            type="button"
                                            className={`evento-emoji-btn ${formData.emoji === em ? 'selected' : ''}`}
                                            onClick={() => setFormData(p => ({ ...p, emoji: em }))}
                                        >
                                            {em}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Nombre *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.name}
                                    onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                                    placeholder="ej. Vacaciones Cartagena"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Descripción</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.description}
                                    onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                                    placeholder="Descripción opcional"
                                />
                            </div>

                            <div className="evento-modal-grid">
                                <div className="form-group">
                                    <label className="form-label">Fecha inicio</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={formData.start_date}
                                        onChange={e => setFormData(p => ({ ...p, start_date: e.target.value }))}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Fecha fin</label>
                                    <input
                                        type="date"
                                        className="form-input"
                                        value={formData.end_date}
                                        onChange={e => setFormData(p => ({ ...p, end_date: e.target.value }))}
                                    />
                                </div>
                            </div>

                            <div className="evento-modal-grid">
                                <div className="form-group">
                                    <label className="form-label">Presupuesto</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={formData.budget}
                                        onChange={e => setFormData(p => ({ ...p, budget: e.target.value }))}
                                        placeholder="0"
                                        min="0"
                                        step="0.01"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Moneda</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={formData.currency}
                                        onChange={e => setFormData(p => ({ ...p, currency: e.target.value }))}
                                        placeholder="COP"
                                        maxLength={3}
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Color</label>
                                <div className="evento-color-picker">
                                    {COLOR_OPTIONS.map(col => (
                                        <button
                                            key={col}
                                            type="button"
                                            className={`evento-color-btn ${formData.color === col ? 'selected' : ''}`}
                                            style={{ backgroundColor: col }}
                                            onClick={() => setFormData(p => ({ ...p, color: col }))}
                                            title={col}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">Crear evento</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {deleteId && (
                <div className="modal-overlay" onClick={() => setDeleteId(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400, textAlign: 'center', padding: '2rem' }}>
                        <AlertTriangle size={40} color="#F59E0B" />
                        <h2 style={{ margin: '1rem 0 0.5rem', fontSize: '1.1rem' }}>¿Eliminar este evento?</h2>
                        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                            Las transacciones vinculadas no se eliminarán. Esta acción no se puede deshacer.
                        </p>
                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancelar</button>
                            <button className="btn btn-danger" onClick={handleDelete}>Eliminar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
