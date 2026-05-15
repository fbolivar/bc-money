import { useState, useEffect, useCallback } from 'react';
import { Plane, ArrowLeftRight, RefreshCw, MapPin, DollarSign, Calculator } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import './ModoViaje.css';

const CURRENCIES = [
    { code: 'USD', flag: '🇺🇸', name: 'Dólar USA' },
    { code: 'EUR', flag: '🇪🇺', name: 'Euro' },
    { code: 'COP', flag: '🇨🇴', name: 'Peso colombiano' },
    { code: 'MXN', flag: '🇲🇽', name: 'Peso mexicano' },
    { code: 'BRL', flag: '🇧🇷', name: 'Real brasileño' },
    { code: 'ARS', flag: '🇦🇷', name: 'Peso argentino' },
    { code: 'CLP', flag: '🇨🇱', name: 'Peso chileno' },
    { code: 'PEN', flag: '🇵🇪', name: 'Sol peruano' },
    { code: 'GBP', flag: '🇬🇧', name: 'Libra esterlina' },
    { code: 'CAD', flag: '🇨🇦', name: 'Dólar canadiense' },
    { code: 'JPY', flag: '🇯🇵', name: 'Yen japonés' },
    { code: 'CHF', flag: '🇨🇭', name: 'Franco suizo' },
];

const COMMON_EXPENSES = [
    { emoji: '🍽️', label: 'Restaurante para 2', usd: 40 },
    { emoji: '🍺', label: 'Cerveza local', usd: 5 },
    { emoji: '☕', label: 'Café', usd: 4 },
    { emoji: '🚕', label: 'Taxi aeropuerto', usd: 25 },
    { emoji: '🚌', label: 'Transporte local', usd: 2 },
    { emoji: '🏨', label: 'Hotel noche (3★)', usd: 80 },
    { emoji: '🛍️', label: 'Compras básicas', usd: 50 },
    { emoji: '🎭', label: 'Atracción turística', usd: 20 },
];

function fmtCurrency(amount: number, code: string) {
    try {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency', currency: code,
            minimumFractionDigits: code === 'JPY' ? 0 : 2,
            maximumFractionDigits: code === 'JPY' ? 0 : 2,
        }).format(amount);
    } catch {
        return `${code} ${amount.toFixed(2)}`;
    }
}

export function ModoViaje() {
    const { profile } = useAuth();
    const homeCurrency = profile?.currency || 'COP';

    const [from, setFrom] = useState('USD');
    const [to, setTo] = useState(homeCurrency);
    const [amount, setAmount] = useState('100');
    const [rates, setRates] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState('');
    const [perDiem, setPerDiem] = useState('50');
    const [days, setDays] = useState('7');

    const fetchRates = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`https://api.frankfurter.app/latest?from=USD`);
            const data = await res.json();
            setRates({ ...data.rates, USD: 1 });
            setLastUpdate(new Date().toLocaleTimeString('es-CO'));
        } catch {
            /* silent */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchRates(); }, [fetchRates]);

    function convert(value: number, fromCode: string, toCode: string): number {
        if (!rates[fromCode] && fromCode !== 'USD') return 0;
        if (!rates[toCode] && toCode !== 'USD') return 0;
        const fromRate = fromCode === 'USD' ? 1 : rates[fromCode];
        const toRate = toCode === 'USD' ? 1 : rates[toCode];
        return (value / fromRate) * toRate;
    }

    const amountNum = parseFloat(amount) || 0;
    const converted = convert(amountNum, from, to);
    const rate = convert(1, from, to);

    const totalBudget = parseFloat(perDiem) * parseFloat(days) || 0;
    const totalInHome = convert(totalBudget, 'USD', homeCurrency);

    const swap = () => { setFrom(to); setTo(from); };

    return (
        <div className="viaje-page animate-fadeIn">
            <div className="viaje-header">
                <div>
                    <h1><Plane size={22} /> Modo Viaje</h1>
                    <p>Conversor de divisas y planificador de presupuesto</p>
                </div>
                <button type="button" className="btn btn-secondary" onClick={fetchRates} disabled={loading}>
                    <RefreshCw size={15} className={loading ? 'spin' : ''} />
                    {lastUpdate ? `Act. ${lastUpdate}` : 'Actualizar'}
                </button>
            </div>

            {/* Converter */}
            <div className="viaje-card">
                <h2><ArrowLeftRight size={16} /> Conversor</h2>
                <div className="viaje-converter">
                    <div className="vc-side">
                        <select className="vc-select" value={from} onChange={e => setFrom(e.target.value)} title="Moneda origen">
                            {CURRENCIES.map(c => (
                                <option key={c.code} value={c.code}>{c.flag} {c.code} — {c.name}</option>
                            ))}
                        </select>
                        <input
                            type="number"
                            className="vc-input"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            placeholder="0"
                            min="0"
                        />
                    </div>

                    <button type="button" className="vc-swap-btn" onClick={swap} title="Intercambiar monedas">
                        <ArrowLeftRight size={20} />
                    </button>

                    <div className="vc-side">
                        <select className="vc-select" value={to} onChange={e => setTo(e.target.value)} title="Moneda destino">
                            {CURRENCIES.map(c => (
                                <option key={c.code} value={c.code}>{c.flag} {c.code} — {c.name}</option>
                            ))}
                        </select>
                        <div className="vc-result">
                            {loading ? '...' : fmtCurrency(converted, to)}
                        </div>
                    </div>
                </div>
                <div className="vc-rate">
                    {!loading && rate > 0 && `1 ${from} = ${fmtCurrency(rate, to)}`}
                </div>
            </div>

            {/* Per Diem Budget */}
            <div className="viaje-card">
                <h2><Calculator size={16} /> Presupuesto de viaje</h2>
                <div className="viaje-perdiem-grid">
                    <div className="vp-field">
                        <label>Gasto diario (USD)</label>
                        <input type="number" className="form-input" value={perDiem} onChange={e => setPerDiem(e.target.value)} placeholder="50" min="0" />
                    </div>
                    <div className="vp-field">
                        <label>Días de viaje</label>
                        <input type="number" className="form-input" value={days} onChange={e => setDays(e.target.value)} placeholder="7" min="1" />
                    </div>
                </div>
                <div className="vp-total">
                    <div className="vpt-usd">
                        <span>Total en USD</span>
                        <strong>{fmtCurrency(totalBudget, 'USD')}</strong>
                    </div>
                    <div className="vpt-home">
                        <span>Equivalente en {homeCurrency}</span>
                        <strong>{loading ? '...' : fmtCurrency(totalInHome, homeCurrency)}</strong>
                    </div>
                </div>
            </div>

            {/* Common Expenses */}
            <div className="viaje-card">
                <h2><MapPin size={16} /> Gastos comunes en USD → {to}</h2>
                <div className="viaje-expenses-grid">
                    {COMMON_EXPENSES.map((exp, i) => (
                        <div key={i} className="ve-item">
                            <span className="ve-emoji">{exp.emoji}</span>
                            <span className="ve-label">{exp.label}</span>
                            <span className="ve-usd">~{fmtCurrency(exp.usd, 'USD')}</span>
                            <span className="ve-converted">
                                {loading ? '...' : fmtCurrency(convert(exp.usd, 'USD', to), to)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Quick reference */}
            <div className="viaje-card">
                <h2><DollarSign size={16} /> Referencia rápida — 1 USD</h2>
                <div className="viaje-ref-grid">
                    {CURRENCIES.filter(c => c.code !== 'USD').map(c => (
                        <div key={c.code} className="vr-item">
                            <span>{c.flag} {c.code}</span>
                            <strong>{loading ? '...' : fmtCurrency(rates[c.code] || 0, c.code)}</strong>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
