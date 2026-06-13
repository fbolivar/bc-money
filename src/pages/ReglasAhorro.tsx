import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, ToggleLeft, ToggleRight, Zap, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import type { Goal } from '../lib/supabase';
import './ReglasAhorro.css';

interface BudgetCategory {
    id: string;
    name: string;
    budget_id: string;
    budget_amount: number;
}

interface SurplusRule {
    id: string;
    categoryId: string;
    categoryName: string;
    budgetId: string;
    goalId: string;
    goalName: string;
    percentage: number;
    active: boolean;
}

const RULES_KEY = 'budget_surplus_rules_v1';

function loadRules(): SurplusRule[] {
    try { return JSON.parse(localStorage.getItem(RULES_KEY) || '[]'); } catch { return []; }
}
function saveRules(rules: SurplusRule[]) {
    localStorage.setItem(RULES_KEY, JSON.stringify(rules));
}

export function ReglasAhorro() {
    const { user, profile } = useAuth();
    const currency = profile?.currency || 'COP';
    const [rules, setRules] = useState<SurplusRule[]>(loadRules);
    const [goals, setGoals] = useState<Goal[]>([]);
    const [budgetCats, setBudgetCats] = useState<BudgetCategory[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [selCat, setSelCat] = useState('');
    const [selGoal, setSelGoal] = useState('');
    const [pct, setPct] = useState('50');
    const [runResult, setRunResult] = useState<{ applied: number; total: number } | null>(null);
    const [running, setRunning] = useState(false);

    const fmt = (n: number) =>
        new Intl.NumberFormat('es-CO', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

    const load = useCallback(async () => {
        if (!user) return;
        const [goalsRes, budgetsRes, catsRes] = await Promise.all([
            supabase.from('goals').select('*').eq('user_id', user.id).eq('status', 'active'),
            supabase.from('budgets').select('id,category_id,amount').eq('user_id', user.id),
            supabase.from('categories').select('id,name'),
        ]);
        setGoals(goalsRes.data || []);
        const cats = catsRes.data || [];
        const bcs: BudgetCategory[] = (budgetsRes.data || []).map(b => {
            const cat = cats.find(c => c.id === b.category_id);
            return { id: b.category_id, name: cat?.name || 'Desconocida', budget_id: b.id, budget_amount: Number(b.amount) };
        }).filter(b => b.budget_amount > 0);
        setBudgetCats(bcs);
    }, [user]);

    useEffect(() => { load(); }, [load]);

    function addRule() {
        const cat = budgetCats.find(c => c.id === selCat);
        const goal = goals.find(g => g.id === selGoal);
        if (!cat || !goal || !pct) return;
        const rule: SurplusRule = {
            id: Date.now().toString(),
            categoryId: cat.id,
            categoryName: cat.name,
            budgetId: cat.budget_id,
            goalId: goal.id,
            goalName: goal.name,
            percentage: Math.min(100, Math.max(1, Number(pct))),
            active: true,
        };
        const updated = [...rules, rule];
        setRules(updated);
        saveRules(updated);
        setShowForm(false);
        setSelCat(''); setSelGoal(''); setPct('50');
    }

    function deleteRule(id: string) {
        const updated = rules.filter(r => r.id !== id);
        setRules(updated);
        saveRules(updated);
    }

    function toggleRule(id: string) {
        const updated = rules.map(r => r.id === id ? { ...r, active: !r.active } : r);
        setRules(updated);
        saveRules(updated);
    }

    async function runRulesNow() {
        if (!user || rules.filter(r => r.active).length === 0) return;
        setRunning(true);
        setRunResult(null);

        const now = new Date();
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevStart = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-01`;
        const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        const prevEndStr = `${prevEnd.getFullYear()}-${String(prevEnd.getMonth() + 1).padStart(2, '0')}-${String(prevEnd.getDate()).padStart(2, '0')}`;

        const [txRes, budgetsRes] = await Promise.all([
            supabase.from('transactions').select('category_id,amount').eq('user_id', user.id).eq('type', 'expense').gte('date', prevStart).lte('date', prevEndStr),
            supabase.from('budgets').select('id,category_id,amount').eq('user_id', user.id),
        ]);

        const txs = txRes.data || [];
        const budgets = budgetsRes.data || [];
        let applied = 0;
        let total = 0;

        for (const rule of rules.filter(r => r.active)) {
            const budget = budgets.find(b => b.category_id === rule.categoryId);
            if (!budget) continue;
            const spent = txs.filter(t => t.category_id === rule.categoryId).reduce((s, t) => s + Number(t.amount), 0);
            const surplus = Number(budget.amount) - spent;
            if (surplus <= 0) continue;
            const contribution = Math.round(surplus * rule.percentage / 100);
            if (contribution <= 0) continue;

            const { data: goalData } = await supabase.from('goals').select('current_amount').eq('id', rule.goalId).single();
            if (!goalData) continue;
            await supabase.from('goals').update({ current_amount: Number(goalData.current_amount) + contribution }).eq('id', rule.goalId);
            applied++;
            total += contribution;
        }

        setRunResult({ applied, total });
        setRunning(false);
    }

    return (
        <div className="ra-page">
            <div className="ra-header">
                <div>
                    <h2 className="ra-title">Reglas de Ahorro Automático</h2>
                    <p className="ra-subtitle">Si gastas menos que tu presupuesto, el excedente va automáticamente a una meta.</p>
                </div>
                <div className="ra-header-actions">
                    <button type="button" className="ra-btn-run" onClick={runRulesNow} disabled={running || rules.filter(r => r.active).length === 0}>
                        <Zap size={15} />
                        {running ? 'Aplicando...' : 'Aplicar ahora'}
                    </button>
                    <button type="button" className="ra-btn-add" onClick={() => setShowForm(true)}>
                        <Plus size={16} /> Nueva regla
                    </button>
                </div>
            </div>

            {runResult && (
                <div className={`ra-result ${runResult.applied > 0 ? 'success' : 'info'}`}>
                    {runResult.applied > 0
                        ? `✓ Se transfirieron ${fmt(runResult.total)} a ${runResult.applied} meta${runResult.applied > 1 ? 's' : ''}.`
                        : 'Sin excedentes en el mes anterior para transferir.'}
                </div>
            )}

            <div className="ra-info">
                <Info size={14} />
                <span>Las reglas se aplican automáticamente el primer día de cada mes sobre el mes anterior. También puedes ejecutarlas manualmente.</span>
            </div>

            {showForm && (
                <div className="ra-form">
                    <h3>Nueva regla</h3>
                    <div className="ra-form-row">
                        <div className="ra-field">
                            <label>Si sobra en presupuesto de</label>
                            <select value={selCat} onChange={e => setSelCat(e.target.value)}>
                                <option value="">Selecciona categoría</option>
                                {budgetCats.map(c => <option key={c.id} value={c.id}>{c.name} ({fmt(c.budget_amount)})</option>)}
                            </select>
                        </div>
                        <div className="ra-field">
                            <label>Transferir a meta</label>
                            <select value={selGoal} onChange={e => setSelGoal(e.target.value)}>
                                <option value="">Selecciona meta</option>
                                {goals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                        </div>
                        <div className="ra-field ra-field-sm">
                            <label>% del excedente</label>
                            <input type="number" min="1" max="100" value={pct} onChange={e => setPct(e.target.value)} />
                        </div>
                    </div>
                    <div className="ra-form-actions">
                        <button type="button" className="ra-btn-cancel" onClick={() => setShowForm(false)}>Cancelar</button>
                        <button type="button" className="ra-btn-save" onClick={addRule} disabled={!selCat || !selGoal}>Guardar regla</button>
                    </div>
                </div>
            )}

            {rules.length === 0 ? (
                <div className="ra-empty">
                    <Zap size={32} className="ra-empty-icon" />
                    <p>No hay reglas configuradas.</p>
                    <p className="ra-empty-sub">Crea tu primera regla para que los excedentes de presupuesto vayan automáticamente a tus metas.</p>
                </div>
            ) : (
                <div className="ra-rules-list">
                    {rules.map(r => (
                        <div key={r.id} className={`ra-rule ${r.active ? 'active' : 'inactive'}`}>
                            <div className="ra-rule-body">
                                <div className="ra-rule-text">
                                    <span className="ra-rule-cat">{r.categoryName}</span>
                                    <span className="ra-rule-arrow">→</span>
                                    <span className="ra-rule-goal">{r.goalName}</span>
                                </div>
                                <span className="ra-rule-pct">{r.percentage}% del excedente</span>
                            </div>
                            <div className="ra-rule-actions">
                                <button type="button" className="ra-toggle" title={r.active ? 'Desactivar' : 'Activar'} onClick={() => toggleRule(r.id)}>
                                    {r.active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                                </button>
                                <button type="button" className="ra-delete" title="Eliminar" onClick={() => deleteRule(r.id)}>
                                    <Trash2 size={15} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
