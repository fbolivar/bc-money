import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useRealtimeSync(userId: string | undefined, onUpdate: () => void) {
    useEffect(() => {
        if (!userId) return;

        const txChannel = supabase
            .channel(`realtime-transactions-${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${userId}` }, () => onUpdate())
            .subscribe();

        const accChannel = supabase
            .channel(`realtime-accounts-${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts', filter: `user_id=eq.${userId}` }, () => onUpdate())
            .subscribe();

        return () => {
            supabase.removeChannel(txChannel);
            supabase.removeChannel(accChannel);
        };
    }, [userId, onUpdate]);
}
