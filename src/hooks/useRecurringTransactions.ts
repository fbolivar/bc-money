import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { format, startOfMonth, endOfMonth, subMonths, getDaysInMonth } from 'date-fns';

export function useRecurringTransactions(userId: string | undefined) {
    const [createdCount, setCreatedCount] = useState(0);
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        if (!userId) return;

        const now = new Date();
        const monthKey = format(now, 'yyyy-MM');
        const storageKey = `recurring_checked_${userId}_${monthKey}`;
        if (localStorage.getItem(storageKey)) { setChecked(true); return; }

        const prevMonth = subMonths(now, 1);
        const prevStart = format(startOfMonth(prevMonth), 'yyyy-MM-dd');
        const prevEnd = format(endOfMonth(prevMonth), 'yyyy-MM-dd');
        const curStart = format(startOfMonth(now), 'yyyy-MM-dd');
        const curEnd = format(endOfMonth(now), 'yyyy-MM-dd');

        async function run() {
            // Fetch recurring templates from last month
            const { data: templates } = await supabase
                .from('transactions')
                .select('id,user_id,amount,type,category_id,account_id,description,notes,merchant,is_essential,payment_method,is_recurring,recurrence_rule,recurrence_parent_id,tags,date')
                .eq('user_id', userId!)
                .eq('is_recurring', true)
                .gte('date', prevStart)
                .lte('date', prevEnd);

            if (!templates || templates.length === 0) {
                localStorage.setItem(storageKey, '1');
                setChecked(true);
                return;
            }

            // Determine root IDs so we can check if current month already has instances
            const rootIds = templates.map(t => t.recurrence_parent_id ?? t.id);

            const { data: existing } = await supabase
                .from('transactions')
                .select('recurrence_parent_id')
                .eq('user_id', userId!)
                .eq('is_recurring', true)
                .gte('date', curStart)
                .lte('date', curEnd)
                .in('recurrence_parent_id', rootIds);

            const alreadyCreated = new Set((existing || []).map(e => e.recurrence_parent_id));

            const toInsert = templates
                .filter(t => !alreadyCreated.has(t.recurrence_parent_id ?? t.id))
                .map(t => {
                    // Keep same day-of-month, clamped to days in current month
                    const origDay = parseInt(t.date.split('-')[2], 10);
                    const dayInCur = Math.min(origDay, getDaysInMonth(now));
                    const newDate = `${monthKey}-${String(dayInCur).padStart(2, '0')}`;
                    return {
                        user_id: userId!,
                        amount: t.amount,
                        type: t.type,
                        category_id: t.category_id,
                        account_id: t.account_id,
                        description: t.description,
                        notes: t.notes,
                        merchant: t.merchant,
                        is_essential: t.is_essential,
                        payment_method: t.payment_method,
                        is_recurring: true,
                        recurrence_rule: t.recurrence_rule,
                        recurrence_parent_id: t.recurrence_parent_id ?? t.id,
                        is_split: false,
                        tags: t.tags ?? [],
                        date: newDate,
                    };
                });

            if (toInsert.length > 0) {
                const { error } = await supabase.from('transactions').insert(toInsert);
                if (!error) setCreatedCount(toInsert.length);
            }

            localStorage.setItem(storageKey, '1');
            setChecked(true);
        }

        run();
    }, [userId]);

    return { checked, createdCount };
}
