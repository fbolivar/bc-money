import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { MarketProduct } from '../lib/supabase';

export type RecType = 'goes_with' | 'missing_typical' | 'last_time' | 'frequent';

export interface Recommendation {
    product: MarketProduct;
    type: RecType;
    count: number;
}

interface RawRow {
    product_id: string;
    frequency: number;
    in_last_list: boolean;
    co_occurrence: number;
}

function classify(row: RawRow, selectedSet: Set<string>): RecType {
    if (row.co_occurrence > 0) return 'goes_with';
    if (row.frequency >= 3 && !selectedSet.has(row.product_id)) return 'missing_typical';
    if (row.in_last_list) return 'last_time';
    return 'frequent';
}

export function useRecommendations(
    storeId: string | null,
    allProducts: MarketProduct[],
    selectedIds: string[],   // all selected product IDs, across ALL stores
) {
    const [recs, setRecs] = useState<Recommendation[]>([]);
    const [loading, setLoading] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const mountedRef = useRef(true);
    useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

    const load = useCallback(async (sid: string, selected: string[]) => {
        setLoading(true);
        const { data, error } = await supabase.rpc('get_store_recommendations', {
            p_store_id: sid,
            p_all_selected_ids: selected,
        });

        if (!mountedRef.current) return;

        if (!error && data) {
            const selSet = new Set(selected);
            const results = (data as RawRow[])
                .filter(row => !selSet.has(row.product_id))
                .map(row => {
                    const product = allProducts.find(p => p.id === row.product_id);
                    if (!product) return null;
                    return {
                        product,
                        type: classify(row, selSet),
                        count: Math.max(row.frequency, row.co_occurrence),
                    } as Recommendation;
                })
                .filter((r): r is Recommendation => r !== null);
            setRecs(results);
        } else {
            setRecs([]);
        }
        setLoading(false);
    }, [allProducts]);

    // Debounce so rapid selection changes don't spam the DB
    useEffect(() => {
        if (!storeId) { setRecs([]); return; }
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => load(storeId, selectedIds), 450);
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storeId, selectedIds.join(','), load]);

    return { recs, loading };
}
