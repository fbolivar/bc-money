import { Outlet, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppLayout() {
    const { user, loading, profile } = useAuth();

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

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Redirect to onboarding if not completed
    if (profile && !profile.onboarding_completed) {
        return <Navigate to="/onboarding" replace />;
    }

    return (
        <div className="app-layout">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
            <main className="main-content">
                <TopBar onMenuClick={() => setIsSidebarOpen(true)} />
                <div className="page-content">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
