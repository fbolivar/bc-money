import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function useKeyboardShortcuts() {
    const navigate = useNavigate();

    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            // Only trigger with Ctrl/Cmd
            if (!e.ctrlKey && !e.metaKey) return;
            // Don't trigger in inputs
            const tag = (e.target as HTMLElement).tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

            switch (e.key) {
                case 'n': case 'N': e.preventDefault(); navigate('/transacciones?new=expense'); break;
                case 'i': case 'I': e.preventDefault(); navigate('/transacciones?new=income'); break;
                case 'b': case 'B': e.preventDefault(); navigate('/'); break;
                case 'k': case 'K': e.preventDefault(); document.querySelector<HTMLInputElement>('.search-input')?.focus(); break;
            }
        }
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [navigate]);
}
