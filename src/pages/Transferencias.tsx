import { useState, useEffect, useCallback } from 'react';
import { ArrowLeftRight, Plus, Trash2, X, Check, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Account } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import './Transferencias.css';

interface Transfer {
    id: string;
    user_id: string;
    from_account_id: string;
    to_account_id: string;
    amount: number;
    currency: string;
    description: string | null;
    date: string;
    created_at: string;
    from_account?: { name: string; color: string };
    to_account?: { name: string; color: string };
}

function fmtMoney(n: number, currency: string) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

const EMPTY_FORM = {
    from_account_id: '',
    to_account_id: '',
    amount: '',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
};

export function Transferencias() {
    const { user, profile } = useAuth();
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [transfers, setTransfers] = useState<Transfer[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

    const currency = profile?.currency || 'COP';

    const showToast = (msg: string, ok: boolean) => {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchData = useCallback(async () => {
        if (!user) return;
        const [{ data: accts }, { data: txs }] = await Promise.all([
            supabase.from('accounts').select('*').eq('user_id', user.id).order('name'),
            supabase.from('account_transfers')
                .select('*, from_account:from_account_id(name,color), to_account:to_account_id(name,color)')
                .eq('user_id', user.id)
                .order('date', { ascending: false })
                .limit(50),
        ]);
        setAccounts((accts as Account[]) || []);
        setTransfers((txs as Transfer[]) || []);
        setLoading(false);
    }, [user]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || saving) return;
        if (form.from_account_id === form.to_account_id) {
            showToast('Las cuentas origen y destino deben ser diferentes', false);
            return;
        }
        const amt = parseFloat(form.amount);
        if (!amt || amt <= 0) { showToast('Monto inválido', false); return; }

        setSaving(true);
        const { error } = await supabase.from('account_transfers').insert({
            user_id: user.id,
            from_account_id: form.from_account_id,
            to_account_id: form.to_account_id,
            amount: amt,
            currency,
            description: form.description.trim() || null,
            date: form.date,
        });

        if (!error) {
            // Update account balances
            const fromAcc = accounts.find(a => a.id === form.from_account_id);
            const toAcc = accounts.find(a => a.id === form.to_account_id);
            if (fromAcc) await supabase.from('accounts').update({ balance: fromAcc.balance - amt }).eq('id', fromAcc.id);
            if (toAcc) await supabase.from('accounts').update({ balance: toAcc.balance + amt }).eq('id', toAcc.id);

            showToast('Transferencia registrada', true);
            setShowModal(false);
            setForm(EMPTY_FORM);
            fetchData();
        } else {
            showToast('Error al guardar', false);
        }
        setSaving(false);
    };

    const handleDelete = async (t: Transfer) => {
        // Reverse the balance changes
        const fromAcc = accounts.find(a => a.id === t.from_account_id);
        const toAcc = accounts.find(a => a.id === t.to_account_id);
        await supabase.from('account_transfers').delete().eq('id', t.id);
        if (fromAcc) await supabase.from('accounts').update({ balance: fromAcc.balance + t.amount }).eq('id', fromAcc.id);
        if (toAcc) await supabase.from('accounts').update({ balance: toAcc.balance - t.amount }).eq('id', toAcc.id);
        showToast('Transferencia eliminada', true);
        fetchData();
    };

    if (loading) return <div className="loading-container"><div className="loading-spinner" /></div>;

    return (
        <div className="trns-page animate-fadeIn">
            {toast && <div className={`trns-toast ${toast.ok ? 'ok' : 'err'}`}>{toast.msg}</div>}

            <div className="trns-header">
                <div>
                    <h1><ArrowLeftRight size={22} /> Transferencias</h1>
                    <p>Mueve dinero entre tus cuentas sin afectar reportes</p>
                </div>
                <div className="trns-header-actions">
                    <button type="button" className="btn btn-secondary" onClick={fetchData} title="Actualizar">
                        <RefreshCw size={15} />
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => { setForm(EMPTY_FORM); setShowModal(true); }}>
                        <Plus size={16} /> Nueva Transferencia
                    </button>
                </div>
            </div>

            {transfers.length === 0 ? (
                <div className="trns-empty">
                    <ArrowLeftRight size={48} strokeWidth={1} />
                    <h3>Sin transferencias</h3>
                    <p>Mueve dinero entre cuentas sin distorsionar tus reportes de ingresos y gastos</p>
                    <button type="button" className="btn btn-primary" onClick={() => setShowModal(true)}>
                        <Plus size={16} /> Crear transferencia
                    </button>
                </div>
            ) : (
                <div className="trns-list">
                    {transfers.map(t => (
                        <div key={t.id} className="trns-item">
                            <div className="trns-item-date">
                                {format(parseISO(t.date), 'd MMM', { locale: es })}
                            </div>
                            <div className="trns-item-accounts">
                                <span className="trns-acc" style={{ borderColor: (t.from_account as {name:string;color:string} | null)?.color || '#94a3b8' }}>
                                    {(t.from_account as {name:string;color:string} | null)?.name || 'Cuenta'}
                                </span>
                                <ArrowLeftRight size={14} className="trns-arrow" />
                                <span className="trns-acc" style={{ borderColor: (t.to_account as {name:string;color:string} | null)?.color || '#94a3b8' }}>
                                    {(t.to_account as {name:string;color:string} | null)?.name || 'Cuenta'}
                                </span>
                            </div>
                            {t.description && <span className="trns-item-desc">{t.description}</span>}
                            <span className="trns-item-amount">{fmtMoney(t.amount, t.currency)}</span>
                            <button type="button" className="trns-del-btn" title="Eliminar" onClick={() => handleDelete(t)}>
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="trns-modal" onClick={e => e.stopPropagation()}>
                        <div className="trns-modal-header">
                            <h2>Nueva Transferencia</h2>
                            <button type="button" title="Cerrar" onClick={() => setShowModal(false)}><X size={18} /></button>
                        </div>
                        <form className="trns-form" onSubmit={handleSave}>
                            <div className="trns-field">
                                <label>Cuenta origen *</label>
                                <select className="form-input" title="Cuenta origen" value={form.from_account_id}
                                    onChange={e => setForm(f => ({ ...f, from_account_id: e.target.value }))} required>
                                    <option value="">Seleccionar cuenta...</option>
                                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            </div>
                            <div className="trns-field">
                                <label>Cuenta destino *</label>
                                <select className="form-input" title="Cuenta destino" value={form.to_account_id}
                                    onChange={e => setForm(f => ({ ...f, to_account_id: e.target.value }))} required>
                                    <option value="">Seleccionar cuenta...</option>
                                    {accounts.filter(a => a.id !== form.from_account_id).map(a => (
                                        <option key={a.id} value={a.id}>{a.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="trns-field-row">
                                <div className="trns-field">
                                    <label>Monto ({currency}) *</label>
                                    <input type="number" className="form-input" placeholder="0" min="0.01" step="0.01"
                                        value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
                                </div>
                                <div className="trns-field">
                                    <label>Fecha</label>
                                    <input type="date" className="form-input" value={form.date}
                                        onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                                </div>
                            </div>
                            <div className="trns-field">
                                <label>Descripción (opcional)</label>
                                <input type="text" className="form-input" placeholder="Ej: Traslado ahorro mensual"
                                    value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                            </div>
                            <div className="trns-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    <Check size={16} /> {saving ? 'Guardando...' : 'Transferir'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
