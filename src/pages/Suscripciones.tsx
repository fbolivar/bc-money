import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Plus, Edit2, Trash2, X, Search, AlertTriangle, Clock,
    Tv, Monitor, Music, Gamepad2, Dumbbell, GraduationCap, Newspaper,
    Cloud, Shield, Users, MoreHorizontal, Pause, Play, Ban,
    CalendarClock, RefreshCw,
    type LucideIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Subscription } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import './Suscripciones.css';

const CATEGORIES: { value: Subscription['category']; label: string; icon: LucideIcon; color: string }[] = [
    { value: 'entertainment', label: 'Entretenimiento', icon: Tv, color: '#EF4444' },
    { value: 'software', label: 'Software', icon: Monitor, color: '#3B82F6' },
    { value: 'music', label: 'Musica', icon: Music, color: '#8B5CF6' },
    { value: 'gaming', label: 'Videojuegos', icon: Gamepad2, color: '#10B981' },
    { value: 'fitness', label: 'Fitness', icon: Dumbbell, color: '#F97316' },
    { value: 'education', label: 'Educacion', icon: GraduationCap, color: '#EC4899' },
    { value: 'news', label: 'Noticias', icon: Newspaper, color: '#64748B' },
    { value: 'cloud', label: 'Nube', icon: Cloud, color: '#06B6D4' },
    { value: 'insurance', label: 'Seguros', icon: Shield, color: '#F59E0B' },
    { value: 'membership', label: 'Membresia', icon: Users, color: '#6366F1' },
    { value: 'other', label: 'Otro', icon: MoreHorizontal, color: '#6B7280' },
];

const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(c => [c.value, c]));

const BILLING_CYCLES: { value: Subscription['billing_cycle']; label: string; months: number }[] = [
    { value: 'weekly', label: 'Semanal', months: 1 / 4.33 },
    { value: 'monthly', label: 'Mensual', months: 1 },
    { value: 'quarterly', label: 'Trimestral', months: 3 },
    { value: 'yearly', label: 'Anual', months: 12 },
];

const CYCLE_LABEL = Object.fromEntries(BILLING_CYCLES.map(c => [c.value, c.label]));
const CYCLE_MONTHS = Object.fromEntries(BILLING_CYCLES.map(c => [c.value, c.months]));

const STATUS_LABELS: Record<Subscription['status'], string> = {
    active: 'Activa',
    paused: 'Pausada',
    cancelled: 'Cancelada',
};

const COLORS = ['#EF4444', '#F97316', '#F59E0B', '#10B981', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#64748B'];

function fmt(amount: number, currency: string) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

function toMonthly(amount: number, cycle: Subscription['billing_cycle']): number {
    const months = CYCLE_MONTHS[cycle] || 1;
    return amount / months;
}

interface SubFormData {
    name: string; category: Subscription['category']; amount: string; currency: string;
    billing_cycle: Subscription['billing_cycle']; next_billing_date: string;
    auto_renew: boolean; color: string; provider: string; status: Subscription['status'];
    notes: string;
}

const DEFAULT_FORM: SubFormData = {
    name: '', category: 'entertainment', amount: '', currency: 'COP',
    billing_cycle: 'monthly', next_billing_date: format(new Date(), 'yyyy-MM-dd'),
    auto_renew: true, color: '#3B82F6', provider: '', status: 'active', notes: '',
};

export function Suscripciones() {
    const { user, profile } = useAuth();
    const [subs, setSubs] = useState<Subscription[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSub, setEditingSub] = useState<Subscription | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<Subscription | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [formData, setFormData] = useState<SubFormData>(DEFAULT_FORM);

    const currency = profile?.currency || 'COP';

    const showToast = useCallback((msg: string, type: 'success' | 'error') => {
        setToast({ message: msg, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    const fetchData = useCallback(async () => {
        if (!user) return;
        const { data } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('user_id', user.id)
            .order('next_billing_date', { ascending: true });
        setSubs(data || []);
        setLoading(false);
    }, [user]);

    useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

    const filtered = useMemo(() => {
        if (!searchTerm) return subs;
        const t = searchTerm.toLowerCase();
        return subs.filter(s =>
            s.name.toLowerCase().includes(t) ||
            (s.provider || '').toLowerCase().includes(t) ||
            CATEGORY_MAP[s.category]?.label.toLowerCase().includes(t)
        );
    }, [subs, searchTerm]);

    const activeSubs = useMemo(() => filtered.filter(s => s.status === 'active'), [filtered]);
    const pausedSubs = useMemo(() => filtered.filter(s => s.status === 'paused'), [filtered]);
    const cancelledSubs = useMemo(() => filtered.filter(s => s.status === 'cancelled'), [filtered]);

    const totalMonthly = useMemo(() =>
        activeSubs.reduce((sum, s) => sum + toMonthly(s.amount, s.billing_cycle), 0),
        [activeSubs]
    );

    const upcomingRenewals = useMemo(() =>
        activeSubs.filter(s => {
            const days = differenceInDays(new Date(s.next_billing_date), new Date());
            return days >= 0 && days <= 7;
        }),
        [activeSubs]
    );

    const alerts = useMemo(() =>
        activeSubs.filter(s => {
            const days = differenceInDays(new Date(s.next_billing_date), new Date());
            return days >= 0 && days <= 7;
        }),
        [activeSubs]
    );

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!user || saving) return;
        setSaving(true);
        try {
            const data = {
                user_id: user.id,
                name: formData.name,
                category: formData.category,
                amount: parseFloat(formData.amount),
                currency: formData.currency,
                billing_cycle: formData.billing_cycle,
                next_billing_date: formData.next_billing_date,
                auto_renew: formData.auto_renew,
                color: formData.color,
                provider: formData.provider || null,
                status: formData.status,
                notes: formData.notes || null,
            };
            if (editingSub) {
                await supabase.from('subscriptions').update(data).eq('id', editingSub.id);
                showToast('Suscripcion actualizada', 'success');
            } else {
                await supabase.from('subscriptions').insert(data);
                showToast('Suscripcion creada', 'success');
            }
            closeModal();
            fetchData();
        } catch { showToast('Error al guardar', 'error'); }
        finally { setSaving(false); }
    }

    async function handleDelete(sub: Subscription) {
        try {
            await supabase.from('subscriptions').delete().eq('id', sub.id);
            setDeleteConfirm(null);
            showToast('Suscripcion eliminada', 'success');
            fetchData();
        } catch { showToast('Error al eliminar', 'error'); setDeleteConfirm(null); }
    }

    function openEdit(sub: Subscription) {
        setEditingSub(sub);
        setFormData({
            name: sub.name, category: sub.category, amount: sub.amount.toString(),
            currency: sub.currency, billing_cycle: sub.billing_cycle,
            next_billing_date: sub.next_billing_date, auto_renew: sub.auto_renew,
            color: sub.color, provider: sub.provider || '', status: sub.status,
            notes: sub.notes || '',
        });
        setIsModalOpen(true);
    }

    function closeModal() {
        setIsModalOpen(false);
        setEditingSub(null);
        setFormData({ ...DEFAULT_FORM, currency });
    }

    if (loading) return <div className="loading-screen">Cargando...</div>;

    return (
        <div className="subs-container">
            {toast && <div className={`sub-toast ${toast.type}`}>{toast.message}</div>}

            {/* Alerts */}
            {alerts.length > 0 && (
                <div className="sub-alerts">
                    {alerts.map(s => {
                        const days = differenceInDays(new Date(s.next_billing_date), new Date());
                        return (
                            <div key={s.id} className="sub-alert">
                                <CalendarClock size={16} />
                                <span>
                                    <strong>{s.name}</strong> — cobro {days === 0 ? 'hoy' : `en ${days} dia${days > 1 ? 's' : ''}`}
                                    {' '}({fmt(s.amount, s.currency)})
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="subs-header">
                <div>
                    <h1>Suscripciones</h1>
                    <p>Gestiona tus servicios recurrentes</p>
                </div>
            </div>

            {/* Summary */}
            <div className="subs-summary">
                <div className="scard primary">
                    <span className="scard-label">Costo Mensual</span>
                    <span className="scard-amount">{fmt(totalMonthly, currency)}</span>
                </div>
                <div className="scard">
                    <span className="scard-label">Activas</span>
                    <span className="scard-amount">{activeSubs.length}</span>
                </div>
                <div className="scard">
                    <span className="scard-label">Proximas Renovaciones</span>
                    <span className="scard-amount">{upcomingRenewals.length}</span>
                </div>
                <div className="scard">
                    <span className="scard-label">Costo Anual Est.</span>
                    <span className="scard-amount">{fmt(totalMonthly * 12, currency)}</span>
                </div>
            </div>

            {/* Search */}
            <div className="subs-search">
                <Search size={18} className="search-icon" />
                <input
                    type="text"
                    placeholder="Buscar suscripciones..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="search-input"
                />
            </div>

            {/* Active */}
            {activeSubs.length === 0 && pausedSubs.length === 0 && cancelledSubs.length === 0 ? (
                <div className="subs-empty">
                    <RefreshCw size={48} />
                    <h3>{searchTerm ? 'No se encontraron suscripciones' : 'No tienes suscripciones registradas'}</h3>
                    <p>{searchTerm ? 'Intenta con otro termino' : 'Agrega tu primera suscripcion para llevar control'}</p>
                    {!searchTerm && (
                        <button type="button" className="empty-add-btn" onClick={() => { setFormData({ ...DEFAULT_FORM, currency }); setEditingSub(null); setIsModalOpen(true); }}>
                            <Plus size={20} /> Agregar Suscripcion
                        </button>
                    )}
                </div>
            ) : (
                <>
                    {activeSubs.length > 0 && (
                        <div className="subs-section">
                            <h3>Activas ({activeSubs.length})</h3>
                            <div className="subs-grid">
                                {activeSubs.map(sub => <SubCard key={sub.id} sub={sub} currency={currency} onEdit={openEdit} onDelete={setDeleteConfirm} />)}
                            </div>
                        </div>
                    )}

                    {pausedSubs.length > 0 && (
                        <div className="subs-section">
                            <h3>Pausadas ({pausedSubs.length})</h3>
                            <div className="subs-grid">
                                {pausedSubs.map(sub => <SubCard key={sub.id} sub={sub} currency={currency} onEdit={openEdit} onDelete={setDeleteConfirm} />)}
                            </div>
                        </div>
                    )}

                    {cancelledSubs.length > 0 && (
                        <div className="subs-section">
                            <h3>Canceladas ({cancelledSubs.length})</h3>
                            <div className="subs-grid">
                                {cancelledSubs.map(sub => <SubCard key={sub.id} sub={sub} currency={currency} onEdit={openEdit} onDelete={setDeleteConfirm} />)}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* FAB */}
            <button type="button" className="sub-fab" onClick={() => { setFormData({ ...DEFAULT_FORM, currency }); setEditingSub(null); setIsModalOpen(true); }}>
                <Plus size={20} /> Agregar
            </button>

            {/* CRUD Modal */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingSub ? 'Editar Suscripcion' : 'Nueva Suscripcion'}</h2>
                            <button type="button" className="close-btn" title="Cerrar" onClick={closeModal}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="modal-form">
                            <div className="form-group">
                                <label>Nombre</label>
                                <input type="text" className="form-input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required placeholder="Ej: Netflix, Spotify" />
                            </div>

                            <div className="form-row two-cols">
                                <div className="form-group">
                                    <label>Categoria</label>
                                    <select className="form-select" title="Categoria" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value as Subscription['category'] })}>
                                        {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Proveedor</label>
                                    <input type="text" className="form-input" value={formData.provider} onChange={e => setFormData({ ...formData, provider: e.target.value })} placeholder="Ej: Google, Apple" />
                                </div>
                            </div>

                            <div className="form-row two-cols">
                                <div className="form-group">
                                    <label>Monto</label>
                                    <input type="number" className="form-input" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} required min="0" step="0.01" />
                                </div>
                                <div className="form-group">
                                    <label>Moneda</label>
                                    <select className="form-select" title="Moneda" value={formData.currency} onChange={e => setFormData({ ...formData, currency: e.target.value })}>
                                        <option value="COP">COP</option><option value="USD">USD</option><option value="EUR">EUR</option>
                                    </select>
                                </div>
                            </div>

                            <div className="form-row two-cols">
                                <div className="form-group">
                                    <label>Ciclo de Cobro</label>
                                    <select className="form-select" title="Ciclo" value={formData.billing_cycle} onChange={e => setFormData({ ...formData, billing_cycle: e.target.value as Subscription['billing_cycle'] })}>
                                        {BILLING_CYCLES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Proximo Cobro</label>
                                    <input type="date" className="form-input" value={formData.next_billing_date} onChange={e => setFormData({ ...formData, next_billing_date: e.target.value })} required />
                                </div>
                            </div>

                            <div className="form-row two-cols">
                                <div className="form-group">
                                    <label>Estado</label>
                                    <select className="form-select" title="Estado" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value as Subscription['status'] })}>
                                        <option value="active">Activa</option>
                                        <option value="paused">Pausada</option>
                                        <option value="cancelled">Cancelada</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="toggle-label">
                                        <input type="checkbox" checked={formData.auto_renew} onChange={e => setFormData({ ...formData, auto_renew: e.target.checked })} />
                                        <span>Renovacion automatica</span>
                                    </label>
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Color</label>
                                <div className="color-grid">
                                    {COLORS.map(c => (
                                        <button key={c} type="button" title={c} className={`color-swatch ${formData.color === c ? 'selected' : ''}`} style={{ backgroundColor: c }} onClick={() => setFormData({ ...formData, color: c })} />
                                    ))}
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Notas (opcional)</label>
                                <input type="text" className="form-input" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Observaciones" />
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={closeModal}>Cancelar</button>
                                <button type="submit" className="btn-submit" disabled={saving}>{saving ? 'Guardando...' : editingSub ? 'Guardar' : 'Crear'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {deleteConfirm && (
                <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
                    <div className="modal-content delete-modal" onClick={e => e.stopPropagation()}>
                        <AlertTriangle size={40} color="#F59E0B" />
                        <h2>Eliminar "{deleteConfirm.name}"?</h2>
                        <p>Esta accion no se puede deshacer.</p>
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

/* ---- SubCard Component ---- */
function SubCard({ sub, currency, onEdit, onDelete }: {
    sub: Subscription; currency: string;
    onEdit: (s: Subscription) => void; onDelete: (s: Subscription) => void;
}) {
    const cat = CATEGORY_MAP[sub.category] || CATEGORY_MAP.other;
    const Icon = cat.icon;
    const days = differenceInDays(new Date(sub.next_billing_date), new Date());
    const monthly = toMonthly(sub.amount, sub.billing_cycle);
    const StatusIcon = sub.status === 'active' ? Play : sub.status === 'paused' ? Pause : Ban;

    return (
        <div className={`sub-card ${sub.status}`} style={{ borderLeftColor: sub.color }}>
            <div className="sub-card-header">
                <div className="sub-icon" style={{ backgroundColor: `${sub.color}20`, color: sub.color }}>
                    <Icon size={22} />
                </div>
                <div className="sub-card-actions">
                    <button type="button" title="Editar" className="sc-btn edit" onClick={() => onEdit(sub)}><Edit2 size={14} /></button>
                    <button type="button" title="Eliminar" className="sc-btn delete" onClick={() => onDelete(sub)}><Trash2 size={14} /></button>
                </div>
            </div>

            <h3 className="sub-name">{sub.name}</h3>
            <div className="sub-meta">
                <span className="sub-category">{cat.label}</span>
                <span className={`sub-status ${sub.status}`}>
                    <StatusIcon size={12} /> {STATUS_LABELS[sub.status]}
                </span>
            </div>
            {sub.provider && <span className="sub-provider">{sub.provider}</span>}

            <div className="sub-pricing">
                <span className="sub-amount">{fmt(sub.amount, sub.currency)}</span>
                <span className="sub-cycle">/ {CYCLE_LABEL[sub.billing_cycle]}</span>
            </div>

            {sub.billing_cycle !== 'monthly' && (
                <span className="sub-monthly-eq">{fmt(monthly, sub.currency)} / mes equivalente</span>
            )}

            <div className={`sub-next-billing ${days <= 3 && days >= 0 ? 'urgent' : days <= 7 && days >= 0 ? 'soon' : ''}`}>
                <Clock size={13} />
                <span>
                    {days < 0
                        ? `Vencido hace ${Math.abs(days)} dia${Math.abs(days) > 1 ? 's' : ''}`
                        : days === 0
                            ? 'Cobra hoy'
                            : `Cobra en ${days} dia${days > 1 ? 's' : ''}`
                    }
                </span>
                <span className="billing-date">{format(new Date(sub.next_billing_date), 'd MMM yyyy', { locale: es })}</span>
            </div>

            {sub.auto_renew && (
                <div className="sub-auto-renew">
                    <RefreshCw size={12} /> Renovacion automatica
                </div>
            )}

            {sub.notes && <p className="sub-notes">{sub.notes}</p>}
        </div>
    );
}
