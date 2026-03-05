import { memo } from 'react';
import { useLocation } from 'react-router-dom';
import { Bell, Search, Menu } from 'lucide-react';
import './TopBar.css';

const PAGE_TITLES: Record<string, string> = {
    '/': 'Dashboard',
    '/transacciones': 'Transacciones',
    '/presupuestos': 'Presupuestos',
    '/metas': 'Metas',
    '/reportes': 'Reportes',
    '/asesor': 'Asesor Financiero',
    '/configuracion': 'Configuración',
    '/categorias': 'Categorías',
    '/onboarding': 'Configuración Inicial',
};

interface TopBarProps {
    onMenuClick: () => void;
}

export const TopBar = memo(function TopBar({ onMenuClick }: TopBarProps) {
    const location = useLocation();
    const pageTitle = PAGE_TITLES[location.pathname] || 'BC Money';

    return (
        <header className="topbar">
            <div className="topbar-left">
                <button className="menu-btn" onClick={onMenuClick}>
                    <Menu size={24} />
                </button>
                <h1 className="topbar-title">{pageTitle}</h1>
            </div>

            <div className="topbar-right">
                <div className="search-box">
                    <Search size={18} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Buscar transacciones..."
                        className="search-input"
                    />
                </div>

                <button className="topbar-btn" title="Notificaciones">
                    <Bell size={20} />
                    <span className="notification-badge">3</span>
                </button>
            </div>
        </header>
    );
});
