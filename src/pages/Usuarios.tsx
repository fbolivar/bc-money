import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/supabase';
import { Shield, User, Ban, CheckCircle, Search, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import './Usuarios.css';

export function Usuarios() {
    const { isAdmin, profile: currentProfile } = useAuth();
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState<string>('all');

    // Authorization check
    if (!isAdmin) {
        return <Navigate to="/" replace />;
    }

    const fetchProfiles = async () => {
        setLoading(true);
        // We use the 'is_admin' function via policy, so select * from profiles works returning all
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
        fetchProfiles();
    }, []);

    const handleRoleChange = async (targetUserId: string, newRole: 'admin' | 'user') => {
        if (targetUserId === currentProfile?.id) {
            alert('No puedes cambiar tu propio rol.');
            return;
        }

        const { error } = await supabase
            .from('profiles')
            .update({ role: newRole })
            .eq('id', targetUserId);

        if (error) {
            console.error('Error updating role:', error);
            alert('Error al actualizar rol');
        } else {
            fetchProfiles();
        }
    };

    const handleStatusChange = async (targetUserId: string, newStatus: 'active' | 'banned') => {
        if (targetUserId === currentProfile?.id) {
            alert('No puedes cambiar tu propio estado.');
            return;
        }

        const { error } = await supabase
            .from('profiles')
            .update({ status: newStatus })
            .eq('id', targetUserId);

        if (error) {
            console.error('Error updating status:', error);
            alert('Error al actualizar estado');
        } else {
            fetchProfiles();
        }
    };

    const filteredProfiles = profiles.filter(p => {
        const matchesSearch =
            p.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = roleFilter === 'all' || p.role === roleFilter;
        return matchesSearch && matchesRole;
    });

    if (loading && profiles.length === 0) {
        return <div className="loading-container"><div className="loading-spinner"></div></div>;
    }

    return (
        <div className="usuarios-page animate-fadeIn">
            <div className="toolbar">
                <div>
                    <h2>Gestión de Usuarios</h2>
                    <p className="text-secondary">Administra los accesos y roles de la plataforma</p>
                </div>
            </div>

            <div className="filters-bar">
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
                        {filteredProfiles.map((profile) => (
                            <tr key={profile.id} className={profile.status === 'banned' ? 'row-banned' : ''}>
                                <td>
                                    <div className="user-cell">
                                        <div className="user-avatar-small">
                                            {profile.full_name?.[0]?.toUpperCase() || '?'}
                                        </div>
                                        <div>
                                            <div className="font-medium">{profile.full_name || 'Sin nombre'}</div>
                                            <div className="text-sm text-secondary">{profile.email}</div>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <span className={`status-badge ${profile.status || 'active'}`}>
                                        {profile.status === 'banned' ? 'Suspendido' : 'Activo'}
                                    </span>
                                </td>
                                <td>
                                    <div className="role-selector">
                                        {profile.role === 'admin' ? <Shield size={16} className="text-primary" /> : <User size={16} />}
                                        <select
                                            value={profile.role || 'user'}
                                            onChange={(e) => handleRoleChange(profile.id, e.target.value as 'admin' | 'user')}
                                            className="role-select"
                                            disabled={profile.id === currentProfile?.id}
                                        >
                                            <option value="user">Usuario</option>
                                            <option value="admin">Admin</option>
                                        </select>
                                    </div>
                                </td>
                                <td>
                                    {format(new Date(profile.created_at), 'd MMM yyyy', { locale: es })}
                                </td>
                                <td className="text-right">
                                    {profile.id !== currentProfile?.id && (
                                        <button
                                            className={`btn btn-sm ${profile.status === 'banned' ? 'btn-success-outline' : 'btn-danger-outline'}`}
                                            onClick={() => handleStatusChange(profile.id, profile.status === 'banned' ? 'active' : 'banned')}
                                            title={profile.status === 'banned' ? 'Activar cuenta' : 'Suspender cuenta'}
                                        >
                                            {profile.status === 'banned' ? (
                                                <>
                                                    <CheckCircle size={16} />
                                                    Activar
                                                </>
                                            ) : (
                                                <>
                                                    <Ban size={16} />
                                                    Suspender
                                                </>
                                            )}
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
