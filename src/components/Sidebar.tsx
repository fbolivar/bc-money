import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    ArrowLeftRight,
    Wallet,
    Target,
    FileText,
    Bot,
    Settings,
    LogOut,
    DollarSign,
    Tags,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Sidebar.css';

const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/transacciones', icon: ArrowLeftRight, label: 'Transacciones' },
    { path: '/categorias', icon: Tags, label: 'Categorías' },
    { path: '/presupuestos', icon: Wallet, label: 'Presupuestos' },
    { path: '/metas', icon: Target, label: 'Metas' },
    { path: '/reportes', icon: FileText, label: 'Reportes' },
    { path: '/asesor', icon: Bot, label: 'Asesor IA' },
];

export function Sidebar() {
    const { signOut, profile } = useAuth();

    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <div className="sidebar-logo">
                    <DollarSign size={28} />
                    <span>BC MONEY</span>
                </div>
            </div>

            <nav className="sidebar-nav">
                <div className="nav-section">
                    <span className="nav-section-title">MENÚ PRINCIPAL</span>
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) =>
                                `nav-link ${isActive ? 'nav-link-active' : ''}`
                            }
                        >
                            <item.icon size={20} />
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </div>
            </nav>

            <div className="sidebar-footer">
                <div className="user-info">
                    <div className="user-avatar">
                        {profile?.full_name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="user-details">
                        <span className="user-name">{profile?.full_name || 'Usuario'}</span>
                        <span className="user-email">{profile?.email}</span>
                    </div>
                </div>
                <div className="sidebar-actions">
                    <NavLink to="/configuracion" className="nav-link">
                        <Settings size={20} />
                        <span>Configuración</span>
                    </NavLink>
                    <button onClick={signOut} className="nav-link logout-btn">
                        <LogOut size={20} />
                        <span>Cerrar Sesión</span>
                    </button>
                </div>
            </div>
        </aside>
    );
}
