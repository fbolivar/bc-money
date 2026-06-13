import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, X, Wand2, AlertTriangle, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Category } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import type { CategorizationRule } from '../lib/categorizationRules';
import './ReglasCategorizacion.css';

interface RuleRow extends CategorizationRule {
    created_at?: string;
}

interface RuleFormData {
    keyword: string;
    field: 'description' | 'merchant';
    match_type: 'contains' | 'starts_with' | 'exact';
    category_id: string;
    priority: number;
}

const DEFAULT_FORM: RuleFormData = {
    keyword: '',
    field: 'description',
    match_type: 'contains',
    category_id: '',
    priority: 0,
};

const MATCH_LABELS: Record<string, string> = {
    contains: 'Contiene',
    starts_with: 'Empieza con',
    exact: 'Exacto',
};

const FIELD_LABELS: Record<string, string> = {
    description: 'Descripción',
    merchant: 'Comercio',
};

export function ReglasCategorizacion() {
    const { user } = useAuth();
    const [rules, setRules] = useState<RuleRow[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [applying, setApplying] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<RuleRow | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<RuleRow | null>(null);
    const [formData, setFormData] = useState<RuleFormData>(DEFAULT_FORM);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [applyResult, setApplyResult] = useState<number | null>(null);

    const showToast = useCallback((message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    }, []);

    const fetchData = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const [rulesRes, catsRes] = await Promise.all([
                supabase
                    .from('categorization_rules')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('priority', { ascending: false })
                    .order('created_at', { ascending: true }),
                supabase
                    .from('categories')
                    .select('*')
                    .order('name'),
            ]);
            if (rulesRes.error) throw rulesRes.error;
            if (catsRes.error) throw catsRes.error;
            setRules(rulesRes.data || []);
            setCategories(catsRes.data || []);
        } catch {
            showToast('Error al cargar datos', 'error');
        } finally {
            setLoading(false);
        }
    }, [user, showToast]);

    useEffect(() => {
        if (user) fetchData();
    }, [user, fetchData]);

    const openCreate = () => {
        setEditingRule(null);
        setFormData(DEFAULT_FORM);
        setIsModalOpen(true);
    };

    const openEdit = (rule: RuleRow) => {
        setEditingRule(rule);
        setFormData({
            keyword: rule.keyword,
            field: rule.field,
            match_type: rule.match_type,
            category_id: rule.category_id,
            priority: rule.priority,
        });
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingRule(null);
        setFormData(DEFAULT_FORM);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !formData.keyword.trim() || !formData.category_id) return;
        setSaving(true);
        try {
            const payload = {
                user_id: user.id,
                keyword: formData.keyword.trim(),
                field: formData.field,
                match_type: formData.match_type,
                category_id: formData.category_id,
                priority: formData.priority,
            };
            if (editingRule) {
                const { error } = await supabase
                    .from('categorization_rules')
                    .update(payload)
                    .eq('id', editingRule.id);
                if (error) throw error;
                showToast('Regla actualizada', 'success');
            } else {
                const { error } = await supabase
                    .from('categorization_rules')
                    .insert(payload);
                if (error) throw error;
                showToast('Regla creada', 'success');
            }
            closeModal();
            fetchData();
        } catch {
            showToast('Error al guardar la regla', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (rule: RuleRow) => {
        try {
            const { error } = await supabase
                .from('categorization_rules')
                .delete()
                .eq('id', rule.id);
            if (error) throw error;
            showToast('Regla eliminada', 'success');
            setDeleteConfirm(null);
            fetchData();
        } catch {
            showToast('Error al eliminar la regla', 'error');
        }
    };

    const handleApplyToExisting = async () => {
        if (!user || rules.length === 0) return;
        setApplying(true);
        setApplyResult(null);
        try {
            // Fetch uncategorized transactions
            const { data: txs, error: txErr } = await supabase
                .from('transactions')
                .select('id, description, category_id')
                .eq('user_id', user.id)
                .is('category_id', null);
            if (txErr) throw txErr;
            if (!txs || txs.length === 0) {
                showToast('No hay transacciones sin categoría', 'success');
                setApplying(false);
                return;
            }

            // Sort rules by priority descending
            const sorted = [...rules].sort((a, b) => b.priority - a.priority);

            let updated = 0;
            for (const tx of txs) {
                let matched: string | null = null;
                for (const rule of sorted) {
                    const haystack = (rule.field === 'merchant'
                        ? (tx as Record<string, string>)['merchant']
                        : tx.description) ?? '';
                    const needle = rule.keyword.toLowerCase();
                    const hay = haystack.toLowerCase();
                    const isMatch =
                        rule.match_type === 'contains'
                            ? hay.includes(needle)
                            : rule.match_type === 'starts_with'
                              ? hay.startsWith(needle)
                              : hay === needle;
                    if (isMatch) { matched = rule.category_id; break; }
                }
                if (matched) {
                    const { error } = await supabase
                        .from('transactions')
                        .update({ category_id: matched })
                        .eq('id', tx.id);
                    if (!error) updated++;
                }
            }
            setApplyResult(updated);
            showToast(`${updated} transacciones actualizadas`, 'success');
        } catch {
            showToast('Error al aplicar reglas', 'error');
        } finally {
            setApplying(false);
        }
    };

    const getCategoryName = (id: string) =>
        categories.find(c => c.id === id)?.name ?? '—';

    const getCategoryColor = (id: string) =>
        categories.find(c => c.id === id)?.color ?? '#64748b';

    return (
        <div className="reglas-page animate-fadeIn">
            {toast && (
                <div className={`reglas-toast ${toast.type}`}>{toast.message}</div>
            )}

            {/* Header */}
            <div className="reglas-header">
                <div className="reglas-header-info">
                    <div className="reglas-header-icon">
                        <Wand2 size={28} />
                    </div>
                    <div>
                        <h1>Reglas de Categorización</h1>
                        <p>Asigna categorías automáticamente al importar extractos bancarios</p>
                    </div>
                </div>
                <button type="button" className="btn btn-primary" onClick={openCreate}>
                    <Plus size={16} /> Nueva regla
                </button>
            </div>

            {/* Tip */}
            <div className="reglas-tip">
                <Info size={16} />
                <span>
                    Las reglas se aplican al importar extractos y puedes aplicarlas a transacciones existentes.
                    Las reglas con mayor prioridad se evalúan primero.
                </span>
            </div>

            {/* Apply button */}
            <div className="reglas-apply-bar">
                <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleApplyToExisting}
                    disabled={applying || rules.length === 0}
                >
                    <Wand2 size={16} />
                    {applying ? 'Aplicando...' : 'Aplicar a transacciones existentes sin categoría'}
                </button>
                {applyResult !== null && (
                    <span className="reglas-apply-result">
                        {applyResult} transacciones actualizadas
                    </span>
                )}
            </div>

            {/* Table */}
            {loading ? (
                <div className="reglas-loading">Cargando reglas...</div>
            ) : rules.length === 0 ? (
                <div className="reglas-empty">
                    <Wand2 size={48} />
                    <h3>Sin reglas configuradas</h3>
                    <p>Crea tu primera regla para categorizar transacciones automáticamente.</p>
                    <button type="button" className="btn btn-primary" onClick={openCreate}>
                        <Plus size={16} /> Crear primera regla
                    </button>
                </div>
            ) : (
                <div className="reglas-table-wrap">
                    <table className="table reglas-table">
                        <thead>
                            <tr>
                                <th>Palabra clave</th>
                                <th>Campo</th>
                                <th>Tipo match</th>
                                <th>Categoría</th>
                                <th className="text-center">Prioridad</th>
                                <th className="text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rules.map(rule => (
                                <tr key={rule.id}>
                                    <td>
                                        <code className="reglas-keyword">{rule.keyword}</code>
                                    </td>
                                    <td>
                                        <span className="reglas-badge field">
                                            {FIELD_LABELS[rule.field]}
                                        </span>
                                    </td>
                                    <td>
                                        <span className="reglas-badge match">
                                            {MATCH_LABELS[rule.match_type]}
                                        </span>
                                    </td>
                                    <td>
                                        <span
                                            className="reglas-cat-pill"
                                            style={{ borderColor: getCategoryColor(rule.category_id) }}
                                        >
                                            <span
                                                className="reglas-cat-dot"
                                                style={{ background: getCategoryColor(rule.category_id) }}
                                            />
                                            {getCategoryName(rule.category_id)}
                                        </span>
                                    </td>
                                    <td className="text-center">
                                        <span className="reglas-priority">{rule.priority}</span>
                                    </td>
                                    <td className="text-center">
                                        <div className="reglas-actions">
                                            <button
                                                type="button"
                                                className="reglas-action-btn edit"
                                                title="Editar"
                                                onClick={() => openEdit(rule)}
                                            >
                                                <Edit2 size={15} />
                                            </button>
                                            <button
                                                type="button"
                                                className="reglas-action-btn delete"
                                                title="Eliminar"
                                                onClick={() => setDeleteConfirm(rule)}
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Create/Edit Modal */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal-content reglas-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingRule ? 'Editar regla' : 'Nueva regla'}</h2>
                            <button type="button" className="close-btn" onClick={closeModal}>
                                <X size={18} />
                            </button>
                        </div>
                        <form className="modal-form" onSubmit={handleSave}>
                            <div className="form-group">
                                <label>Palabra clave *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="ej: rappi, uber, spotify..."
                                    value={formData.keyword}
                                    onChange={e => setFormData(p => ({ ...p, keyword: e.target.value }))}
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="form-group">
                                <label>Campo a revisar</label>
                                <select
                                    className="form-select"
                                    value={formData.field}
                                    onChange={e => setFormData(p => ({ ...p, field: e.target.value as 'description' | 'merchant' }))}
                                >
                                    <option value="description">Descripción</option>
                                    <option value="merchant">Comercio</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Tipo de coincidencia</label>
                                <select
                                    className="form-select"
                                    value={formData.match_type}
                                    onChange={e => setFormData(p => ({ ...p, match_type: e.target.value as 'contains' | 'starts_with' | 'exact' }))}
                                >
                                    <option value="contains">Contiene</option>
                                    <option value="starts_with">Empieza con</option>
                                    <option value="exact">Exacto</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Categoría destino *</label>
                                <select
                                    className="form-select"
                                    value={formData.category_id}
                                    onChange={e => setFormData(p => ({ ...p, category_id: e.target.value }))}
                                    required
                                >
                                    <option value="">-- Seleccionar categoría --</option>
                                    {categories.map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Prioridad (0-100, mayor = primero)</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    min={0}
                                    max={100}
                                    value={formData.priority}
                                    onChange={e => setFormData(p => ({ ...p, priority: Number(e.target.value) }))}
                                />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={closeModal}>
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="btn-submit"
                                    disabled={saving || !formData.keyword.trim() || !formData.category_id}
                                >
                                    {saving ? 'Guardando...' : editingRule ? 'Actualizar' : 'Crear regla'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirm Modal */}
            {deleteConfirm && (
                <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="delete-modal">
                            <AlertTriangle size={40} color="#EF4444" />
                            <h2>Eliminar regla</h2>
                            <p>
                                ¿Eliminar la regla para <strong>"{deleteConfirm.keyword}"</strong>?
                            </p>
                            <p>Esta acción no se puede deshacer.</p>
                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="btn-cancel"
                                    onClick={() => setDeleteConfirm(null)}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    className="btn-delete"
                                    onClick={() => handleDelete(deleteConfirm)}
                                >
                                    <Trash2 size={16} /> Eliminar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
