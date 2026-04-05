import { Outlet, Navigate } from 'react-router-dom';
import { useState, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppLayout() {
    const { user, loading, profile } = useAuth();
    useKeyboardShortcuts();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);
    const openSidebar = useCallback(() => setIsSidebarOpen(true), []);

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="loading-spinner"></div>
                <p>Cargando...</p>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (profile && !profile.onboarding_completed) {
        return <Navigate to="/onboarding" replace />;
    }

    return (
        <div className="app-layout">
            <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />
            <main className="main-content">
                <TopBar onMenuClick={openSidebar} />
                <div className="page-content">
                    <Outlet />
                    <footer className="app-footer">
                        <p>Todos los derechos &copy; BC FactoryIA SAS 2026</p>
                    </footer>
                </div>
            </main>
        </div>
    );
}
