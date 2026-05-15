import { useState, useEffect } from 'react';

interface Rates { [currency: string]: number }

const CACHE_KEY = 'bc-fx-rates';
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 h

function loadCache(): { rates: Rates; base: string; ts: number } | null {
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const d = JSON.parse(raw);
        if (Date.now() - d.ts > CACHE_TTL) return null;
        return d;
    } catch { return null; }
}

function saveCache(base: string, rates: Rates) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ base, rates, ts: Date.now() })); } catch { /* ignore */ }
}

export function useExchangeRates(baseCurrency: string) {
    const [rates, setRates] = useState<Rates>({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const cached = loadCache();
        if (cached && cached.base === baseCurrency) { setRates(cached.rates); return; }

        setLoading(true);
        fetch(`https://api.frankfurter.app/latest?from=${baseCurrency}`)
            .then(r => r.json())
            .then((data: { rates: Rates }) => {
                const r = { ...data.rates, [baseCurrency]: 1 };
                setRates(r);
                saveCache(baseCurrency, r);
            })
            .catch(() => setRates({ [baseCurrency]: 1 }))
            .finally(() => setLoading(false));
    }, [baseCurrency]);

    const convert = (amount: number, fromCurrency: string): number => {
        if (fromCurrency === baseCurrency) return amount;
        const fromRate = rates[fromCurrency];
        if (!fromRate) return amount; // fallback: treat as base currency
        // baseCurrency → fromCurrency rate means 1 baseCurrency = fromRate fromCurrency
        // so 1 fromCurrency = 1/fromRate baseCurrency
        return amount / fromRate;
    };

    return { rates, loading, convert };
}
