import { useLocation } from 'react-router-dom';
import { Sun, Moon, Bell, Search, Menu } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import './TopBar.css';

const pageTitles: Record<string, string> = {
    '/': 'Dashboard',
    '/transacciones': 'Transacciones',
    '/presupuestos': 'Presupuestos',
    '/metas': 'Metas',
    '/reportes': 'Reportes',
    '/asesor': 'Asesor Financiero',
    '/configuracion': 'Configuración',
    '/onboarding': 'Configuración Inicial',
};

interface TopBarProps {
    onMenuClick: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
    const { theme, toggleTheme } = useTheme();
    const location = useLocation();
    const pageTitle = pageTitles[location.pathname] || 'BC Money';

    return (
        <header className="topbar">
            <div className="topbar-left">
                <button className="menu-btn lg:hidden mr-2 p-2" onClick={onMenuClick} style={{ display: 'none' }}>
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

                <button
                    className="topbar-btn"
                    onClick={toggleTheme}
                    title={theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
                >
                    {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                </button>
            </div>
        </header>
    );
}
