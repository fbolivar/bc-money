import { useState, useEffect, useCallback } from 'react';
import {
    Plus,
    Edit2,
    Trash2,
    X,
    Tag,
    TrendingUp,
    TrendingDown,
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

export function Categorias() {
    const { user } = useAuth();
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [formData, setFormData] = useState<CategoryFormData>({
        name: '',
        type: 'expense',
        color: '#3B82F6',
        icon: 'Tag'
    });

    const fetchCategories = useCallback(async () => {
        if (!user) return;
        try {
            const { data, error } = await supabase
                .from('categories')
                .select('*')
                .or(`user_id.eq.${user.id},is_system.eq.true`)
                .order('name');

            if (error) throw error;
            setCategories(data || []);
        } catch (error) {
            console.error('Error fetching categories:', error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (user) {
            fetchCategories();
        }
    }, [user, fetchCategories]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!user) return;

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
            }

            setIsModalOpen(false);
            resetForm();
            fetchCategories();
        } catch (error) {
            console.error('Error saving category:', error);
            alert('Error al guardar la categoría');
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('¿Estás seguro de eliminar esta categoría?')) return;

        try {
            const { error } = await supabase
                .from('categories')
                .delete()
                .eq('id', id);

            if (error) throw error;
            fetchCategories();
        } catch (error) {
            console.error('Error deleting category:', error);
            alert('Error al eliminar la categoría');
        }
    }

    function resetForm() {
        setEditingCategory(null);
        setFormData({
            name: '',
            type: 'expense',
            color: '#3B82F6',
            icon: 'Tag'
        });
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

    const incomeCategories = categories.filter(c => c.type === 'income' || c.type === 'both');
    const expenseCategories = categories.filter(c => c.type === 'expense' || c.type === 'both');

    if (loading) return <div className="loading-screen">Cargando...</div>;

    return (
        <div className="categories-container">
            <div className="categories-header">
                <div className="categories-title">
                    <h1>Categorías</h1>
                    <p>Gestiona las categorías de tus transacciones</p>
                </div>
                <button
                    className="add-category-btn"
                    onClick={() => {
                        resetForm();
                        setIsModalOpen(true);
                    }}
                >
                    <Plus size={20} />
                    Nueva Categoría
                </button>
            </div>

            <div className="categories-grid">
                {/* Income Categories */}
                <div className="category-group">
                    <div className="category-group-header">
                        <TrendingUp className="text-emerald-500" />
                        <h2>Ingresos</h2>
                    </div>
                    <div className="categories-list">
                        {incomeCategories.map(category => (
                            <div key={category.id} className="category-card">
                                <div className="category-info">
                                    <div
                                        className="category-icon"
                                        style={{ backgroundColor: `${category.color}20`, color: category.color }}
                                    >
                                        <Tag size={20} />
                                    </div>
                                    <span className="category-name">{category.name}</span>
                                </div>
                                <div className="category-actions">
                                    <button
                                        onClick={() => openEditModal(category)}
                                        className="category-action-btn edit"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    {!category.is_system && (
                                        <button
                                            onClick={() => handleDelete(category.id)}
                                            className="category-action-btn delete"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Expense Categories */}
                <div className="category-group">
                    <div className="category-group-header">
                        <TrendingDown className="text-red-500" />
                        <h2>Gastos</h2>
                    </div>
                    <div className="categories-list">
                        {expenseCategories.map(category => (
                            <div key={category.id} className="category-card">
                                <div className="category-info">
                                    <div
                                        className="category-icon"
                                        style={{ backgroundColor: `${category.color}20`, color: category.color }}
                                    >
                                        <Tag size={20} />
                                    </div>
                                    <span className="category-name">{category.name}</span>
                                </div>
                                <div className="category-actions">
                                    <button
                                        onClick={() => openEditModal(category)}
                                        className="category-action-btn edit"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    {!category.is_system && (
                                        <button
                                            onClick={() => handleDelete(category.id)}
                                            className="category-action-btn delete"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Add/Edit Modal */}
            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h2>{editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}</h2>
                            <button className="close-btn" onClick={() => setIsModalOpen(false)}>
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
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
                                    onChange={e => setFormData({ ...formData, type: e.target.value as CategoryFormData['type'] })}
                                >
                                    <option value="expense">Gasto</option>
                                    <option value="income">Ingreso</option>
                                    <option value="both">Ambos</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Color</label>
                                <div className="color-grid">
                                    {DEFAULT_COLORS.map(color => (
                                        <div
                                            key={color}
                                            className={`color-swatch ${formData.color === color ? 'selected' : ''}`}
                                            style={{ backgroundColor: color }}
                                            onClick={() => setFormData({ ...formData, color })}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="btn-cancel"
                                    onClick={() => setIsModalOpen(false)}
                                >
                                    Cancelar
                                </button>
                                <button type="submit" className="btn-submit">
                                    {editingCategory ? 'Guardar Cambios' : 'Crear Categoría'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
