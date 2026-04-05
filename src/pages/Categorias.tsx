import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Plus, Edit2, Trash2, X, TrendingUp, TrendingDown, Search, AlertTriangle,
    ShoppingCart, Home, Car, Utensils, Heart, Briefcase, GraduationCap, Plane,
    Gamepad2, Music, Shirt, Wifi, Smartphone, Gift, DollarSign, CreditCard,
    PiggyBank, Tag, Zap, Coffee, Book, Shield,
    type LucideIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Category } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import './Categorias.css';

interface CategoryFormData {
    name: string;
    type: 'income' | 'expense' | 'both';
    color: string;
    icon: string;
}

const DEFAULT_COLORS = [
    '#EF4444', '#F97316', '#F59E0B', '#10B981', '#06B6D4',
    '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#64748B'
];

const ICON_MAP: Record<string, LucideIcon> = {
    Tag, ShoppingCart, Home, Car, Utensils, Heart, Briefcase,
    GraduationCap, Plane, Gamepad2, Music, Shirt, Wifi,
    Smartphone, Gift, DollarSign, CreditCard, PiggyBank,
    Zap, Coffee, Book, Shield,
};

const ICON_NAMES = Object.keys(ICON_MAP);

function CategoryIcon({ name, size = 20 }: { name: string; size?: number }) {
    const Icon = ICON_MAP[name] || Tag;
    return <Icon size={size} />;
}

export function Categorias() {
    const { user } = useAuth();
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<Category | null>(null);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [formData, setFormData] = useState<CategoryFormData>({
        name: '', type: 'expense', color: '#3B82F6', icon: 'Tag'
    });

    const showToast = useCallback((message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    const fetchCategories = useCallback(async () => {
        if (!user) return;
        try {
            const { data, error } = await supabase
                .from('categories')
                .select('*')
                .or(`user_id.eq.${user.id},is_system.eq.true`)
                .order('sort_order', { ascending: true })
                .order('name');
            if (error) throw error;
            setCategories(data || []);
        } catch (error) {
            // console.error('Error fetching categories:', error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (user) fetchCategories();
    }, [user, fetchCategories]);

    const filteredCategories = useMemo(() => {
        if (!searchTerm) return categories;
        const term = searchTerm.toLowerCase();
        return categories.filter(c => c.name.toLowerCase().includes(term));
    }, [categories, searchTerm]);

    const incomeCategories = useMemo(
        () => filteredCategories.filter(c => c.type === 'income' || c.type === 'both'),
        [filteredCategories]
    );
    const expenseCategories = useMemo(
        () => filteredCategories.filter(c => c.type === 'expense' || c.type === 'both'),
        [filteredCategories]
    );

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!user || saving) return;
        setSaving(true);

        try {
            if (editingCategory) {
                const { error } = await supabase
                    .from('categories')
                    .update({
                        name: formData.name,
                        type: formData.type,
                        color: formData.color,
                        icon: formData.icon
                    })
                    .eq('id', editingCategory.id);

                if (error) throw error;
                showToast('Categoría actualizada', 'success');
            } else {
                const { error } = await supabase
                    .from('categories')
                    .insert([{
                        user_id: user.id,
                        name: formData.name,
                        type: formData.type,
                        color: formData.color,
                        icon: formData.icon,
                        is_system: false,
                        is_essential: false,
                        sort_order: 0
                    }]);
                if (error) throw error;
                showToast('Categoría creada', 'success');
            }

            setIsModalOpen(false);
            resetForm();
            fetchCategories();
        } catch (error) {
            // console.error('Error saving category:', error);
            showToast('Error al guardar la categoría', 'error');
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(category: Category) {
        try {
            const { error } = await supabase
                .from('categories')
                .delete()
                .eq('id', category.id);

            if (error) throw error;
            setDeleteConfirm(null);
            showToast('Categoría eliminada', 'success');
            fetchCategories();
        } catch (error) {
            // console.error('Error deleting category:', error);
            showToast('Error al eliminar', 'error');
            setDeleteConfirm(null);
        }
    }

    function resetForm() {
        setEditingCategory(null);
        setFormData({ name: '', type: 'expense', color: '#3B82F6', icon: 'Tag' });
    }

    function openEditModal(category: Category) {
        setEditingCategory(category);
        setFormData({
            name: category.name,
            type: category.type,
            color: category.color,
            icon: category.icon
        });
        setIsModalOpen(true);
    }

    if (loading) return <div className="loading-screen">Cargando...</div>;

    return (
        <div className="categories-container">
            {toast && <div className={`cat-toast ${toast.type}`}>{toast.message}</div>}

            <div className="categories-header">
                <div className="categories-title">
                    <h1>Categorías</h1>
                    <p>Gestiona las categorías de tus transacciones</p>
                </div>
            </div>

            <div className="categories-search">
                <Search size={18} className="search-icon" />
                <input
                    type="text"
                    placeholder="Buscar categorías..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="search-input"
                />
            </div>

            <div className="categories-grid">
                <div className="category-group">
                    <div className="category-group-header">
                        <TrendingUp className="text-emerald-500" />
                        <h2>Ingresos</h2>
                        <span className="category-count">{incomeCategories.length}</span>
                    </div>
                    <div className="categories-list">
                        {incomeCategories.length === 0 ? (
                            <div className="empty-state"><p>No hay categorías de ingresos</p></div>
                        ) : incomeCategories.map(category => (
                            <CategoryCard key={category.id} category={category} onEdit={openEditModal} onDelete={setDeleteConfirm} />
                        ))}
                    </div>
                </div>

                <div className="category-group">
                    <div className="category-group-header">
                        <TrendingDown className="text-red-500" />
                        <h2>Gastos</h2>
                        <span className="category-count">{expenseCategories.length}</span>
                    </div>
                    <div className="categories-list">
                        {expenseCategories.length === 0 ? (
                            <div className="empty-state"><p>No hay categorías de gastos</p></div>
                        ) : expenseCategories.map(category => (
                            <CategoryCard key={category.id} category={category} onEdit={openEditModal} onDelete={setDeleteConfirm} />
                        ))}
                    </div>
                </div>
            </div>

            {/* Modal Crear/Editar */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}</h2>
                            <button type="button" className="close-btn" title="Cerrar" onClick={() => setIsModalOpen(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="modal-form">
                            <div className="form-group">
                                <label>Nombre</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    required
                                    placeholder="Ej: Alimentación"
                                />
                            </div>

                            <div className="form-group">
                                <label>Tipo</label>
                                <select
                                    className="form-select"
                                    value={formData.type}
                                    title="Tipo de categoría"
                                    onChange={e => setFormData({ ...formData, type: e.target.value as CategoryFormData['type'] })}
                                >
                                    <option value="expense">Gasto</option>
                                    <option value="income">Ingreso</option>
                                    <option value="both">Ambos</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Icono</label>
                                <div className="icon-grid">
                                    {ICON_NAMES.map(name => (
                                        <button
                                            key={name}
                                            type="button"
                                            title={name}
                                            className={`icon-swatch ${formData.icon === name ? 'selected' : ''}`}
                                            onClick={() => setFormData({ ...formData, icon: name })}
                                        >
                                            <CategoryIcon name={name} size={16} />
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Color</label>
                                <div className="color-grid">
                                    {DEFAULT_COLORS.map(color => (
                                        <button
                                            key={color}
                                            type="button"
                                            title={color}
                                            className={`color-swatch ${formData.color === color ? 'selected' : ''}`}
                                            style={{ backgroundColor: color }}
                                            onClick={() => setFormData({ ...formData, color })}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setIsModalOpen(false)}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn-submit" disabled={saving}>
                                    {saving ? 'Guardando...' : editingCategory ? 'Guardar' : 'Crear'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* FAB */}
            <button type="button" className="fab-add" onClick={() => { resetForm(); setIsModalOpen(true); }}>
                <Plus size={20} />
                Crear
            </button>

            {/* Modal Eliminar */}
            {deleteConfirm && (
                <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
                    <div className="modal-content delete-modal" onClick={e => e.stopPropagation()}>
                        <AlertTriangle size={40} color="#F59E0B" />
                        <h2>¿Eliminar "{deleteConfirm.name}"?</h2>
                        <p>Esta acción no se puede deshacer.</p>
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

function CategoryCard({ category, onEdit, onDelete }: {
    category: Category;
    onEdit: (c: Category) => void;
    onDelete: (c: Category) => void;
}) {
    return (
        <div className="category-card">
            <div className="category-info">
                <div className="category-icon" style={{ backgroundColor: `${category.color}20`, color: category.color }}>
                    <CategoryIcon name={category.icon} />
                </div>
                <span className="category-name">{category.name}</span>
            </div>
            <div className="category-actions">
                <button type="button" onClick={() => onEdit(category)} className="category-action-btn edit" title="Editar">
                    <Edit2 size={16} />
                </button>
                <button type="button" onClick={() => onDelete(category)} className="category-action-btn delete" title="Eliminar">
                    <Trash2 size={16} />
                </button>
            </div>
        </div>
    );
}
