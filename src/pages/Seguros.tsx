import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { differenceInDays, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    ShieldCheck, Plus, Pencil, Trash2, X, Car, Heart, Home, Umbrella,
    AlertTriangle, CheckCircle, Clock, ChevronDown,
} from 'lucide-react';
import './Seguros.css';

interface Policy {
    id: string;
    name: string;
    insurer: string | null;
    type: string;
    premium_amount: number | null;
    premium_frequency: string;
    renewal_date: string | null;
    coverage_amount: number | null;
    currency: string;
    notes: string | null;
    active: boolean;
}

const POLICY_TYPES = [
    { value: 'salud', label: 'Salud', icon: Heart },
    { value: 'auto', label: 'Automóvil', icon: Car },
    { value: 'vida', label: 'Vida', icon: ShieldCheck },
    { value: 'hogar', label: 'Hogar', icon: Home },
    { value: 'otro', label: 'Otro', icon: Umbrella },
];

const FREQUENCIES = [
    { value: 'mensual', label: 'Mensual' },
    { value: 'trimestral', label: 'Trimestral' },
    { value: 'semestral', label: 'Semestral' },
    { value: 'anual', label: 'Anual' },
];

const EMPTY_FORM = {
    name: '', insurer: '', type: 'salud', premium_amount: '',
    premium_frequency: 'mensual', renewal_date: '', coverage_amount: '',
    currency: 'COP', notes: '', active: true,
};

function getDaysLabel(days: number) {
    if (days < 0) return { label: `Venció hace ${Math.abs(days)}d`, cls: 'expired' };
    if (days === 0) return { label: 'Vence hoy', cls: 'urgent' };
    if (days <= 30) return { label: `Vence en ${days}d`, cls: 'urgent' };
    if (days <= 60) return { label: `Vence en ${days}d`, cls: 'warn' };
    return { label: `Vence en ${days}d`, cls: 'ok' };
}

function TypeIcon({ type, size = 18 }: { type: string; size?: number }) {
    const found = POLICY_TYPES.find(t => t.value === type);
    const Icon = found?.icon ?? Umbrella;
    return <Icon size={size} />;
}

export function Seguros() {
    const { user, profile } = useAuth();
    const currency = profile?.currency || 'COP';
    const [policies, setPolicies] = useState<Policy[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<Policy | null>(null);
    const [form, setForm] = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM, currency });
    const [saving, setSaving] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [filterType, setFilterType] = useState('all');

    const load = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        const { data } = await supabase
            .from('insurance_policies')
            .select('*')
            .eq('user_id', user.id)
            .order('renewal_date', { ascending: true });
        setPolicies(data || []);
        setLoading(false);
    }, [user]);

    useEffect(() => { load(); }, [load]);

    function openAdd() {
        setEditing(null);
        setForm({ ...EMPTY_FORM, currency });
        setShowForm(true);
    }

    function openEdit(p: Policy) {
        setEditing(p);
        setForm({
            name: p.name, insurer: p.insurer || '', type: p.type,
            premium_amount: p.premium_amount != null ? String(p.premium_amount) : '',
            premium_frequency: p.premium_frequency,
            renewal_date: p.renewal_date || '',
            coverage_amount: p.coverage_amount != null ? String(p.coverage_amount) : '',
            currency: p.currency, notes: p.notes || '', active: p.active,
        });
        setShowForm(true);
    }

    async function handleSave() {
        if (!user || !form.name.trim()) return;
        setSaving(true);
        const payload = {
            user_id: user.id,
            name: form.name.trim(),
            insurer: form.insurer.trim() || null,
            type: form.type,
            premium_amount: form.premium_amount ? Number(form.premium_amount) : null,
            premium_frequency: form.premium_frequency,
            renewal_date: form.renewal_date || null,
            coverage_amount: form.coverage_amount ? Number(form.coverage_amount) : null,
            currency: form.currency,
            notes: form.notes.trim() || null,
            active: form.active,
        };
        if (editing) {
            await supabase.from('insurance_policies').update(payload).eq('id', editing.id);
        } else {
            await supabase.from('insurance_policies').insert(payload);
        }
        setSaving(false);
        setShowForm(false);
        load();
    }

    async function handleDelete(id: string) {
        await supabase.from('insurance_policies').delete().eq('id', id);
        setDeleteId(null);
        load();
    }

    function fmt(n: number, cur: string) {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: cur, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
    }

    const filtered = filterType === 'all' ? policies : policies.filter(p => p.type === filterType);
    const active = policies.filter(p => p.active);
    const expiringSoon = active.filter(p => {
        if (!p.renewal_date) return false;
        const d = differenceInDays(parseISO(p.renewal_date), new Date());
        return d >= 0 && d <= 30;
    });

    const annualCost = active.reduce((sum, p) => {
        if (!p.premium_amount) return sum;
        const mult = { mensual: 12, trimestral: 4, semestral: 2, anual: 1 }[p.premium_frequency] ?? 1;
        return sum + p.premium_amount * mult;
    }, 0);

    return (
        <div className="seguros-page">
            {/* Summary cards */}
            <div className="seg-cards">
                <div className="seg-card">
                    <ShieldCheck size={20} className="seg-card-icon blue" />
                    <div>
                        <span className="seg-card-label">Pólizas activas</span>
                        <strong className="seg-card-val">{active.length}</strong>
                    </div>
                </div>
                <div className="seg-card">
                    <AlertTriangle size={20} className="seg-card-icon orange" />
                    <div>
                        <span className="seg-card-label">Vencen pronto (30d)</span>
                        <strong className="seg-card-val">{expiringSoon.length}</strong>
                    </div>
                </div>
                <div className="seg-card">
                    <Clock size={20} className="seg-card-icon green" />
                    <div>
                        <span className="seg-card-label">Costo anual estimado</span>
                        <strong className="seg-card-val">{fmt(annualCost, currency)}</strong>
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="seg-toolbar">
                <div className="seg-filters">
                    <button
                        type="button"
                        className={`seg-filter-btn ${filterType === 'all' ? 'active' : ''}`}
                        onClick={() => setFilterType('all')}
                    >Todas</button>
                    {POLICY_TYPES.map(t => (
                        <button
                            key={t.value}
                            type="button"
                            className={`seg-filter-btn ${filterType === t.value ? 'active' : ''}`}
                            onClick={() => setFilterType(t.value)}
                        >
                            <t.icon size={13} /> {t.label}
                        </button>
                    ))}
                </div>
                <button type="button" className="seg-add-btn" onClick={openAdd}>
                    <Plus size={16} /> Nueva póliza
                </button>
            </div>

            {/* List */}
            {loading ? (
                <div className="seg-empty">Cargando...</div>
            ) : filtered.length === 0 ? (
                <div className="seg-empty">
                    <ShieldCheck size={40} strokeWidth={1.2} />
                    <p>No tienes pólizas registradas</p>
                    <button type="button" className="seg-add-btn" onClick={openAdd}>
                        <Plus size={15} /> Agregar póliza
                    </button>
                </div>
            ) : (
                <div className="seg-list">
                    {filtered.map(p => {
                        const days = p.renewal_date ? differenceInDays(parseISO(p.renewal_date), new Date()) : null;
                        const badge = days !== null ? getDaysLabel(days) : null;
                        return (
                            <div key={p.id} className={`seg-item ${!p.active ? 'inactive' : ''}`}>
                                <div className={`seg-type-icon seg-type-${p.type}`}>
                                    <TypeIcon type={p.type} size={20} />
                                </div>
                                <div className="seg-item-info">
                                    <div className="seg-item-top">
                                        <span className="seg-item-name">{p.name}</span>
                                        {!p.active && <span className="seg-inactive-tag">Inactiva</span>}
                                        {badge && <span className={`seg-badge seg-badge-${badge.cls}`}>{badge.label}</span>}
                                    </div>
                                    <div className="seg-item-meta">
                                        {p.insurer && <span>{p.insurer}</span>}
                                        {p.premium_amount != null && (
                                            <span>{fmt(p.premium_amount, p.currency)} / {p.premium_frequency}</span>
                                        )}
                                        {p.renewal_date && (
                                            <span>Renueva: {format(parseISO(p.renewal_date), 'd MMM yyyy', { locale: es })}</span>
                                        )}
                                        {p.coverage_amount != null && (
                                            <span>Cobertura: {fmt(p.coverage_amount, p.currency)}</span>
                                        )}
                                    </div>
                                    {p.notes && <p className="seg-item-notes">{p.notes}</p>}
                                </div>
                                <div className="seg-item-actions">
                                    <button type="button" title="Editar" onClick={() => openEdit(p)}>
                                        <Pencil size={15} />
                                    </button>
                                    <button type="button" title="Eliminar" className="danger" onClick={() => setDeleteId(p.id)}>
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Form modal */}
            {showForm && (
                <div className="seg-overlay" onClick={() => setShowForm(false)}>
                    <div className="seg-modal" onClick={e => e.stopPropagation()}>
                        <div className="seg-modal-header">
                            <h2>{editing ? 'Editar póliza' : 'Nueva póliza'}</h2>
                            <button type="button" onClick={() => setShowForm(false)}><X size={20} /></button>
                        </div>
                        <div className="seg-modal-body">
                            <div className="seg-field">
                                <label>Nombre de la póliza *</label>
                                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: SOAT, Póliza Salud Familiar..." />
                            </div>
                            <div className="seg-field-row">
                                <div className="seg-field">
                                    <label>Tipo</label>
                                    <div className="seg-type-picker">
                                        {POLICY_TYPES.map(t => (
                                            <button
                                                key={t.value}
                                                type="button"
                                                className={`seg-type-opt ${form.type === t.value ? 'active' : ''}`}
                                                onClick={() => setForm(f => ({ ...f, type: t.value }))}
                                            >
                                                <t.icon size={15} /> {t.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="seg-field-row">
                                <div className="seg-field">
                                    <label>Aseguradora</label>
                                    <input type="text" value={form.insurer} onChange={e => setForm(f => ({ ...f, insurer: e.target.value }))} placeholder="Ej: SURA, Bolívar..." />
                                </div>
                                <div className="seg-field">
                                    <label>Moneda</label>
                                    <input type="text" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value.toUpperCase() }))} maxLength={3} />
                                </div>
                            </div>
                            <div className="seg-field-row">
                                <div className="seg-field">
                                    <label>Prima</label>
                                    <input type="number" min="0" value={form.premium_amount} onChange={e => setForm(f => ({ ...f, premium_amount: e.target.value }))} placeholder="0" />
                                </div>
                                <div className="seg-field">
                                    <label>Frecuencia</label>
                                    <div className="seg-select-wrap">
                                        <select value={form.premium_frequency} onChange={e => setForm(f => ({ ...f, premium_frequency: e.target.value }))}>
                                            {FREQUENCIES.map(fr => <option key={fr.value} value={fr.value}>{fr.label}</option>)}
                                        </select>
                                        <ChevronDown size={14} className="seg-chevron" />
                                    </div>
                                </div>
                            </div>
                            <div className="seg-field-row">
                                <div className="seg-field">
                                    <label>Suma asegurada</label>
                                    <input type="number" min="0" value={form.coverage_amount} onChange={e => setForm(f => ({ ...f, coverage_amount: e.target.value }))} placeholder="0" />
                                </div>
                                <div className="seg-field">
                                    <label>Fecha de renovación</label>
                                    <input type="date" value={form.renewal_date} onChange={e => setForm(f => ({ ...f, renewal_date: e.target.value }))} />
                                </div>
                            </div>
                            <div className="seg-field">
                                <label>Notas</label>
                                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Número de póliza, contacto, coberturas..." />
                            </div>
                            <label className="seg-active-toggle">
                                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                                Póliza activa
                            </label>
                        </div>
                        <div className="seg-modal-footer">
                            <button type="button" className="seg-btn-cancel" onClick={() => setShowForm(false)}>Cancelar</button>
                            <button type="button" className="seg-btn-save" onClick={handleSave} disabled={saving || !form.name.trim()}>
                                {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear póliza'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete confirm */}
            {deleteId && (
                <div className="seg-overlay" onClick={() => setDeleteId(null)}>
                    <div className="seg-confirm" onClick={e => e.stopPropagation()}>
                        <AlertTriangle size={28} className="seg-confirm-icon" />
                        <p>¿Eliminar esta póliza?</p>
                        <div className="seg-confirm-btns">
                            <button type="button" onClick={() => setDeleteId(null)}>Cancelar</button>
                            <button type="button" className="danger" onClick={() => handleDelete(deleteId)}>Eliminar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
