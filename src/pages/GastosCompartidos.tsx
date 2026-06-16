import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Plus, Trash2, Edit2, X, CheckCircle, Users2,
    TrendingUp, TrendingDown, Minus, Receipt,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { SharedExpense } from '../lib/supabase';
import './GastosCompartidos.css';

interface SharedExpenseWithName extends SharedExpense {
    added_by_name: string;
}

interface MemberProfile {
    user_id: string;
    full_name: string | null;
    email: string | null;
}

const CURRENCIES = ['COP', 'USD', 'EUR', 'MXN', 'GBP'];

const emptyForm = () => ({
    description: '',
    amount: '',
    currency: 'COP',
    category: '',
    date: format(new Date(), 'yyyy-MM-dd'),
});

export function GastosCompartidos() {
    const { user, profile } = useAuth();
    const [expenses, setExpenses] = useState<SharedExpenseWithName[]>([]);
    const [members, setMembers] = useState<MemberProfile[]>([]);
    const [familyId, setFamilyId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState(emptyForm());
    const [filter, setFilter] = useState<'pending' | 'settled' | 'all'>('pending');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const loadData = useCallback(async () => {
        if (!user) return;

        const { data: memberRow } = await supabase
            .from('family_members')
            .select('family_id')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .single();

        if (!memberRow) { setLoading(false); return; }

        const fid = memberRow.family_id;
        setFamilyId(fid);

        const [membersRes, expensesRes] = await Promise.all([
            supabase
                .from('family_members')
                .select('user_id, profiles(full_name, email)')
                .eq('family_id', fid)
                .eq('status', 'active'),
            supabase
                .from('shared_expenses')
                .select('*')
                .eq('family_id', fid)
                .order('date', { ascending: false })
                .order('created_at', { ascending: false }),
        ]);

        const memberProfiles: MemberProfile[] = (membersRes.data || []).map((m: any) => ({
            user_id: m.user_id,
            full_name: m.profiles?.full_name || null,
            email: m.profiles?.email || null,
        }));
        setMembers(memberProfiles);

        const withNames: SharedExpenseWithName[] = (expensesRes.data || []).map(e => {
            const m = memberProfiles.find(x => x.user_id === e.added_by);
            const firstName = (m?.full_name || m?.email || 'Desconocido').split(' ')[0];
            return { ...e, added_by_name: firstName };
        });
        setExpenses(withNames);
        setLoading(false);
    }, [user]);

    useEffect(() => { loadData(); }, [loadData]);

    // Real-time sync: subscribe to shared_expenses changes for this family
    useEffect(() => {
        if (!familyId) return;
        let channel: ReturnType<typeof supabase.channel> | null = null;
        try {
            channel = supabase
                .channel(`shared-expenses-${familyId}`)
                .on('postgres_changes', {
                    event: '*', schema: 'public', table: 'shared_expenses',
                    filter: `family_id=eq.${familyId}`,
                }, () => loadData())
                .subscribe();
        } catch { /* WebSocket unavailable */ }
        return () => { if (channel) supabase.removeChannel(channel); };
    }, [familyId, loadData]);

    const partner = useMemo(() => members.find(m => m.user_id !== user?.id), [members, user?.id]);
    const partnerFirstName = partner?.full_name?.split(' ')[0] || 'Pareja';
    const myFirstName = profile?.full_name?.split(' ')[0] || 'Yo';

    // Balance per currency (only pending expenses)
    const balances = useMemo(() => {
        const pending = expenses.filter(e => !e.is_settled);
        const currencies = [...new Set(pending.map(e => e.currency))];
        return currencies.map(currency => {
            const mine = pending.filter(e => e.currency === currency && e.added_by === user?.id)
                .reduce((s, e) => s + Number(e.amount), 0);
            const theirs = pending.filter(e => e.currency === currency && e.added_by !== user?.id)
                .reduce((s, e) => s + Number(e.amount), 0);
            const net = (mine - theirs) / 2;
            return { currency, mine, theirs, net };
        });
    }, [expenses, user?.id]);

    async function handleSave() {
        if (!user || !familyId || !form.description.trim() || !form.amount || Number(form.amount) <= 0) {
            setError('Completa la descripción y el monto');
            return;
        }
        setSaving(true);
        setError('');
        const payload = {
            family_id: familyId,
            added_by: user.id,
            description: form.description.trim(),
            amount: parseFloat(form.amount),
            currency: form.currency,
            category: form.category.trim() || null,
            date: form.date,
        };
        if (editingId) {
            await supabase.from('shared_expenses').update(payload).eq('id', editingId);
        } else {
            await supabase.from('shared_expenses').insert(payload);
        }
        setSaving(false);
        setShowForm(false);
        setEditingId(null);
        setForm(emptyForm());
        loadData();
    }

    async function handleDelete(id: string) {
        if (!confirm('¿Eliminar este gasto compartido?')) return;
        await supabase.from('shared_expenses').delete().eq('id', id);
        loadData();
    }

    async function toggleSettled(e: SharedExpenseWithName) {
        await supabase.from('shared_expenses').update({ is_settled: !e.is_settled }).eq('id', e.id);
        loadData();
    }

    function startEdit(e: SharedExpenseWithName) {
        setEditingId(e.id);
        setForm({
            description: e.description,
            amount: e.amount.toString(),
            currency: e.currency,
            category: e.category || '',
            date: e.date,
        });
        setShowForm(true);
        setError('');
    }

    function openNew() {
        setEditingId(null);
        setForm(emptyForm());
        setError('');
        setShowForm(true);
    }

    const filtered = expenses.filter(e =>
        filter === 'all' ? true : filter === 'settled' ? e.is_settled : !e.is_settled
    );

    const pendingCount = expenses.filter(e => !e.is_settled).length;

    if (loading) return <div className="gc-loading"><div className="loading-spinner" /></div>;

    if (!familyId) return (
        <div className="gc-no-family">
            <Users2 size={48} />
            <h2>Sin familia configurada</h2>
            <p>Debes unirte o crear una familia en el módulo <strong>Familia</strong> primero.</p>
        </div>
    );

    return (
        <div className="gc-page">
            <div className="gc-header">
                <div className="gc-header-text">
                    <h1><Receipt size={22} /> Gastos Compartidos</h1>
                    <p className="gc-subtitle">{myFirstName} &amp; {partnerFirstName} · División 50/50</p>
                </div>
                <button className="btn btn-primary gc-add-btn" onClick={openNew}>
                    <Plus size={16} /> Agregar
                </button>
            </div>

            {/* Balance cards */}
            {balances.length > 0 ? (
                <div className="gc-balances">
                    {balances.map(b => (
                        <div key={b.currency} className={`gc-balance-card ${b.net > 0.5 ? 'positive' : b.net < -0.5 ? 'negative' : 'neutral'}`}>
                            <div className="gc-balance-icon">
                                {b.net > 0.5 ? <TrendingUp size={20} /> : b.net < -0.5 ? <TrendingDown size={20} /> : <Minus size={20} />}
                            </div>
                            <div className="gc-balance-info">
                                <span className="gc-balance-label">
                                    {b.net > 0.5
                                        ? `${partnerFirstName} te debe`
                                        : b.net < -0.5
                                        ? `Debes a ${partnerFirstName}`
                                        : 'Están al día'}
                                </span>
                                <span className="gc-balance-amount">
                                    {b.currency} {Math.abs(b.net).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                </span>
                            </div>
                            <div className="gc-balance-breakdown">
                                <span>{myFirstName}: {b.currency} {b.mine.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                                <span>{partnerFirstName}: {b.currency} {b.theirs.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="gc-balances">
                    <div className="gc-balance-card neutral">
                        <div className="gc-balance-icon"><Minus size={20} /></div>
                        <div className="gc-balance-info">
                            <span className="gc-balance-label">Sin gastos pendientes</span>
                            <span className="gc-balance-amount">—</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Filter tabs */}
            <div className="gc-tabs">
                <button className={`gc-tab ${filter === 'pending' ? 'active' : ''}`} onClick={() => setFilter('pending')}>
                    Pendientes {pendingCount > 0 && <span className="gc-tab-count">{pendingCount}</span>}
                </button>
                <button className={`gc-tab ${filter === 'settled' ? 'active' : ''}`} onClick={() => setFilter('settled')}>
                    Saldados
                </button>
                <button className={`gc-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                    Todos
                </button>
            </div>

            {/* List */}
            <div className="gc-list">
                {filtered.length === 0 ? (
                    <div className="gc-empty">
                        <Receipt size={36} />
                        <p>Sin gastos {filter === 'pending' ? 'pendientes' : filter === 'settled' ? 'saldados' : ''}</p>
                        {filter === 'pending' && <button className="btn btn-primary" onClick={openNew}><Plus size={14} /> Agregar el primero</button>}
                    </div>
                ) : filtered.map(e => (
                    <div key={e.id} className={`gc-item ${e.is_settled ? 'settled' : ''}`}>
                        <button
                            className={`gc-check ${e.is_settled ? 'checked' : ''}`}
                            title={e.is_settled ? 'Marcar como pendiente' : 'Marcar como saldado'}
                            onClick={() => toggleSettled(e)}
                        >
                            <CheckCircle size={18} />
                        </button>
                        <div className="gc-item-body">
                            <div className="gc-item-top">
                                <span className="gc-item-desc">{e.description}</span>
                                <div className="gc-item-amounts">
                                    <span className="gc-item-total">{e.currency} {Number(e.amount).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                                    <span className="gc-item-each">c/u {e.currency} {(Number(e.amount) / 2).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                                </div>
                            </div>
                            <div className="gc-item-bottom">
                                <span className="gc-item-meta">
                                    {format(new Date(e.date + 'T12:00:00'), "d MMM yyyy", { locale: es })}
                                    {' · '}
                                    <span className={`gc-item-who ${e.added_by === user?.id ? 'me' : 'them'}`}>
                                        {e.added_by === user?.id ? 'Tú' : e.added_by_name}
                                    </span>
                                    {e.category && <> · <span className="gc-item-cat">{e.category}</span></>}
                                </span>
                                <div className="gc-item-actions">
                                    <button className="gc-btn-icon" title="Editar" onClick={() => startEdit(e)}><Edit2 size={13} /></button>
                                    <button className="gc-btn-icon danger" title="Eliminar" onClick={() => handleDelete(e.id)}><Trash2 size={13} /></button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Form modal */}
            {showForm && (
                <div className="gc-overlay" onClick={() => setShowForm(false)}>
                    <div className="gc-modal" onClick={ev => ev.stopPropagation()}>
                        <div className="gc-modal-header">
                            <h3>{editingId ? 'Editar gasto' : 'Nuevo gasto compartido'}</h3>
                            <button type="button" className="gc-modal-close" onClick={() => setShowForm(false)}><X size={20} /></button>
                        </div>
                        <div className="gc-modal-body">
                            <div className="gc-field">
                                <label>Descripción</label>
                                <input
                                    className="gc-input"
                                    value={form.description}
                                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                    placeholder="Ej: Mercado del sábado, Restaurante..."
                                    autoFocus
                                />
                            </div>
                            <div className="gc-row">
                                <div className="gc-field gc-field-sm">
                                    <label>Moneda</label>
                                    <select className="gc-select" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="gc-field gc-field-grow">
                                    <label>Monto total</label>
                                    <input
                                        className="gc-input"
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={form.amount}
                                        onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                            <div className="gc-row">
                                <div className="gc-field gc-field-grow">
                                    <label>Categoría (opcional)</label>
                                    <input
                                        className="gc-input"
                                        value={form.category}
                                        onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                                        placeholder="Alimentación, Hogar, Salud..."
                                    />
                                </div>
                                <div className="gc-field gc-field-sm">
                                    <label>Fecha</label>
                                    <input
                                        className="gc-input"
                                        type="date"
                                        value={form.date}
                                        onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                                    />
                                </div>
                            </div>

                            {form.amount && Number(form.amount) > 0 && (
                                <div className="gc-split-preview">
                                    <Users2 size={14} />
                                    {myFirstName} paga <strong>{form.currency} {(Number(form.amount) / 2).toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong>
                                    {' · '}
                                    {partnerFirstName} paga <strong>{form.currency} {(Number(form.amount) / 2).toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong>
                                </div>
                            )}

                            {error && <p className="gc-error">{error}</p>}

                            <div className="gc-modal-footer">
                                <button className="btn btn-secondary" type="button" onClick={() => setShowForm(false)}>Cancelar</button>
                                <button className="btn btn-primary" type="button" onClick={handleSave} disabled={saving}>
                                    {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Guardar gasto'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
