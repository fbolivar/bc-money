import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/supabase';
import { Shield, User, Ban, CheckCircle, Search, Filter, Plus, Trash2, Edit2, X, Eye, EyeOff } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import '../pages/Usuarios.css';

export function UsersTab() {
    const { isAdmin, profile: currentProfile } = useAuth();
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState<string>('all');

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
    const [editingUser, setEditingUser] = useState<Profile | null>(null);
    const [formLoading, setFormLoading] = useState(false);

    const [formData, setFormData] = useState({
        email: '',
        full_name: '',
        password: '',
        role: 'user' as 'user' | 'admin',
        currency: 'USD',
    });

    const [showPassword, setShowPassword] = useState(false);

    const fetchProfiles = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching profiles:', error);
        } else {
            setProfiles(data as Profile[]);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (isAdmin) {
            fetchProfiles();
        }
    }, [isAdmin]);

    const handleCreateUser = () => {
        setFormData({ email: '', full_name: '', password: '', role: 'user', currency: 'USD' });
        setModalMode('create');
        setShowModal(true);
    };

    const handleEditUser = (profile: Profile) => {
        setEditingUser(profile);
        setFormData({
            email: profile.email,
            full_name: profile.full_name || '',
            password: '',
            role: profile.role || 'user',
            currency: profile.currency || 'USD',
        });
        setModalMode('edit');
        setShowModal(true);
    };

    const handleDeleteUser = async (userId: string) => {
        if (userId === currentProfile?.id) return;
        if (!confirm('¿Estás seguro de eliminar este usuario permanentemente? Esta acción no se puede deshacer.')) return;

        try {
            const { error: fnError } = await supabase.functions.invoke('admin-users', {
                body: { action: 'delete_user', payload: { userId } }
            });

            if (fnError) throw fnError;

            // Also remove from local list for immediate feedback
            setProfiles(prev => prev.filter(p => p.id !== userId));
            alert('Usuario eliminado correctamente.');
        } catch (error) {
            console.error('Delete error:', error);
            const message = error instanceof Error ? error.message : 'Error desconocido';
            alert('Error al eliminar usuario: ' + message);
        }
    };

    const handleStatusChange = async (targetUserId: string, newStatus: 'active' | 'banned') => {
        if (targetUserId === currentProfile?.id) return;

        const { error } = await supabase
            .from('profiles')
            .update({ status: newStatus })
            .eq('id', targetUserId);

        if (error) {
            alert('Error al actualizar estado');
        } else {
            setProfiles(prev => prev.map(p => p.id === targetUserId ? { ...p, status: newStatus } : p));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormLoading(true);

        try {
            if (modalMode === 'create') {
                const { error: fnError } = await supabase.functions.invoke('admin-users', {
                    body: {
                        action: 'create_user',
                        payload: {
                            email: formData.email,
                            password: formData.password,
                            full_name: formData.full_name,
                            role: formData.role,
                            currency: formData.currency,
                        }
                    }
                });

                if (fnError) throw fnError;

                alert('Usuario creado exitosamente. Se ha enviado un correo de confirmación (si está configurado).');
                setShowModal(false);
                fetchProfiles(); // Refresh list
            } else {
                // Edit existing user
                if (editingUser) {
                    // 1. Update Profile Data
                    await supabase
                        .from('profiles')
                        .update({
                            full_name: formData.full_name,
                            role: formData.role,
                            currency: formData.currency
                        })
                        .eq('id', editingUser.id);

                    // 2. Update Auth Data if needed (Email/Password)
                    if (formData.password || formData.email !== editingUser.email) {
                        const updates: Record<string, unknown> = { userId: editingUser.id };
                        if (formData.password) updates.password = formData.password;
                        if (formData.email !== editingUser.email) updates.email = formData.email;
                        updates.currency = formData.currency;

                        const { error: fnError } = await supabase.functions.invoke('admin-users', {
                            body: { action: 'update_user_auth', payload: updates }
                        });
                        if (fnError) throw fnError;
                    }

                    setShowModal(false);
                    fetchProfiles();
                    alert('Usuario actualizado correctamente.');
                }
            }
        } catch (error) {
            console.error('Submit error:', error);
            const message = error instanceof Error ? error.message : 'Intente nuevamente.';
            alert('Error al guardar usuario: ' + message);
        } finally {
            setFormLoading(false);
        }
    };

    const filteredProfiles = profiles.filter(p => {
        const matchesSearch =
            p.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = roleFilter === 'all' || p.role === roleFilter;
        return matchesSearch && matchesRole;
    });

    if (!isAdmin) return null;

    if (loading && profiles.length === 0) {
        return <div className="loading-container"><div className="loading-spinner"></div></div>;
    }

    return (
        <div className="users-tab animate-fadeIn">
            <div className="flex justify-between items-center mb-md">
                <div className="filters-bar flex-1">
                    <div className="search-wrapper">
                        <Search size={18} className="search-icon" />
                        <input
                            type="text"
                            placeholder="Buscar por nombre o email..."
                            className="search-input"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="filter-wrapper">
                        <Filter size={18} className="filter-icon" />
                        <select
                            className="form-select filter-select"
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value)}
                        >
                            <option value="all">Todos los roles</option>
                            <option value="admin">Administradores</option>
                            <option value="user">Usuarios</option>
                        </select>
                    </div>
                </div>
                <button className="btn btn-primary" onClick={handleCreateUser}>
                    <Plus size={18} /> Nuevo Usuario
                </button>
            </div>

            <div className="users-table-container">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Usuario</th>
                            <th>Estado</th>
                            <th>Rol</th>
                            <th>Registro</th>
                            <th className="text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredProfiles.map((p) => (
                            <tr key={p.id} className={p.status === 'banned' ? 'row-banned' : ''}>
                                <td>
                                    <div className="user-cell">
                                        <div className="user-avatar-small">
                                            {p.full_name?.[0]?.toUpperCase() || '?'}
                                        </div>
                                        <div>
                                            <div className="font-medium">{p.full_name || 'Sin nombre'}</div>
                                            <div className="text-sm text-secondary">{p.email}</div>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <span className={`status-badge ${p.status || 'active'}`}>
                                        {p.status === 'banned' ? 'Suspendido' : 'Activo'}
                                    </span>
                                </td>
                                <td>
                                    <div className="role-selector">
                                        {p.role === 'admin' ? <Shield size={16} className="text-primary" /> : <User size={16} />}
                                        <span className="capitalize">{p.role || 'user'}</span>
                                    </div>
                                </td>
                                <td>{format(new Date(p.created_at), 'd MMM yyyy', { locale: es })}</td>
                                <td className="text-right">
                                    <div className="flex justify-end gap-2">
                                        <button
                                            className="action-btn"
                                            onClick={() => handleEditUser(p)}
                                            title="Editar Usuario"
                                            disabled={p.id === currentProfile?.id}
                                        >
                                            <Edit2 size={16} />
                                        </button>

                                        {p.id !== currentProfile?.id && (
                                            <>
                                                <button
                                                    className={`action-btn ${p.status === 'banned' ? 'text-success' : 'text-warning'}`}
                                                    onClick={() => handleStatusChange(p.id, p.status === 'banned' ? 'active' : 'banned')}
                                                    title={p.status === 'banned' ? 'Activar cuenta' : 'Suspender cuenta'}
                                                >
                                                    {p.status === 'banned' ? <CheckCircle size={16} /> : <Ban size={16} />}
                                                </button>

                                                <button
                                                    className="action-btn text-danger"
                                                    onClick={() => handleDeleteUser(p.id)}
                                                    title="Eliminar permanentemente"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h3>{modalMode === 'create' ? 'Nuevo Usuario' : 'Editar Usuario'}</h3>
                            <button onClick={() => setShowModal(false)} className="close-btn">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="modal-content">
                            <div className="form-group">
                                <label>Nombre Completo</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.full_name}
                                    onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Email</label>
                                <input
                                    type="email"
                                    className="form-input"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>
                                    {modalMode === 'create' ? 'Contraseña' : 'Nueva Contraseña (opcional)'}
                                </label>
                                <div className="password-input-wrapper relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        className="form-input"
                                        value={formData.password}
                                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                                        required={modalMode === 'create'}
                                        minLength={6}
                                        placeholder={modalMode === 'edit' ? 'Dejar en blanco para mantener actual' : ''}
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle"
                                        onClick={() => setShowPassword(!showPassword)}
                                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                                    >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Rol</label>
                                <select
                                    className="form-select"
                                    value={formData.role}
                                    onChange={e => setFormData({ ...formData, role: e.target.value as 'user' | 'admin' })}
                                >
                                    <option value="user">Usuario</option>
                                    <option value="admin">Administrador</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Moneda</label>
                                <select
                                    className="form-select"
                                    value={formData.currency}
                                    onChange={e => setFormData({ ...formData, currency: e.target.value })}
                                >
                                    <option value="USD">USD - Dólar Estadounidense</option>
                                    <option value="EUR">EUR - Euro</option>
                                    <option value="COP">COP - Peso Colombiano</option>
                                    <option value="MXN">MXN - Peso Mexicano</option>
                                    <option value="ARS">ARS - Peso Argentino</option>
                                    <option value="CLP">CLP - Peso Chileno</option>
                                    <option value="PEN">PEN - Sol Peruano</option>
                                </select>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn btn-primary" disabled={formLoading}>
                                    {formLoading ? 'Guardando...' : (modalMode === 'create' ? 'Crear Usuario' : 'Guardar Cambios')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
