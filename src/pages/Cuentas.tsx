import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Plus, Edit2, Trash2, X, Search, AlertTriangle, Eye, EyeOff,
    Landmark, PiggyBank, CreditCard, Banknote, Bitcoin, TrendingUp,
    type LucideIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Account } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import './Cuentas.css';

interface AccountFormData {
    name: string;
    type: Account['type'];
    currency: string;
    balance: number;
    color: string;
    icon: string;
    institution: string;
    account_number: string;
}

const ACCOUNT_TYPES: { value: Account['type']; label: string }[] = [
    { value: 'checking', label: 'Cuenta Corriente' },
    { value: 'savings', label: 'Cuenta de Ahorro' },
    { value: 'cash', label: 'Efectivo' },
    { value: 'crypto', label: 'Criptomonedas' },
];

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
    ACCOUNT_TYPES.map(t => [t.value, t.label])
);

const COLORS = [
    '#EF4444', '#F97316', '#F59E0B', '#10B981', '#06B6D4',
    '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#64748B'
];

const ICON_MAP: Record<string, LucideIcon> = {
    Landmark, PiggyBank, CreditCard, Banknote, Bitcoin, TrendingUp,
};
const ICON_NAMES = Object.keys(ICON_MAP);

function AccountIcon({ name, size = 20 }: { name: string; size?: number }) {
    const Icon = ICON_MAP[name] || Landmark;
    return <Icon size={size} />;
}

const DEFAULT_FORM: AccountFormData = {
    name: '', type: 'checking', currency: 'COP', balance: 0,
    color: '#3B82F6', icon: 'Landmark', institution: '', account_number: '',
};

function formatMoney(amount: number, currency: string) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

export function Cuentas() {
    const { user, profile } = useAuth();
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<Account | null>(null);
    const [editingAccount, setEditingAccount] = useState<Account | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [showBalances, setShowBalances] = useState(true);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [formData, setFormData] = useState<AccountFormData>(DEFAULT_FORM);

    const currency = profile?.currency || 'COP';

    const showToast = useCallback((message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    const fetchAccounts = useCallback(async () => {
        if (!user) return;
        try {
            const { data, error } = await supabase
                .from('accounts')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: true });
            if (error) throw error;
            setAccounts(data || []);
        } catch (error) {
            // console.error('Error fetching accounts:', error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (user) fetchAccounts();
    }, [user, fetchAccounts]);

    const filtered = useMemo(() => {
        if (!searchTerm) return accounts;
        const term = searchTerm.toLowerCase();
        return accounts.filter(a => a.name.toLowerCase().includes(term) || (a.institution || '').toLowerCase().includes(term));
    }, [accounts, searchTerm]);

    const totalBalance = useMemo(() => accounts.reduce((sum, a) => sum + a.balance, 0), [accounts]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!user || saving) return;
        setSaving(true);
        try {
            if (editingAccount) {
                const { error } = await supabase.from('accounts').update({
                    name: formData.name, type: formData.type, currency: formData.currency,
                    balance: formData.balance, color: formData.color, icon: formData.icon,
                    institution: formData.institution || null, account_number: formData.account_number || null,
                }).eq('id', editingAccount.id);
                if (error) throw error;
                showToast('Cuenta actualizada', 'success');
            } else {
                const { error } = await supabase.from('accounts').insert([{
                    user_id: user.id, name: formData.name, type: formData.type,
                    currency: formData.currency, balance: formData.balance, color: formData.color,
                    icon: formData.icon, institution: formData.institution || null,
                    account_number: formData.account_number || null,
                }]);
                if (error) throw error;
                showToast('Cuenta creada', 'success');
            }
            setIsModalOpen(false);
            resetForm();
            fetchAccounts();
        } catch (error) {
            // console.error('Error saving account:', error);
            showToast('Error al guardar la cuenta', 'error');
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(account: Account) {
        try {
            const { error } = await supabase.from('accounts').delete().eq('id', account.id);
            if (error) throw error;
            setDeleteConfirm(null);
            showToast('Cuenta eliminada', 'success');
            fetchAccounts();
        } catch (error) {
            // console.error('Error deleting account:', error);
            showToast('Error al eliminar', 'error');
            setDeleteConfirm(null);
        }
    }

    function resetForm() {
        setEditingAccount(null);
        setFormData({ ...DEFAULT_FORM, currency });
    }

    function openEditModal(account: Account) {
        setEditingAccount(account);
        setFormData({
            name: account.name, type: account.type, currency: account.currency,
            balance: account.balance, color: account.color, icon: account.icon,
            institution: account.institution || '', account_number: account.account_number || '',
        });
        setIsModalOpen(true);
    }

    if (loading) return <div className="loading-screen">Cargando...</div>;

    return (
        <div className="cuentas-container">
            {toast && <div className={`cta-toast ${toast.type}`}>{toast.message}</div>}

            <div className="cuentas-header">
                <div>
                    <h1>Cuentas</h1>
                    <p>Control total de tus cuentas y movimientos</p>
                </div>
                <button type="button" className="toggle-balance-btn" onClick={() => setShowBalances(!showBalances)} title={showBalances ? 'Ocultar saldos' : 'Mostrar saldos'}>
                    {showBalances ? <Eye size={20} /> : <EyeOff size={20} />}
                </button>
            </div>

            {/* Summary */}
            <div className="cuentas-summary">
                <div className="summary-card total">
                    <span className="summary-label">Balance Total</span>
                    <span className="summary-amount">{showBalances ? formatMoney(totalBalance, currency) : '••••••'}</span>
                </div>
                <div className="summary-card count">
                    <span className="summary-label">Cuentas Activas</span>
                    <span className="summary-amount">{accounts.length}</span>
                </div>
            </div>

            {/* Search */}
            <div className="cuentas-search">
                <Search size={18} className="search-icon" />
                <input type="text" placeholder="Buscar cuentas..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="search-input" />
            </div>

            {/* Accounts List */}
            {filtered.length === 0 ? (
                <div className="cuentas-empty">
                    <Landmark size={48} />
                    <h3>{searchTerm ? 'No se encontraron cuentas' : 'No tienes cuentas registradas'}</h3>
                    <p>{searchTerm ? 'Intenta con otro término' : 'Agrega tu primera cuenta para comenzar'}</p>
                    {!searchTerm && (
                        <button type="button" className="empty-add-btn" onClick={() => { resetForm(); setIsModalOpen(true); }}>
                            <Plus size={20} /> Agregar Cuenta
                        </button>
                    )}
                </div>
            ) : (
                <div className="cuentas-grid">
                    {filtered.map(account => (
                        <div key={account.id} className="account-card">
                            <div className="account-card-header">
                                <div className="account-icon" style={{ backgroundColor: `${account.color}20`, color: account.color }}>
                                    <AccountIcon name={account.icon} />
                                </div>
                                <div className="account-card-actions">
                                    <button type="button" onClick={() => openEditModal(account)} className="acc-action-btn edit" title="Editar"><Edit2 size={15} /></button>
                                    <button type="button" onClick={() => setDeleteConfirm(account)} className="acc-action-btn delete" title="Eliminar"><Trash2 size={15} /></button>
                                </div>
                            </div>
                            <div className="account-card-body">
                                <span className="account-name">{account.name}</span>
                                <span className="account-type">{TYPE_LABELS[account.type] || account.type}</span>
                                {account.institution && <span className="account-institution">{account.institution}</span>}
                            </div>
                            <div className="account-card-footer">
                                <span className={`account-balance ${account.balance < 0 ? 'negative' : ''}`}>
                                    {showBalances ? formatMoney(account.balance, account.currency) : '••••••'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* FAB */}
            <button type="button" className="fab-add" onClick={() => { resetForm(); setIsModalOpen(true); }}>
                <Plus size={20} /> Agregar
            </button>

            {/* Modal Crear/Editar */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingAccount ? 'Editar Cuenta' : 'Nueva Cuenta'}</h2>
                            <button type="button" className="close-btn" title="Cerrar" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="modal-form">
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Nombre</label>
                                    <input type="text" className="form-input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required placeholder="Ej: Bancolombia Ahorro" />
                                </div>
                            </div>

                            <div className="form-row two-cols">
                                <div className="form-group">
                                    <label>Tipo</label>
                                    <select className="form-select" title="Tipo de cuenta" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value as Account['type'] })}>
                                        {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Moneda</label>
                                    <select className="form-select" title="Moneda" value={formData.currency} onChange={e => setFormData({ ...formData, currency: e.target.value })}>
                                        <option value="COP">COP</option>
                                        <option value="USD">USD</option>
                                        <option value="EUR">EUR</option>
                                    </select>
                                </div>
                            </div>

                            <div className="form-row two-cols">
                                <div className="form-group">
                                    <label>Saldo Actual</label>
                                    <input type="number" className="form-input" value={formData.balance} onChange={e => setFormData({ ...formData, balance: parseFloat(e.target.value) || 0 })} step="0.01" />
                                </div>
                                <div className="form-group">
                                    <label>Entidad</label>
                                    <input type="text" className="form-input" value={formData.institution} onChange={e => setFormData({ ...formData, institution: e.target.value })} placeholder="Ej: Bancolombia" />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Número de cuenta (opcional)</label>
                                <input type="text" className="form-input" value={formData.account_number} onChange={e => setFormData({ ...formData, account_number: e.target.value })} placeholder="Últimos 4 dígitos" />
                            </div>

                            <div className="form-group">
                                <label>Icono</label>
                                <div className="icon-grid">
                                    {ICON_NAMES.map(name => (
                                        <button key={name} type="button" title={name} className={`icon-swatch ${formData.icon === name ? 'selected' : ''}`} onClick={() => setFormData({ ...formData, icon: name })}>
                                            <AccountIcon name={name} size={16} />
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Color</label>
                                <div className="color-grid">
                                    {COLORS.map(color => (
                                        <button key={color} type="button" title={color} className={`color-swatch ${formData.color === color ? 'selected' : ''}`} style={{ backgroundColor: color }} onClick={() => setFormData({ ...formData, color })} />
                                    ))}
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                                <button type="submit" className="btn-submit" disabled={saving}>
                                    {saving ? 'Guardando...' : editingAccount ? 'Guardar' : 'Crear'}
                                </button>
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
                        <p>Se eliminará la cuenta y no se puede deshacer.</p>
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
