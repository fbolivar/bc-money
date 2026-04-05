import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Plus, Edit2, Trash2, X, Search, Pin, StickyNote, FileText,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { FinancialNote } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import './Notas.css';

const NOTE_COLORS = [
    '#F59E0B', '#EF4444', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4', '#64748B',
];

interface FormData {
    title: string;
    content: string;
    color: string;
    tags: string[];
}

const DEFAULT_FORM: FormData = {
    title: '',
    content: '',
    color: '#F59E0B',
    tags: [],
};

function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    const day = d.getDate();
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
}

export function Notas() {
    const { user } = useAuth();
    const [notes, setNotes] = useState<FinancialNote[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<FinancialNote | null>(null);
    const [editing, setEditing] = useState<FinancialNote | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [formData, setFormData] = useState<FormData>(DEFAULT_FORM);
    const [tagInput, setTagInput] = useState('');
    const tagInputRef = useRef<HTMLInputElement>(null);

    const showToast = useCallback((msg: string, type: 'success' | 'error') => {
        setToast({ message: msg, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    const fetchNotes = useCallback(async () => {
        if (!user) return;
        const { data } = await supabase
            .from('financial_notes')
            .select('*')
            .eq('user_id', user.id)
            .order('pinned', { ascending: false })
            .order('updated_at', { ascending: false });
        setNotes(data || []);
        setLoading(false);
    }, [user]);

    useEffect(() => { if (user) fetchNotes(); }, [user, fetchNotes]);

    const filtered = useMemo(() => {
        if (!searchTerm) return notes;
        const t = searchTerm.toLowerCase();
        return notes.filter(n =>
            n.title.toLowerCase().includes(t) ||
            n.content.toLowerCase().includes(t) ||
            (n.tags || []).some(tag => tag.toLowerCase().includes(t))
        );
    }, [notes, searchTerm]);

    const pinnedNotes = useMemo(() => filtered.filter(n => n.pinned), [filtered]);
    const unpinnedNotes = useMemo(() => filtered.filter(n => !n.pinned), [filtered]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!user || saving) return;
        if (!formData.title.trim() || !formData.content.trim()) {
            showToast('Título y contenido son obligatorios', 'error');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                user_id: user.id,
                title: formData.title.trim(),
                content: formData.content.trim(),
                color: formData.color,
                tags: formData.tags.length > 0 ? formData.tags : null,
                updated_at: new Date().toISOString(),
            };
            if (editing) {
                const { error } = await supabase.from('financial_notes').update(payload).eq('id', editing.id);
                if (error) throw error;
                showToast('Nota actualizada', 'success');
            } else {
                const { error } = await supabase.from('financial_notes').insert(payload);
                if (error) throw error;
                showToast('Nota creada', 'success');
            }
            closeModal();
            fetchNotes();
        } catch {
            showToast('Error al guardar la nota', 'error');
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(note: FinancialNote) {
        try {
            const { error } = await supabase.from('financial_notes').delete().eq('id', note.id);
            if (error) throw error;
            setDeleteConfirm(null);
            showToast('Nota eliminada', 'success');
            fetchNotes();
        } catch {
            showToast('Error al eliminar la nota', 'error');
            setDeleteConfirm(null);
        }
    }

    async function togglePin(note: FinancialNote) {
        try {
            const { error } = await supabase
                .from('financial_notes')
                .update({ pinned: !note.pinned, updated_at: new Date().toISOString() })
                .eq('id', note.id);
            if (error) throw error;
            showToast(note.pinned ? 'Nota desanclada' : 'Nota anclada', 'success');
            fetchNotes();
        } catch {
            showToast('Error al actualizar la nota', 'error');
        }
    }

    function openEdit(note: FinancialNote) {
        setEditing(note);
        setFormData({
            title: note.title,
            content: note.content,
            color: note.color,
            tags: note.tags || [],
        });
        setTagInput('');
        setIsModalOpen(true);
    }

    function openCreate() {
        setEditing(null);
        setFormData({ ...DEFAULT_FORM });
        setTagInput('');
        setIsModalOpen(true);
    }

    function closeModal() {
        setIsModalOpen(false);
        setEditing(null);
        setFormData({ ...DEFAULT_FORM });
        setTagInput('');
    }

    function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
            e.preventDefault();
            const newTag = tagInput.trim().replace(/,/g, '');
            if (newTag && !formData.tags.includes(newTag)) {
                setFormData({ ...formData, tags: [...formData.tags, newTag] });
            }
            setTagInput('');
        } else if (e.key === 'Backspace' && !tagInput && formData.tags.length > 0) {
            setFormData({ ...formData, tags: formData.tags.slice(0, -1) });
        }
    }

    function removeTag(tag: string) {
        setFormData({ ...formData, tags: formData.tags.filter(t => t !== tag) });
    }

    if (loading) return <div className="loading-screen">Cargando...</div>;

    return (
        <div className="notas-container">
            {toast && <div className={`notas-toast ${toast.type}`}>{toast.message}</div>}

            <div className="notas-header">
                <h1>Notas Financieras</h1>
                <p>Apuntes rápidos sobre tus finanzas, ideas y recordatorios</p>
            </div>

            {/* Summary */}
            <div className="notas-summary">
                <div className="ns-card total">
                    <FileText size={20} />
                    <div><span className="ns-num">{notes.length}</span><span className="ns-label">Total</span></div>
                </div>
                <div className="ns-card pinned">
                    <Pin size={20} />
                    <div><span className="ns-num">{notes.filter(n => n.pinned).length}</span><span className="ns-label">Ancladas</span></div>
                </div>
            </div>

            {/* Search */}
            <div className="notas-filters">
                <div className="notas-search">
                    <Search size={18} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Buscar notas..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="search-input"
                    />
                </div>
            </div>

            {/* Notes Grid */}
            {filtered.length === 0 ? (
                <div className="notas-empty">
                    <StickyNote size={48} />
                    <h3>{searchTerm ? 'No se encontraron notas' : 'No tienes notas aún'}</h3>
                    <p>Crea notas para recordar ideas financieras, metas o apuntes importantes</p>
                    {!searchTerm && (
                        <button type="button" className="empty-add-btn" onClick={openCreate}>
                            <Plus size={20} /> Crear Nota
                        </button>
                    )}
                </div>
            ) : (
                <div className="notas-grid">
                    {pinnedNotes.map(note => (
                        <NoteCard
                            key={note.id}
                            note={note}
                            onEdit={openEdit}
                            onDelete={setDeleteConfirm}
                            onTogglePin={togglePin}
                        />
                    ))}
                    {unpinnedNotes.map(note => (
                        <NoteCard
                            key={note.id}
                            note={note}
                            onEdit={openEdit}
                            onDelete={setDeleteConfirm}
                            onTogglePin={togglePin}
                        />
                    ))}
                </div>
            )}

            {/* FAB */}
            <button type="button" className="fab-add" onClick={openCreate}>
                <Plus size={20} /> Nueva Nota
            </button>

            {/* Create / Edit Modal */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editing ? 'Editar Nota' : 'Nueva Nota'}</h2>
                            <button type="button" className="close-btn" title="Cerrar" onClick={closeModal}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="modal-form">
                            <div className="form-group">
                                <label>Título</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.title}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    required
                                    placeholder="Ej: Revisión de presupuesto mensual"
                                />
                            </div>
                            <div className="form-group">
                                <label>Contenido</label>
                                <textarea
                                    className="form-textarea"
                                    value={formData.content}
                                    onChange={e => setFormData({ ...formData, content: e.target.value })}
                                    required
                                    placeholder="Escribe tu nota aquí..."
                                />
                            </div>
                            <div className="form-group">
                                <label>Color</label>
                                <div className="color-picker-row">
                                    {NOTE_COLORS.map(color => (
                                        <button
                                            key={color}
                                            type="button"
                                            className={`color-swatch ${formData.color === color ? 'selected' : ''}`}
                                            style={{ background: color }}
                                            onClick={() => setFormData({ ...formData, color })}
                                            title={color}
                                        />
                                    ))}
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Etiquetas</label>
                                <div
                                    className="tags-input-wrapper"
                                    onClick={() => tagInputRef.current?.focus()}
                                >
                                    {formData.tags.map(tag => (
                                        <span key={tag} className="tag-chip">
                                            {tag}
                                            <button type="button" onClick={() => removeTag(tag)} title="Quitar etiqueta">
                                                <X size={12} />
                                            </button>
                                        </span>
                                    ))}
                                    <input
                                        ref={tagInputRef}
                                        type="text"
                                        className="tags-input"
                                        value={tagInput}
                                        onChange={e => setTagInput(e.target.value)}
                                        onKeyDown={handleTagKeyDown}
                                        placeholder={formData.tags.length === 0 ? 'Escribe y presiona Enter...' : ''}
                                    />
                                </div>
                                <span className="tags-hint">Presiona Enter o coma para agregar</span>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={closeModal}>Cancelar</button>
                                <button type="submit" className="btn-submit" disabled={saving}>
                                    {saving ? 'Guardando...' : editing ? 'Actualizar' : 'Crear Nota'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
                    <div className="modal-content delete-modal" onClick={e => e.stopPropagation()}>
                        <Trash2 size={40} color="#EF4444" />
                        <h2>¿Eliminar esta nota?</h2>
                        <p>Se eliminará permanentemente &quot;{deleteConfirm.title}&quot;. Esta acción no se puede deshacer.</p>
                        <div className="delete-actions">
                            <button type="button" className="btn-cancel" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
                            <button type="button" className="btn-delete" onClick={() => handleDelete(deleteConfirm)}>
                                <Trash2 size={16} /> Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ─── Note Card Sub-component ─── */

function NoteCard({ note, onEdit, onDelete, onTogglePin }: {
    note: FinancialNote;
    onEdit: (n: FinancialNote) => void;
    onDelete: (n: FinancialNote) => void;
    onTogglePin: (n: FinancialNote) => void;
}) {
    return (
        <div className="note-card">
            <div className="note-color-strip" style={{ background: note.color }} />
            <div className="note-body">
                <div className="note-top">
                    <span className="note-title">{note.title}</span>
                    <button
                        type="button"
                        className={`note-pin-btn ${note.pinned ? 'pinned' : ''}`}
                        onClick={() => onTogglePin(note)}
                        title={note.pinned ? 'Desanclar' : 'Anclar'}
                    >
                        <Pin size={16} fill={note.pinned ? 'currentColor' : 'none'} />
                    </button>
                </div>
                <div className="note-content">{note.content}</div>
                {(note.tags && note.tags.length > 0) && (
                    <div className="note-tags">
                        {note.tags.map(tag => <span key={tag} className="note-tag">{tag}</span>)}
                    </div>
                )}
                <div className="note-footer">
                    <span className="note-date">{formatDate(note.updated_at)}</span>
                    <div className="note-actions">
                        <button type="button" className="note-btn" onClick={() => onEdit(note)} title="Editar">
                            <Edit2 size={15} />
                        </button>
                        <button type="button" className="note-btn del" onClick={() => onDelete(note)} title="Eliminar">
                            <Trash2 size={15} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
