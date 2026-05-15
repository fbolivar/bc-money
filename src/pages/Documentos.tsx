import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    FileText, Plus, X, AlertTriangle, CheckCircle, Clock, Edit2, Trash2,
    Building2, Hash, Calendar, Bell, StickyNote, Briefcase,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import './Documentos.css';

// ─── Types ───────────────────────────────────────────────────────────────────

type DocType =
    | 'rut'
    | 'matricula_mercantil'
    | 'certificado_dian'
    | 'resolucion_facturacion'
    | 'camara_comercio'
    | 'registro_ica'
    | 'otro';

interface BusinessDocument {
    id: string;
    user_id: string;
    name: string;
    type: DocType;
    entity: string | null;
    document_number: string | null;
    issue_date: string | null;
    expiry_date: string | null;
    renewal_alert_days: number;
    status: 'active' | 'expired' | 'pending_renewal';
    notes: string | null;
    created_at: string;
    updated_at: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DOC_TYPES: { value: DocType; label: string; color: string }[] = [
    { value: 'rut',                   label: 'RUT',                     color: '#3B82F6' },
    { value: 'matricula_mercantil',   label: 'Matrícula Mercantil',     color: '#8B5CF6' },
    { value: 'certificado_dian',      label: 'Certificado DIAN',        color: '#06B6D4' },
    { value: 'resolucion_facturacion',label: 'Resolución Facturación',  color: '#F59E0B' },
    { value: 'camara_comercio',       label: 'Cámara de Comercio',      color: '#10B981' },
    { value: 'registro_ica',          label: 'Registro ICA',            color: '#EF4444' },
    { value: 'otro',                  label: 'Otro',                    color: '#64748B' },
];

const TYPE_MAP = Object.fromEntries(DOC_TYPES.map(t => [t.value, t]));

interface FormData {
    name: string;
    type: DocType;
    entity: string;
    document_number: string;
    issue_date: string;
    expiry_date: string;
    renewal_alert_days: string;
    notes: string;
}

const DEFAULT_FORM: FormData = {
    name: '',
    type: 'rut',
    entity: '',
    document_number: '',
    issue_date: '',
    expiry_date: '',
    renewal_alert_days: '30',
    notes: '',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDocStatus(doc: BusinessDocument): { label: string; cls: string; days: number | null } {
    if (!doc.expiry_date) return { label: 'Sin vencimiento', cls: 'no-expiry', days: null };
    const days = differenceInDays(new Date(doc.expiry_date), new Date());
    if (days < 0) return { label: `Venció hace ${Math.abs(days)} día${Math.abs(days) !== 1 ? 's' : ''}`, cls: 'expired', days };
    if (days === 0) return { label: 'Vence hoy', cls: 'expiring', days };
    if (days <= (doc.renewal_alert_days || 30)) return { label: `Vence en ${days} día${days !== 1 ? 's' : ''}`, cls: 'expiring', days };
    return { label: `Vence en ${days} días`, cls: 'active', days };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Documentos() {
    const { user, profile, isAdmin } = useAuth();

    const [docs, setDocs] = useState<BusinessDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState<BusinessDocument | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<BusinessDocument | null>(null);
    const [formData, setFormData] = useState<FormData>(DEFAULT_FORM);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const showToast = useCallback((message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    const fetchDocs = useCallback(async () => {
        if (!user) return;
        const { data } = await supabase
            .from('business_documents')
            .select('*')
            .eq('user_id', user.id)
            .order('expiry_date', { ascending: true, nullsFirst: false });
        setDocs(data || []);
        setLoading(false);
    }, [user]);

    useEffect(() => { if (user) fetchDocs(); }, [user, fetchDocs]);

    // ─── Derived counts ──────────────────────────────────────────────────────

    const { vigentes, porVencer, vencidos } = useMemo(() => {
        let v = 0, pv = 0, ve = 0;
        for (const doc of docs) {
            const st = getDocStatus(doc);
            if (st.cls === 'expired') ve++;
            else if (st.cls === 'expiring') pv++;
            else v++;
        }
        return { vigentes: v, porVencer: pv, vencidos: ve };
    }, [docs]);

    const needsAttention = porVencer > 0 || vencidos > 0;

    // ─── CRUD ─────────────────────────────────────────────────────────────────

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!user || saving) return;
        setSaving(true);
        try {
            const payload = {
                user_id: user.id,
                name: formData.name,
                type: formData.type,
                entity: formData.entity || null,
                document_number: formData.document_number || null,
                issue_date: formData.issue_date || null,
                expiry_date: formData.expiry_date || null,
                renewal_alert_days: parseInt(formData.renewal_alert_days) || 30,
                notes: formData.notes || null,
                updated_at: new Date().toISOString(),
            };
            if (editing) {
                await supabase.from('business_documents').update(payload).eq('id', editing.id);
                showToast('Documento actualizado', 'success');
            } else {
                await supabase.from('business_documents').insert(payload);
                showToast('Documento registrado', 'success');
            }
            closeModal();
            fetchDocs();
        } catch {
            showToast('Error al guardar', 'error');
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(doc: BusinessDocument) {
        try {
            await supabase.from('business_documents').delete().eq('id', doc.id);
            setDeleteConfirm(null);
            showToast('Documento eliminado', 'success');
            fetchDocs();
        } catch {
            showToast('Error al eliminar', 'error');
            setDeleteConfirm(null);
        }
    }

    function openCreate() {
        setEditing(null);
        setFormData(DEFAULT_FORM);
        setIsModalOpen(true);
    }

    function openEdit(doc: BusinessDocument) {
        setEditing(doc);
        setFormData({
            name: doc.name,
            type: doc.type,
            entity: doc.entity || '',
            document_number: doc.document_number || '',
            issue_date: doc.issue_date || '',
            expiry_date: doc.expiry_date || '',
            renewal_alert_days: String(doc.renewal_alert_days ?? 30),
            notes: doc.notes || '',
        });
        setIsModalOpen(true);
    }

    function closeModal() {
        setIsModalOpen(false);
        setEditing(null);
        setFormData(DEFAULT_FORM);
    }

    function setField<K extends keyof FormData>(key: K, value: FormData[K]) {
        setFormData(prev => ({ ...prev, [key]: value }));
    }

    // ─── Access guard ─────────────────────────────────────────────────────────

    if (!profile?.billing_enabled && !isAdmin) {
        return (
            <div className="docs-container docs-disabled">
                <Briefcase size={48} className="docs-disabled-icon" />
                <h3>Módulo no habilitado</h3>
                <p>Contacta al administrador para activar el módulo empresarial.</p>
            </div>
        );
    }

    if (loading) return <div className="loading-screen">Cargando documentos...</div>;

    return (
        <div className="docs-container">
            {toast && <div className={`docs-toast ${toast.type}`}>{toast.message}</div>}

            {/* Alert banner */}
            {needsAttention && (
                <div className="docs-alert-banner">
                    <AlertTriangle size={18} />
                    <span>
                        {vencidos > 0 && <strong>{vencidos} documento{vencidos !== 1 ? 's' : ''} vencido{vencidos !== 1 ? 's' : ''}</strong>}
                        {vencidos > 0 && porVencer > 0 && ' · '}
                        {porVencer > 0 && <strong>{porVencer} por vencer pronto</strong>}
                        {' — Revisa y renueva a tiempo.'}
                    </span>
                </div>
            )}

            {/* Header */}
            <div className="docs-header">
                <div className="docs-header-info">
                    <h1><Briefcase size={26} /> Documentos Empresariales</h1>
                    <p>Gestiona los documentos legales y tributarios de tu empresa</p>
                </div>
                <button type="button" className="docs-add-btn" onClick={openCreate}>
                    <Plus size={18} /> Nuevo Documento
                </button>
            </div>

            {/* Badges summary */}
            <div className="docs-summary">
                <div className="docs-badge active">
                    <CheckCircle size={18} />
                    <span className="docs-badge-num">{vigentes}</span>
                    <span className="docs-badge-label">Vigentes</span>
                </div>
                <div className="docs-badge expiring">
                    <Clock size={18} />
                    <span className="docs-badge-num">{porVencer}</span>
                    <span className="docs-badge-label">Por vencer</span>
                </div>
                <div className="docs-badge expired">
                    <AlertTriangle size={18} />
                    <span className="docs-badge-num">{vencidos}</span>
                    <span className="docs-badge-label">Vencidos</span>
                </div>
            </div>

            {/* Cards grid */}
            {docs.length === 0 ? (
                <div className="docs-empty">
                    <FileText size={52} />
                    <h3>Sin documentos registrados</h3>
                    <p>Agrega los documentos legales de tu empresa para hacer seguimiento a sus vencimientos.</p>
                    <button type="button" className="docs-add-btn" onClick={openCreate}>
                        <Plus size={18} /> Agregar documento
                    </button>
                </div>
            ) : (
                <div className="docs-grid">
                    {docs.map(doc => (
                        <DocCard
                            key={doc.id}
                            doc={doc}
                            onEdit={openEdit}
                            onDelete={setDeleteConfirm}
                        />
                    ))}
                </div>
            )}

            {/* FAB */}
            {docs.length > 0 && (
                <button type="button" className="docs-fab" onClick={openCreate}>
                    <Plus size={20} /> Agregar
                </button>
            )}

            {/* Modal crear/editar */}
            {isModalOpen && (
                <div className="docs-modal-overlay" onClick={closeModal}>
                    <div className="docs-modal" onClick={e => e.stopPropagation()}>
                        <div className="docs-modal-header">
                            <h2>{editing ? 'Editar Documento' : 'Nuevo Documento'}</h2>
                            <button type="button" className="docs-close-btn" title="Cerrar" onClick={closeModal}>
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="docs-modal-form">
                            {/* Nombre */}
                            <div className="docs-field">
                                <label><FileText size={14} /> Nombre del documento</label>
                                <input
                                    type="text"
                                    className="docs-input"
                                    value={formData.name}
                                    onChange={e => setField('name', e.target.value)}
                                    placeholder="Ej: RUT Empresa ABC"
                                    required
                                />
                            </div>

                            {/* Tipo */}
                            <div className="docs-field">
                                <label><Hash size={14} /> Tipo de documento</label>
                                <select
                                    className="docs-select"
                                    title="Tipo de documento"
                                    value={formData.type}
                                    onChange={e => setField('type', e.target.value as DocType)}
                                >
                                    {DOC_TYPES.map(t => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Entidad y número */}
                            <div className="docs-row">
                                <div className="docs-field">
                                    <label><Building2 size={14} /> Entidad emisora</label>
                                    <input
                                        type="text"
                                        className="docs-input"
                                        value={formData.entity}
                                        onChange={e => setField('entity', e.target.value)}
                                        placeholder="Ej: DIAN, Cámara de Comercio"
                                    />
                                </div>
                                <div className="docs-field">
                                    <label><Hash size={14} /> Número de documento</label>
                                    <input
                                        type="text"
                                        className="docs-input"
                                        value={formData.document_number}
                                        onChange={e => setField('document_number', e.target.value)}
                                        placeholder="Ej: 900.123.456-7"
                                    />
                                </div>
                            </div>

                            {/* Fechas */}
                            <div className="docs-row">
                                <div className="docs-field">
                                    <label><Calendar size={14} /> Fecha de expedición</label>
                                    <input
                                        type="date"
                                        className="docs-input"
                                        value={formData.issue_date}
                                        onChange={e => setField('issue_date', e.target.value)}
                                    />
                                </div>
                                <div className="docs-field">
                                    <label><Calendar size={14} /> Fecha de vencimiento</label>
                                    <input
                                        type="date"
                                        className="docs-input"
                                        value={formData.expiry_date}
                                        onChange={e => setField('expiry_date', e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Días alerta */}
                            <div className="docs-field">
                                <label><Bell size={14} /> Alertar con anticipación (días)</label>
                                <input
                                    type="number"
                                    className="docs-input"
                                    value={formData.renewal_alert_days}
                                    onChange={e => setField('renewal_alert_days', e.target.value)}
                                    min="1"
                                    max="365"
                                    placeholder="30"
                                />
                            </div>

                            {/* Notas */}
                            <div className="docs-field">
                                <label><StickyNote size={14} /> Notas</label>
                                <textarea
                                    className="docs-input docs-textarea"
                                    value={formData.notes}
                                    onChange={e => setField('notes', e.target.value)}
                                    placeholder="Observaciones adicionales (opcional)"
                                    rows={3}
                                />
                            </div>

                            <div className="docs-modal-actions">
                                <button type="button" className="docs-btn-cancel" onClick={closeModal}>Cancelar</button>
                                <button type="submit" className="docs-btn-submit" disabled={saving}>
                                    {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear documento'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal eliminar */}
            {deleteConfirm && (
                <div className="docs-modal-overlay" onClick={() => setDeleteConfirm(null)}>
                    <div className="docs-modal docs-delete-modal" onClick={e => e.stopPropagation()}>
                        <AlertTriangle size={42} color="#F59E0B" />
                        <h2>¿Eliminar documento?</h2>
                        <p>Se eliminará <strong>"{deleteConfirm.name}"</strong> permanentemente.</p>
                        <div className="docs-modal-actions">
                            <button type="button" className="docs-btn-cancel" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
                            <button type="button" className="docs-btn-delete" onClick={() => handleDelete(deleteConfirm)}>Eliminar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Card Component ───────────────────────────────────────────────────────────

function DocCard({
    doc,
    onEdit,
    onDelete,
}: {
    doc: BusinessDocument;
    onEdit: (doc: BusinessDocument) => void;
    onDelete: (doc: BusinessDocument) => void;
}) {
    const typeInfo = TYPE_MAP[doc.type] ?? TYPE_MAP['otro'];
    const status = getDocStatus(doc);

    return (
        <div className={`doc-card doc-card-${status.cls}`}>
            {/* Icon + actions */}
            <div className="doc-card-top">
                <div className="doc-card-icon" style={{ background: `${typeInfo.color}18`, color: typeInfo.color }}>
                    <FileText size={22} />
                </div>
                <div className="doc-card-actions">
                    <button type="button" title="Editar" className="doc-action-btn" onClick={() => onEdit(doc)}>
                        <Edit2 size={14} />
                    </button>
                    <button type="button" title="Eliminar" className="doc-action-btn del" onClick={() => onDelete(doc)}>
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            {/* Type badge */}
            <span className="doc-type-badge" style={{ background: `${typeInfo.color}18`, color: typeInfo.color }}>
                {typeInfo.label}
            </span>

            {/* Name */}
            <h3 className="doc-name">{doc.name}</h3>

            {/* Entity + number */}
            {doc.entity && (
                <div className="doc-meta">
                    <Building2 size={13} />
                    <span>{doc.entity}</span>
                </div>
            )}
            {doc.document_number && (
                <div className="doc-meta">
                    <Hash size={13} />
                    <span>{doc.document_number}</span>
                </div>
            )}

            {/* Expiry */}
            {doc.expiry_date ? (
                <div className="doc-expiry">
                    <Calendar size={13} />
                    <span>Vence: {format(new Date(doc.expiry_date), 'd MMM yyyy', { locale: es })}</span>
                </div>
            ) : (
                <div className="doc-expiry no-date">
                    <Calendar size={13} />
                    <span>Sin fecha de vencimiento</span>
                </div>
            )}

            {/* Status badge */}
            <div className="doc-card-footer">
                <span className={`doc-status-badge doc-status-${status.cls}`}>
                    {status.cls === 'expired' && <AlertTriangle size={12} />}
                    {status.cls === 'expiring' && <Clock size={12} />}
                    {status.cls === 'active' && <CheckCircle size={12} />}
                    {status.cls === 'no-expiry' && <CheckCircle size={12} />}
                    {status.label}
                </span>
                {doc.expiry_date && doc.issue_date && (
                    <span className="doc-issue-date">
                        Exp: {format(new Date(doc.issue_date), 'd MMM yyyy', { locale: es })}
                    </span>
                )}
            </div>
        </div>
    );
}
