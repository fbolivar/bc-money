import { useLocation } from 'react-router-dom';
import { Sun, Moon, Bell, Search } from 'lucide-react';
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

export function TopBar() {
    const { theme, toggleTheme } = useTheme();
    const location = useLocation();
    const pageTitle = pageTitles[location.pathname] || 'BC Money';

    return (
        <header className="topbar">
            <div className="topbar-left">
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
