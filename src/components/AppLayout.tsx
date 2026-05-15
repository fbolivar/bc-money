import { Outlet, Navigate } from 'react-router-dom';
import { useState, useCallback, useEffect } from 'react';
import { WifiOff, Plus, RefreshCw, X, HelpCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { checkAndNotify, canNotify } from '../lib/notifications';
import { useOfflineStatus } from '../hooks/useOfflineStatus';
import { useRecurringTransactions } from '../hooks/useRecurringTransactions';
import { supabase } from '../lib/supabase';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { QuickAddModal } from './QuickAddModal';
import { MonthlySummary } from './MonthlySummary';
import { AppTour, shouldShowTour } from './AppTour';
import { format } from 'date-fns';
import { subMonths } from 'date-fns';

export function AppLayout() {
    const { user, loading, profile } = useAuth();
    const isOffline = useOfflineStatus();
    useKeyboardShortcuts();

    // Push notifications check on load
    useEffect(() => {
        if (!user || !profile || !canNotify()) return;
        checkAndNotify(user.id, {
            alerts_enabled: profile.alerts_enabled ?? true,
            alert_warranty_days: profile.alert_warranty_days ?? 30,
            alert_debt_days: profile.alert_debt_days ?? 7,
            alert_budget_pct: profile.alert_budget_pct ?? 80,
        });
    }, [user, profile]);

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [showQuickAdd, setShowQuickAdd] = useState(false);
    const [showMonthlySummary, setShowMonthlySummary] = useState(false);
    const [recurringDismissed, setRecurringDismissed] = useState(false);
    const [showTour, setShowTour] = useState(false);

    const { createdCount } = useRecurringTransactions(user?.id);

    // Show monthly summary once per month after the month changes
    useEffect(() => {
        if (!user) return;
        const prevMonth = format(subMonths(new Date(), 1), 'yyyy-MM');
        const key = `summary_seen_${user.id}_${prevMonth}`;
        if (!localStorage.getItem(key)) {
            const now = new Date();
            // Only show in the first 5 days of a new month
            if (now.getDate() <= 5) {
                localStorage.setItem(key, '1');
                setShowMonthlySummary(true);
            }
        }
    }, [user]);

    // Show tour once after onboarding is done
    useEffect(() => {
        if (!user) return;
        // Small delay so the dashboard renders first
        const t = setTimeout(() => {
            if (shouldShowTour()) setShowTour(true);
        }, 1200);
        return () => clearTimeout(t);
    }, [user]);

    // Auto-apply budget surplus rules on first login of new month
    useEffect(() => {
        if (!user) return;
        const monthKey = format(new Date(), 'yyyy-MM');
        const surplusKey = `surplus_rules_ran_${user.id}_${monthKey}`;
        if (localStorage.getItem(surplusKey)) return;
        localStorage.setItem(surplusKey, '1');

        const RULES_KEY = 'budget_surplus_rules_v1';
        let rules: { categoryId: string; goalId: string; percentage: number; active: boolean }[] = [];
        try { rules = JSON.parse(localStorage.getItem(RULES_KEY) || '[]'); } catch { return; }
        const activeRules = rules.filter(r => r.active);
        if (activeRules.length === 0) return;

        const prevMonth = subMonths(new Date(), 1);
        const prevStart = format(new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1), 'yyyy-MM-dd');
        const prevEnd = format(new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0), 'yyyy-MM-dd');

        (async () => {
            const [txRes, budgetsRes] = await Promise.all([
                supabase.from('transactions').select('category_id,amount').eq('user_id', user.id).eq('type', 'expense').gte('date', prevStart).lte('date', prevEnd),
                supabase.from('budgets').select('category_id,amount').eq('user_id', user.id),
            ]);
            for (const rule of activeRules) {
                const budget = (budgetsRes.data || []).find(b => b.category_id === rule.categoryId);
                if (!budget) continue;
                const spent = (txRes.data || []).filter(t => t.category_id === rule.categoryId).reduce((s, t) => s + Number(t.amount), 0);
                const surplus = Number(budget.amount) - spent;
                if (surplus <= 0) continue;
                const contribution = Math.round(surplus * rule.percentage / 100);
                if (contribution <= 0) continue;
                const { data: goalData } = await supabase.from('goals').select('current_amount').eq('id', rule.goalId).single();
                if (goalData) await supabase.from('goals').update({ current_amount: Number(goalData.current_amount) + contribution }).eq('id', rule.goalId);
            }
        })();
    }, [user]);

    const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);
    const openSidebar = useCallback(() => setIsSidebarOpen(true), []);

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="loading-spinner"></div>
                <p>Cargando...</p>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (profile && !profile.onboarding_completed) {
        return <Navigate to="/onboarding" replace />;
    }

    return (
        <div className="app-layout">
            <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />
            <main className="main-content">
                <TopBar onMenuClick={openSidebar} />
                {isOffline && (
                    <div className="offline-banner">
                        <WifiOff size={16} />
                        <span>Sin conexión — mostrando datos guardados localmente</span>
                    </div>
                )}
                {createdCount > 0 && !recurringDismissed && (
                    <div className="recurring-banner">
                        <RefreshCw size={15} />
                        <span>{createdCount} transacción{createdCount > 1 ? 'es recurrentes creadas' : ' recurrente creada'} automáticamente para este mes</span>
                        <button type="button" title="Cerrar" onClick={() => setRecurringDismissed(true)}><X size={14} /></button>
                    </div>
                )}
                <div className="page-content">
                    <Outlet />
                    <footer className="app-footer">
                        <p>Todos los derechos &copy; BC FactoryIA SAS 2026</p>
                    </footer>
                </div>
            </main>

            {/* Floating quick-add button */}
            <button
                type="button"
                className="fab-quick-add"
                title="Agregar transacción rápida"
                onClick={() => setShowQuickAdd(true)}
            >
                <Plus size={26} />
            </button>

            {/* Help / Tour trigger */}
            <button
                type="button"
                className="fab-tour-help"
                title="Ver tour de la aplicación"
                onClick={() => setShowTour(true)}
            >
                <HelpCircle size={20} />
            </button>

            {showQuickAdd && (
                <QuickAddModal
                    onClose={() => setShowQuickAdd(false)}
                    onSaved={() => setShowQuickAdd(false)}
                />
            )}

            {showMonthlySummary && (
                <MonthlySummary onClose={() => setShowMonthlySummary(false)} />
            )}

            {showTour && (
                <AppTour onDone={() => setShowTour(false)} />
            )}
        </div>
    );
}
