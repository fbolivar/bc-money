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
    X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import './Sidebar.css';

const baseNavItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/transacciones', icon: ArrowLeftRight, label: 'Transacciones' },
    { path: '/categorias', icon: Tags, label: 'Categorías' },
    { path: '/presupuestos', icon: Wallet, label: 'Presupuestos' },
    { path: '/metas', icon: Target, label: 'Metas' },
    { path: '/reportes', icon: FileText, label: 'Reportes' },
    { path: '/asesor', icon: Bot, label: 'Asesor IA' },
];

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
    const { signOut, profile } = useAuth();
    const navItems = baseNavItems;

    return (
        <>
            <div
                className={`sidebar-overlay ${isOpen ? 'open' : ''}`}
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    zIndex: 90,
                    opacity: isOpen ? 1 : 0,
                    pointerEvents: isOpen ? 'auto' : 'none',
                    transition: 'opacity 0.3s ease',
                    display: 'block' // Always render but handle with opacity/pointerEvents
                }}
            />
            <aside
                className={`sidebar ${isOpen ? 'open' : ''}`}
                style={{
                    ...(window.innerWidth <= 768 ? {
                        position: 'fixed',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
                    } : {})
                }}
            >
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        <DollarSign size={28} />
                        <span>BC MONEY</span>
                    </div>
                    <button className="close-sidebar-btn" onClick={onClose}>
                        <X size={24} />
                    </button>
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
                                onClick={() => {
                                    if (window.innerWidth <= 768) {
                                        onClose();
                                    }
                                }}
                            >
                                <item.icon size={20} />
                                <span>{item.label}</span>
                            </NavLink>
                        ))}
                    </div>
                </nav>

                <div className="sidebar-footer">
                    <div className="user-info">
                        <NavLink to="/configuracion" className="user-info-link" title="Ir a mi perfil" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none', color: 'inherit', width: '100%' }}>
                            <div className="user-avatar">
                                {profile?.full_name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="user-details">
                                <span className="user-name">{profile?.full_name || 'Usuario'}</span>
                                <span className="user-email">{profile?.email}</span>
                            </div>
                        </NavLink>
                    </div>
                    <div className="sidebar-actions">
                        <NavLink to="/configuracion" className="nav-link" onClick={() => window.innerWidth <= 768 && onClose()}>
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
        </>
    );
}
