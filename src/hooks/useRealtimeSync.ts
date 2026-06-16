import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

export const TX_SAVED_EVENT = 'bc-money:tx-saved';

export function dispatchTxSaved() {
    window.dispatchEvent(new CustomEvent(TX_SAVED_EVENT));
}

export function useRealtimeSync(userId: string | undefined, onUpdate: () => void) {
    useEffect(() => {
        if (!userId) return;

        let txChannel: ReturnType<typeof supabase.channel> | null = null;
        let accChannel: ReturnType<typeof supabase.channel> | null = null;

        try {
            txChannel = supabase
                .channel(`realtime-transactions-${userId}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${userId}` }, () => onUpdate())
                .subscribe();
        } catch { /* WebSocket unavailable — live sync disabled */ }

        try {
            accChannel = supabase
                .channel(`realtime-accounts-${userId}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts', filter: `user_id=eq.${userId}` }, () => onUpdate())
                .subscribe();
        } catch { /* WebSocket unavailable */ }

        // Fallback: listen for manual save events (e.g. from QuickAddModal)
        window.addEventListener(TX_SAVED_EVENT, onUpdate);

        return () => {
            if (txChannel) supabase.removeChannel(txChannel);
            if (accChannel) supabase.removeChannel(accChannel);
            window.removeEventListener(TX_SAVED_EVENT, onUpdate);
        };
    }, [userId, onUpdate]);
}
