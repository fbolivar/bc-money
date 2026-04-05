import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Menu, ShieldAlert, CreditCard, Wallet, X, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { differenceInDays, startOfMonth, endOfMonth, format } from 'date-fns';
import './TopBar.css';

const PAGE_TITLES: Record<string, string> = {
    '/': 'Dashboard',
    '/transacciones': 'Transacciones',
    '/presupuestos': 'Presupuestos',
    '/metas': 'Metas',
    '/reportes': 'Reportes',
    '/configuracion': 'Configuración',
    '/categorias': 'Categorías',
    '/cuentas': 'Cuentas',
    '/deudas': 'Deudas',
    '/garantias': 'Garantías',
    '/mascotas': 'Mascotas',
    '/compras': 'Lista de Compras',
    '/hogar': 'Mantenimiento del Hogar',
    '/suscripciones': 'Suscripciones',
    '/patrimonio': 'Patrimonio Neto',
    '/calendario': 'Calendario Financiero',
    '/plan-deudas': 'Planificador de Deudas',
    '/notas': 'Notas Financieras',
    '/importar': 'Importar Extractos',
    '/onboarding': 'Configuración Inicial',
};

interface Alert {
    id: string;
    type: 'warranty' | 'debt' | 'budget';
    title: string;
    message: string;
    urgent: boolean;
}

interface TopBarProps {
    onMenuClick: () => void;
}

export const TopBar = memo(function TopBar({ onMenuClick }: TopBarProps) {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, profile } = useAuth();
    const [searchQuery, setSearchQuery] = useState('');

    const handleSearch = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && searchQuery.trim()) {
            navigate(`/transacciones?q=${encodeURIComponent(searchQuery.trim())}`);
            setSearchQuery('');
        }
    };
    const pageTitle = PAGE_TITLES[location.pathname] || 'BC Money';
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const warrantyDays = profile?.alert_warranty_days ?? 30;
    const debtDays = profile?.alert_debt_days ?? 7;
    const budgetPct = profile?.alert_budget_pct ?? 80;
    const enabled = profile?.alerts_enabled ?? true;

    const fetchAlerts = useCallback(async () => {
        if (!user || !enabled) { setAlerts([]); return; }

        const result: Alert[] = [];

        // Warranties expiring
        const { data: warranties } = await supabase.from('warranties').select('id,product_name,warranty_end_date')
            .eq('user_id', user.id);
        if (warranties) {
            for (const w of warranties) {
                const days = differenceInDays(new Date(w.warranty_end_date), new Date());
                if (days >= 0 && days <= warrantyDays) {
                    result.push({
                        id: `w-${w.id}`, type: 'warranty', title: w.product_name,
                        message: days === 0 ? 'Garantía vence hoy' : `Garantía vence en ${days} día${days > 1 ? 's' : ''}`,
                        urgent: days <= 7,
                    });
                }
            }
        }

        // Debts upcoming payment
        const { data: debts } = await supabase.from('debts').select('id,name,payment_day,installment_amount,currency')
            .eq('user_id', user.id).eq('status', 'active');
        if (debts) {
            for (const d of debts) {
                if (!d.payment_day) continue;
                const now = new Date();
                let next = new Date(now.getFullYear(), now.getMonth(), d.payment_day);
                if (next <= now) next = new Date(now.getFullYear(), now.getMonth() + 1, d.payment_day);
                const days = differenceInDays(next, now);
                if (days <= debtDays) {
                    const amt = d.installment_amount ? ` — ${d.currency} ${Number(d.installment_amount).toLocaleString()}` : '';
                    result.push({
                        id: `d-${d.id}`, type: 'debt', title: d.name,
                        message: days === 0 ? `Pago hoy${amt}` : `Pago en ${days} día${days > 1 ? 's' : ''}${amt}`,
                        urgent: days <= 2,
                    });
                }
            }
        }

        // Budgets over threshold
        const monthStart = startOfMonth(new Date());
        const monthEnd = endOfMonth(new Date());
        const [budgetsRes, txRes, catRes] = await Promise.all([
            supabase.from('budgets').select('id,category_id,amount').eq('user_id', user.id),
            supabase.from('transactions').select('category_id,amount').eq('user_id', user.id).eq('type', 'expense')
                .gte('date', format(monthStart, 'yyyy-MM-dd')).lte('date', format(monthEnd, 'yyyy-MM-dd')),
            supabase.from('categories').select('id,name').or(`user_id.eq.${user.id},is_system.eq.true`),
        ]);
        if (budgetsRes.data && txRes.data && catRes.data) {
            for (const b of budgetsRes.data) {
                const spent = txRes.data.filter(t => t.category_id === b.category_id).reduce((s, t) => s + Number(t.amount), 0);
                const pct = Number(b.amount) > 0 ? (spent / Number(b.amount)) * 100 : 0;
                if (pct >= budgetPct) {
                    const cat = catRes.data.find(c => c.id === b.category_id);
                    result.push({
                        id: `b-${b.id}`, type: 'budget', title: cat?.name || 'Presupuesto',
                        message: pct >= 100 ? `Excedido: ${Math.round(pct)}% usado` : `${Math.round(pct)}% del presupuesto usado`,
                        urgent: pct >= 100,
                    });
                }
            }
        }

        setAlerts(result);
    }, [user, enabled, warrantyDays, debtDays, budgetPct]);

    useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
        }
        if (isOpen) document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [isOpen]);

    const typeIcons = { warranty: ShieldAlert, debt: CreditCard, budget: Wallet };

    return (
        <header className="topbar">
            <div className="topbar-left">
                <button className="menu-btn" type="button" title="Menú" onClick={onMenuClick}>
                    <Menu size={24} />
                </button>
                <h1 className="topbar-title">{pageTitle}</h1>
            </div>

            <div className="topbar-right">
                <div className="search-box">
                    <Search size={16} className="search-icon" />
                    <input type="text" className="search-input" placeholder="Buscar... (Enter)"
                        value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        onKeyDown={handleSearch} title="Buscar transacciones" />
                </div>
                <div className="alerts-wrapper" ref={dropdownRef}>
                    <button
                        className={`topbar-btn ${alerts.length > 0 ? 'has-alerts' : ''}`}
                        type="button"
                        title="Alertas"
                        onClick={() => setIsOpen(!isOpen)}
                    >
                        <Bell size={20} />
                        {alerts.length > 0 && <span className="notification-badge">{alerts.length}</span>}
                    </button>

                    {isOpen && (
                        <div className="alerts-dropdown">
                            <div className="alerts-dropdown-header">
                                <span>Alertas ({alerts.length})</span>
                                <button type="button" className="alerts-close" title="Cerrar" onClick={() => setIsOpen(false)}><X size={16} /></button>
                            </div>
                            <div className="alerts-dropdown-body">
                                {alerts.length === 0 ? (
                                    <div className="alerts-empty">Sin alertas pendientes</div>
                                ) : alerts.map(a => {
                                    const Icon = typeIcons[a.type];
                                    return (
                                        <div key={a.id} className={`alert-item ${a.urgent ? 'urgent' : ''} alert-${a.type}`}>
                                            <Icon size={16} className="alert-item-icon" />
                                            <div className="alert-item-content">
                                                <span className="alert-item-title">{a.title}</span>
                                                <span className="alert-item-msg">{a.message}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
});
