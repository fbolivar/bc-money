import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Users, ArrowLeftRight, Landmark, Wallet, Target, CircleDollarSign, Repeat,
    BarChart3, TrendingUp, TrendingDown, Lock,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Family, Transaction, Account, Budget, Goal, Debt, Subscription, Investment, Category } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { parseLocalDate } from '../lib/dates';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import './VistaFamiliar.css';

function fmt(n: number, c: string) { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: c, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n); }

export function VistaFamiliar() {
    const { user, profile } = useAuth();
    const [family, setFamily] = useState<Family | null>(null);
    const [ownerName, setOwnerName] = useState('');
    const [loading, setLoading] = useState(true);

    // Shared data from owner
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [goals, setGoals] = useState<Goal[]>([]);
    const [debts, setDebts] = useState<Debt[]>([]);
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [investments, setInvestments] = useState<Investment[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);

    const currency = profile?.currency || 'COP';

    const fetchData = useCallback(async () => {
        if (!user || !profile?.family_id) { setLoading(false); return; }

        // Get family info
        const { data: fam } = await supabase.from('families').select('*').eq('id', profile.family_id).single();
        if (!fam) { setLoading(false); return; }
        setFamily(fam);

        const ownerId = fam.owner_id;
        const isOwner = ownerId === user.id;

        // Get owner's name
        const { data: ownerProfile } = await supabase.from('profiles').select('full_name').eq('id', ownerId).single();
        setOwnerName(ownerProfile?.full_name || 'Propietario');

        if (isOwner) { setLoading(false); return; } // Owner doesn't need this view

        const shared = fam.shared_modules || [];

        // Fetch shared data in parallel
        const promises: Promise<void>[] = [];

        if (shared.includes('transactions')) {
            promises.push(supabase.from('transactions').select('*').eq('user_id', ownerId).order('date', { ascending: false }).limit(50).then(r => { setTransactions(r.data || []); }));
        }
        if (shared.includes('accounts')) {
            promises.push(supabase.from('accounts').select('*').eq('user_id', ownerId).then(r => { setAccounts(r.data || []); }));
        }
        if (shared.includes('budgets')) {
            promises.push(supabase.from('budgets').select('*').eq('user_id', ownerId).then(r => { setBudgets(r.data || []); }));
            promises.push(supabase.from('categories').select('*').or(`user_id.eq.${ownerId},is_system.eq.true`).then(r => { setCategories(r.data || []); }));
        }
        if (shared.includes('goals')) {
            promises.push(supabase.from('goals').select('*').eq('user_id', ownerId).eq('status', 'active').then(r => { setGoals(r.data || []); }));
        }
        if (shared.includes('debts')) {
            promises.push(supabase.from('debts').select('*').eq('user_id', ownerId).eq('status', 'active').then(r => { setDebts(r.data || []); }));
        }
        if (shared.includes('subscriptions')) {
            promises.push(supabase.from('subscriptions').select('*').eq('user_id', ownerId).eq('status', 'active').then(r => { setSubscriptions(r.data || []); }));
        }
        if (shared.includes('investments')) {
            promises.push(supabase.from('investments').select('*').eq('user_id', ownerId).then(r => { setInvestments(r.data || []); }));
        }

        await Promise.all(promises);
        setLoading(false);
    }, [user, profile]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const shared = family?.shared_modules || [];
    const isOwner = family && family.owner_id === user?.id;

    // Computed values
    const totalBalance = accounts.reduce((s, a) => s + Number(a.balance), 0);
    const totalDebt = debts.reduce((s, d) => s + Number(d.remaining_amount), 0);
    const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const expenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    const monthlySubs = subscriptions.reduce((s, sub) => {
        const m = sub.billing_cycle === 'yearly' ? 1/12 : sub.billing_cycle === 'quarterly' ? 1/3 : sub.billing_cycle === 'weekly' ? 4.33 : 1;
        return s + Number(sub.amount) * m;
    }, 0);
    const investmentValue = investments.reduce((s, i) => s + i.quantity * (i.current_price || i.purchase_price), 0);

    if (loading) return <div className="loading-container"><div className="loading-spinner"></div></div>;

    if (!family) {
        return (
            <div className="vf-page"><div className="vf-empty"><Users size={48} /><h3>No perteneces a una familia</h3><p>Únete a una familia en el módulo Familia</p></div></div>
        );
    }

    if (isOwner) {
        return (
            <div className="vf-page"><div className="vf-empty"><Users size={48} /><h3>Eres el propietario de "{family.name}"</h3><p>Esta vista es para los miembros de tu familia. Ellos verán aquí los módulos que compartiste.</p></div></div>
        );
    }

    return (
        <div className="vf-page animate-fadeIn">
            <div className="vf-header">
                <div><h1>Vista Familiar</h1><p>Datos compartidos por <strong>{ownerName}</strong> en "{family.name}"</p></div>
            </div>

            {shared.length === 0 && (
                <div className="vf-empty"><Lock size={48} /><h3>Sin módulos compartidos</h3><p>El propietario no ha compartido módulos contigo aún</p></div>
            )}

            {/* Accounts */}
            {shared.includes('accounts') && accounts.length > 0 && (
                <div className="vf-section">
                    <div className="vf-section-header"><Landmark size={18} /><h3>Cuentas</h3><span className="vf-badge">{fmt(totalBalance, currency)}</span></div>
                    <div className="vf-cards">
                        {accounts.map(a => (
                            <div key={a.id} className="vf-card"><span className="vf-card-name">{a.name}</span><span className="vf-card-value">{fmt(Number(a.balance), a.currency)}</span></div>
                        ))}
                    </div>
                </div>
            )}

            {/* Transactions summary */}
            {shared.includes('transactions') && transactions.length > 0 && (
                <div className="vf-section">
                    <div className="vf-section-header"><ArrowLeftRight size={18} /><h3>Transacciones Recientes</h3></div>
                    <div className="vf-metrics">
                        <div className="vf-metric green"><TrendingUp size={16} /><div><span className="vf-m-value">{fmt(income, currency)}</span><span className="vf-m-label">Ingresos</span></div></div>
                        <div className="vf-metric red"><TrendingDown size={16} /><div><span className="vf-m-value">{fmt(expenses, currency)}</span><span className="vf-m-label">Gastos</span></div></div>
                    </div>
                    <div className="vf-list">
                        {transactions.slice(0, 10).map(tx => (
                            <div key={tx.id} className="vf-list-item">
                                <span className="vf-li-date">{format(parseLocalDate(tx.date), 'd MMM', { locale: es })}</span>
                                <span className="vf-li-desc">{tx.description || 'Transacción'}</span>
                                <span className={`vf-li-amount ${tx.type}`}>{tx.type === 'income' ? '+' : '-'}{fmt(Number(tx.amount), currency)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Budgets */}
            {shared.includes('budgets') && budgets.length > 0 && (
                <div className="vf-section">
                    <div className="vf-section-header"><Wallet size={18} /><h3>Presupuestos</h3></div>
                    <div className="vf-cards">
                        {budgets.map(b => {
                            const cat = categories.find(c => c.id === b.category_id);
                            const spent = transactions.filter(t => t.type === 'expense' && t.category_id === b.category_id).reduce((s, t) => s + Number(t.amount), 0);
                            const pct = Number(b.amount) > 0 ? (spent / Number(b.amount)) * 100 : 0;
                            return (
                                <div key={b.id} className="vf-card">
                                    <span className="vf-card-name">{cat?.name || 'General'}</span>
                                    <span className="vf-card-sub">{fmt(spent, currency)} / {fmt(Number(b.amount), currency)}</span>
                                    <div className="vf-progress"><div className={`vf-progress-bar ${pct > 100 ? 'danger' : pct > 80 ? 'warning' : 'ok'}`} style={{ width: `${Math.min(pct, 100)}%` }}></div></div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Goals */}
            {shared.includes('goals') && goals.length > 0 && (
                <div className="vf-section">
                    <div className="vf-section-header"><Target size={18} /><h3>Metas de Ahorro</h3></div>
                    <div className="vf-cards">
                        {goals.map(g => {
                            const pct = Number(g.target_amount) > 0 ? (Number(g.current_amount) / Number(g.target_amount)) * 100 : 0;
                            return (
                                <div key={g.id} className="vf-card">
                                    <span className="vf-card-name">{g.name}</span>
                                    <span className="vf-card-sub">{fmt(Number(g.current_amount), currency)} / {fmt(Number(g.target_amount), currency)}</span>
                                    <div className="vf-progress"><div className="vf-progress-bar ok" style={{ width: `${Math.min(pct, 100)}%` }}></div></div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Debts */}
            {shared.includes('debts') && debts.length > 0 && (
                <div className="vf-section">
                    <div className="vf-section-header"><CircleDollarSign size={18} /><h3>Deudas</h3><span className="vf-badge danger">{fmt(totalDebt, currency)}</span></div>
                    <div className="vf-cards">
                        {debts.map(d => (
                            <div key={d.id} className="vf-card">
                                <span className="vf-card-name">{d.name}{!d.is_current && <span className="vf-mora">EN MORA</span>}</span>
                                <span className="vf-card-value negative">{fmt(Number(d.remaining_amount), d.currency)}</span>
                                {d.total_installments && <span className="vf-card-sub">Cuota {d.paid_installments}/{d.total_installments}</span>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Subscriptions */}
            {shared.includes('subscriptions') && subscriptions.length > 0 && (
                <div className="vf-section">
                    <div className="vf-section-header"><Repeat size={18} /><h3>Suscripciones</h3><span className="vf-badge">{fmt(monthlySubs, currency)}/mes</span></div>
                    <div className="vf-list">
                        {subscriptions.map(s => (
                            <div key={s.id} className="vf-list-item">
                                <span className="vf-li-desc">{s.name}</span>
                                <span className="vf-li-amount expense">{fmt(Number(s.amount), s.currency)}/{s.billing_cycle === 'monthly' ? 'mes' : s.billing_cycle === 'yearly' ? 'año' : s.billing_cycle}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Investments */}
            {shared.includes('investments') && investments.length > 0 && (
                <div className="vf-section">
                    <div className="vf-section-header"><BarChart3 size={18} /><h3>Inversiones</h3><span className="vf-badge">{fmt(investmentValue, currency)}</span></div>
                    <div className="vf-cards">
                        {investments.map(i => {
                            const val = i.quantity * (i.current_price || i.purchase_price);
                            const cost = i.quantity * i.purchase_price;
                            const gain = val - cost;
                            return (
                                <div key={i.id} className="vf-card">
                                    <span className="vf-card-name">{i.symbol || i.name}</span>
                                    <span className="vf-card-value">{fmt(val, i.currency)}</span>
                                    <span className={`vf-card-sub ${gain >= 0 ? 'positive' : 'negative'}`}>{gain >= 0 ? '+' : ''}{fmt(gain, i.currency)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
