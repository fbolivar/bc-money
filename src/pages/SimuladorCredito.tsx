import { useState, useMemo } from 'react';
import { Calculator, TrendingDown, DollarSign, Calendar, Info } from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useAuth } from '../hooks/useAuth';
import './SimuladorCredito.css';

const SMMLV_2025 = 1_423_500; // COP

const PRESETS = [
    { label: 'VIS Hipotecario', tasa: 12.5, plazo: 240, desc: 'Vivienda de interés social — tasa referencia 2025' },
    { label: 'No VIS Hipotecario', tasa: 14.5, plazo: 180, desc: 'Vivienda no VIS — tasa referencia 2025' },
    { label: 'Libre Destino', tasa: 21.0, plazo: 60, desc: 'Crédito personal — tasa promedio bancos Colombia' },
    { label: 'Vehículo', tasa: 15.5, plazo: 60, desc: 'Crédito vehículo nuevo — tasa promedio 2025' },
    { label: 'Educativo', tasa: 10.5, plazo: 120, desc: 'Crédito educativo ICETEX / banco' },
    { label: 'Personalizado', tasa: 0, plazo: 0, desc: 'Ingresa tu propia tasa y plazo' },
];

function calcAmortizacion(monto: number, tasaAnual: number, plazoMeses: number) {
    if (!monto || !tasaAnual || !plazoMeses) return [];
    const r = tasaAnual / 100 / 12;
    const cuota = (monto * r * Math.pow(1 + r, plazoMeses)) / (Math.pow(1 + r, plazoMeses) - 1);
    let saldo = monto;
    const tabla = [];
    for (let i = 1; i <= plazoMeses; i++) {
        const interes = saldo * r;
        const capital = cuota - interes;
        saldo = Math.max(0, saldo - capital);
        tabla.push({ mes: i, cuota, capital, interes, saldo });
    }
    return tabla;
}

function fmt(v: number, decimals = 0) {
    return v.toLocaleString('es-CO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function SimuladorCredito() {
    const { profile } = useAuth();
    const currency = profile?.currency ?? 'COP';
    const isCOP = currency === 'COP';

    const [presetIdx, setPresetIdx] = useState(0);
    const [monto, setMonto] = useState('');
    const [tasa, setTasa] = useState('');
    const [plazo, setPlazo] = useState('');
    const [ingresos, setIngresos] = useState('');
    const [showTabla, setShowTabla] = useState(false);

    const preset = PRESETS[presetIdx];
    const tasaEfectiva = presetIdx < PRESETS.length - 1 ? preset.tasa : parseFloat(tasa) || 0;
    const plazoEfectivo = presetIdx < PRESETS.length - 1 ? preset.plazo : parseInt(plazo) || 0;
    const montoNum = parseFloat(monto.replace(/\./g, '').replace(',', '.')) || 0;

    const tabla = useMemo(
        () => calcAmortizacion(montoNum, tasaEfectiva, plazoEfectivo),
        [montoNum, tasaEfectiva, plazoEfectivo],
    );

    const cuotaMensual = tabla[0]?.cuota ?? 0;
    const totalPagar = cuotaMensual * plazoEfectivo;
    const totalIntereses = totalPagar - montoNum;
    const relacionCuotaIngreso = ingresos ? (cuotaMensual / (parseFloat(ingresos.replace(/\./g, '')) || 1)) * 100 : null;
    const smmlvEquiv = isCOP && cuotaMensual > 0 ? cuotaMensual / SMMLV_2025 : null;

    // Para gráfica: capital vs interés acumulado por semestre
    const chartData = useMemo(() => {
        if (!tabla.length) return [];
        const step = Math.max(1, Math.floor(plazoEfectivo / 24));
        return tabla
            .filter((_, i) => i % step === 0 || i === tabla.length - 1)
            .map(r => ({
                mes: r.mes,
                capital: Math.round(montoNum - r.saldo),
                interes: Math.round(r.mes * r.cuota - (montoNum - r.saldo)),
                saldo: Math.round(r.saldo),
            }));
    }, [tabla, montoNum, plazoEfectivo]);

    const isValid = montoNum > 0 && tasaEfectiva > 0 && plazoEfectivo > 0;

    return (
        <div className="sim-page">
            <div className="sim-header">
                <Calculator size={28} />
                <div>
                    <h1>Simulador de Crédito</h1>
                    <p>Calcula cuota, intereses y tabla de amortización</p>
                </div>
            </div>

            <div className="sim-layout">
                {/* ── Panel izquierdo: entradas ── */}
                <div className="sim-panel">
                    {/* Presets */}
                    <div className="sim-section">
                        <label className="sim-label">Tipo de crédito</label>
                        <div className="sim-presets">
                            {PRESETS.map((p, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    className={`sim-preset-btn ${presetIdx === i ? 'active' : ''}`}
                                    onClick={() => {
                                        setPresetIdx(i);
                                        if (i < PRESETS.length - 1) {
                                            setTasa(String(p.tasa));
                                            setPlazo(String(p.plazo));
                                        }
                                    }}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                        {preset.desc && (
                            <p className="sim-preset-desc">
                                <Info size={13} /> {preset.desc}
                            </p>
                        )}
                    </div>

                    {/* Monto */}
                    <div className="sim-section">
                        <label className="sim-label">Monto del crédito ({currency})</label>
                        <input
                            type="text"
                            className="sim-input"
                            placeholder={isCOP ? 'Ej: 100.000.000' : 'Ej: 50000'}
                            value={monto}
                            onChange={e => setMonto(e.target.value)}
                        />
                        {isCOP && montoNum > 0 && (
                            <span className="sim-hint">{(montoNum / SMMLV_2025).toFixed(1)} SMMLV</span>
                        )}
                    </div>

                    {/* Tasa */}
                    <div className="sim-row">
                        <div className="sim-section">
                            <label className="sim-label">Tasa E.A. (%)</label>
                            <input
                                type="number"
                                className="sim-input"
                                placeholder="Ej: 14.5"
                                value={tasa}
                                onChange={e => setTasa(e.target.value)}
                                disabled={presetIdx < PRESETS.length - 1}
                                min="0"
                                max="100"
                                step="0.1"
                            />
                            {tasaEfectiva > 0 && (
                                <span className="sim-hint">Mensual: {(tasaEfectiva / 12).toFixed(3)}%</span>
                            )}
                        </div>
                        <div className="sim-section">
                            <label className="sim-label">Plazo (meses)</label>
                            <input
                                type="number"
                                className="sim-input"
                                placeholder="Ej: 120"
                                value={plazo}
                                onChange={e => setPlazo(e.target.value)}
                                disabled={presetIdx < PRESETS.length - 1}
                                min="1"
                                max="360"
                            />
                            {plazoEfectivo > 0 && (
                                <span className="sim-hint">{(plazoEfectivo / 12).toFixed(1)} años</span>
                            )}
                        </div>
                    </div>

                    {/* Ingresos */}
                    <div className="sim-section">
                        <label className="sim-label">Ingresos mensuales ({currency}) <span className="sim-optional">— opcional</span></label>
                        <input
                            type="text"
                            className="sim-input"
                            placeholder={isCOP ? 'Ej: 5.000.000' : 'Ej: 3000'}
                            value={ingresos}
                            onChange={e => setIngresos(e.target.value)}
                        />
                        <span className="sim-hint">Para calcular la relación cuota/ingreso (recomendado máx. 30%)</span>
                    </div>
                </div>

                {/* ── Panel derecho: resultados ── */}
                <div className="sim-results-panel">
                    {!isValid ? (
                        <div className="sim-empty">
                            <Calculator size={48} strokeWidth={1} />
                            <p>Completa los datos del crédito para ver los resultados</p>
                        </div>
                    ) : (
                        <>
                            {/* KPIs */}
                            <div className="sim-kpis">
                                <div className="sim-kpi sim-kpi--primary">
                                    <DollarSign size={20} />
                                    <span className="sim-kpi-label">Cuota mensual</span>
                                    <span className="sim-kpi-value">{currency} {fmt(cuotaMensual)}</span>
                                    {smmlvEquiv && (
                                        <span className="sim-kpi-sub">{smmlvEquiv.toFixed(2)} SMMLV</span>
                                    )}
                                </div>
                                <div className="sim-kpi">
                                    <TrendingDown size={20} />
                                    <span className="sim-kpi-label">Total intereses</span>
                                    <span className="sim-kpi-value">{currency} {fmt(totalIntereses)}</span>
                                    <span className="sim-kpi-sub">{((totalIntereses / montoNum) * 100).toFixed(1)}% del capital</span>
                                </div>
                                <div className="sim-kpi">
                                    <Calendar size={20} />
                                    <span className="sim-kpi-label">Total a pagar</span>
                                    <span className="sim-kpi-value">{currency} {fmt(totalPagar)}</span>
                                    <span className="sim-kpi-sub">{plazoEfectivo} cuotas</span>
                                </div>
                                {relacionCuotaIngreso !== null && (
                                    <div className={`sim-kpi ${relacionCuotaIngreso > 30 ? 'sim-kpi--danger' : relacionCuotaIngreso > 20 ? 'sim-kpi--warn' : 'sim-kpi--ok'}`}>
                                        <Info size={20} />
                                        <span className="sim-kpi-label">Cuota / Ingreso</span>
                                        <span className="sim-kpi-value">{relacionCuotaIngreso.toFixed(1)}%</span>
                                        <span className="sim-kpi-sub">
                                            {relacionCuotaIngreso > 30 ? 'Por encima del límite recomendado' : relacionCuotaIngreso > 20 ? 'Dentro del rango aceptable' : 'Excelente capacidad de pago'}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Gráfica amortización */}
                            <div className="sim-chart-section">
                                <h3>Evolución del crédito</h3>
                                <ResponsiveContainer width="100%" height={260}>
                                    <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="capGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.05} />
                                            </linearGradient>
                                            <linearGradient id="intGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#EF4444" stopOpacity={0.05} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                        <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} axisLine={false} tickLine={false} label={{ value: 'Mes', position: 'insideBottom', offset: -2, fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1_000_000).toFixed(0)}M`} />
                                        <Tooltip
                                            contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: '0.8rem' }}
                                            formatter={(v: number, name: string) => [`${currency} ${fmt(v)}`, name === 'capital' ? 'Capital pagado' : name === 'interes' ? 'Intereses pagados' : 'Saldo']}
                                        />
                                        <Legend formatter={v => v === 'capital' ? 'Capital pagado' : v === 'interes' ? 'Intereses pagados' : 'Saldo pendiente'} />
                                        <Area type="monotone" dataKey="capital" stroke="#3B82F6" fill="url(#capGrad)" strokeWidth={2} />
                                        <Area type="monotone" dataKey="interes" stroke="#EF4444" fill="url(#intGrad)" strokeWidth={2} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Tabla de amortización */}
                            <div className="sim-tabla-section">
                                <button
                                    type="button"
                                    className="sim-tabla-toggle"
                                    onClick={() => setShowTabla(v => !v)}
                                >
                                    {showTabla ? 'Ocultar' : 'Ver'} tabla de amortización ({tabla.length} cuotas)
                                </button>
                                {showTabla && (
                                    <div className="sim-tabla-wrap">
                                        <table className="sim-tabla">
                                            <thead>
                                                <tr>
                                                    <th>#</th>
                                                    <th>Cuota</th>
                                                    <th>Capital</th>
                                                    <th>Interés</th>
                                                    <th>Saldo</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {tabla.map(r => (
                                                    <tr key={r.mes}>
                                                        <td>{r.mes}</td>
                                                        <td>{fmt(r.cuota)}</td>
                                                        <td className="capital">{fmt(r.capital)}</td>
                                                        <td className="interes">{fmt(r.interes)}</td>
                                                        <td>{fmt(r.saldo)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
