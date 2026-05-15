import { useState, useMemo } from 'react';
import { Calculator, Info, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import './Calculadora.css';

// Colombian tax rates 2024
const UVT_2024 = 47065; // COP per UVT

// Retención en la fuente honorarios (Art. 383 E.T.) — simplified table
function calcRteFte(monthlyIncome: number, isDeclarante: boolean): number {
    // Monthly payment: apply 11% if declarante de renta, else tabla marginal
    // Simplified: 11% if declarante; 10% if non-declarante (servicios profesionales)
    const rate = isDeclarante ? 0.11 : 0.10;
    const min = isDeclarante ? 1 * UVT_2024 : 4 * UVT_2024; // monthly threshold
    return monthlyIncome >= min ? monthlyIncome * rate : 0;
}

// ICA — varies by city and activity. Defaults: Bogotá actividades profesionales 9.66‰
const ICA_RATES: Record<string, { label: string; rate: number }> = {
    bogota: { label: 'Bogotá (9.66‰)', rate: 0.00966 },
    medellin: { label: 'Medellín (10‰)', rate: 0.010 },
    cali: { label: 'Cali (10‰)', rate: 0.010 },
    barranquilla: { label: 'Barranquilla (8‰)', rate: 0.008 },
    otro: { label: 'Otra ciudad (estimar)', rate: 0.01 },
};

// Renta anticipada: 1.5% of gross income (Art. 807 E.T.) — monthly estimate
function calcRentaAnticipada(monthlyIncome: number): number {
    return monthlyIncome * 0.015;
}

// GMF (4x1000) on withdrawals — informational
const GMF_RATE = 0.004;

function fmt(n: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
}

interface Result {
    gross: number;
    rteFte: number;
    ica: number;
    rentaAnticipada: number;
    gmf: number;
    totalDeductions: number;
    net: number;
    effectiveRate: number;
}

export function Calculadora() {
    const [monthlyIncome, setMonthlyIncome] = useState('');
    const [isDeclarante, setIsDeclarante] = useState(false);
    const [city, setCity] = useState('bogota');
    const [includeIca, setIncludeIca] = useState(true);
    const [includeRenta, setIncludeRenta] = useState(true);
    const [showGmf, setShowGmf] = useState(false);

    const result = useMemo((): Result | null => {
        const gross = parseFloat(monthlyIncome.replace(/[^0-9.]/g, ''));
        if (!gross || gross <= 0) return null;

        const rteFte = calcRteFte(gross, isDeclarante);
        const ica = includeIca ? gross * ICA_RATES[city].rate : 0;
        const rentaAnticipada = includeRenta ? calcRentaAnticipada(gross) : 0;
        const gmf = showGmf ? gross * GMF_RATE : 0;
        const totalDeductions = rteFte + ica + rentaAnticipada + gmf;
        const net = gross - totalDeductions;
        const effectiveRate = (totalDeductions / gross) * 100;

        return { gross, rteFte, ica, rentaAnticipada, gmf, totalDeductions, net, effectiveRate };
    }, [monthlyIncome, isDeclarante, city, includeIca, includeRenta, showGmf]);

    const handleExport = () => {
        if (!result) return;
        const rows = [
            { Concepto: 'Ingresos brutos', Valor: result.gross },
            { Concepto: 'Retención en la fuente', Valor: -result.rteFte },
            { Concepto: 'ICA', Valor: -result.ica },
            { Concepto: 'Renta anticipada (1.5%)', Valor: -result.rentaAnticipada },
            { Concepto: 'GMF (4x1000)', Valor: -result.gmf },
            { Concepto: 'Total deducciones', Valor: -result.totalDeductions },
            { Concepto: 'Neto estimado', Valor: result.net },
            { Concepto: 'Tasa efectiva', Valor: `${result.effectiveRate.toFixed(1)}%` },
        ];
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Calculadora');
        XLSX.writeFile(wb, 'calculo_impuestos_freelancer.xlsx');
    };

    return (
        <div className="calc-page animate-fadeIn">
            <div className="calc-header">
                <div className="calc-header-icon"><Calculator size={24} /></div>
                <div>
                    <h1 className="calc-title">Calculadora Freelancer</h1>
                    <p className="calc-subtitle">Estima tus retenciones mensuales como independiente en Colombia</p>
                </div>
            </div>

            <div className="calc-layout">
                {/* Inputs */}
                <div className="calc-inputs-card">
                    <h2 className="calc-section-title">Datos del mes</h2>

                    <div className="calc-field">
                        <label className="calc-label">Ingresos brutos del mes (COP)</label>
                        <input
                            type="number"
                            className="form-input"
                            placeholder="Ej: 5000000"
                            value={monthlyIncome}
                            onChange={e => setMonthlyIncome(e.target.value)}
                            min="0"
                        />
                    </div>

                    <div className="calc-field">
                        <label className="calc-label">Ciudad principal de actividad</label>
                        <select className="form-select" value={city} onChange={e => setCity(e.target.value)}>
                            {Object.entries(ICA_RATES).map(([k, v]) => (
                                <option key={k} value={k}>{v.label}</option>
                            ))}
                        </select>
                    </div>

                    <h2 className="calc-section-title" style={{ marginTop: '1.5rem' }}>Opciones</h2>

                    <div className="calc-toggle-row">
                        <div className="calc-toggle-info">
                            <span className="calc-toggle-label">¿Eres declarante de renta?</span>
                            <span className="calc-toggle-hint">Afecta la tarifa de RteFte (11% vs 10%)</span>
                        </div>
                        <button
                            type="button"
                            className={`toggle-switch ${isDeclarante ? 'on' : ''}`}
                            onClick={() => setIsDeclarante(v => !v)}
                        >
                            <span className="toggle-knob" />
                        </button>
                    </div>

                    <div className="calc-toggle-row">
                        <div className="calc-toggle-info">
                            <span className="calc-toggle-label">Incluir ICA mensual</span>
                            <span className="calc-toggle-hint">Impuesto de industria y comercio</span>
                        </div>
                        <button
                            type="button"
                            className={`toggle-switch ${includeIca ? 'on' : ''}`}
                            onClick={() => setIncludeIca(v => !v)}
                        >
                            <span className="toggle-knob" />
                        </button>
                    </div>

                    <div className="calc-toggle-row">
                        <div className="calc-toggle-info">
                            <span className="calc-toggle-label">Provisionar renta anticipada</span>
                            <span className="calc-toggle-hint">1.5% mensual para cubrir declaración anual</span>
                        </div>
                        <button
                            type="button"
                            className={`toggle-switch ${includeRenta ? 'on' : ''}`}
                            onClick={() => setIncludeRenta(v => !v)}
                        >
                            <span className="toggle-knob" />
                        </button>
                    </div>

                    <div className="calc-toggle-row">
                        <div className="calc-toggle-info">
                            <span className="calc-toggle-label">Considerar GMF (4×1000)</span>
                            <span className="calc-toggle-hint">Si retiras de cuenta bancaria</span>
                        </div>
                        <button
                            type="button"
                            className={`toggle-switch ${showGmf ? 'on' : ''}`}
                            onClick={() => setShowGmf(v => !v)}
                        >
                            <span className="toggle-knob" />
                        </button>
                    </div>
                </div>

                {/* Results */}
                <div className="calc-results-col">
                    {result ? (
                        <>
                            <div className="calc-net-card">
                                <span className="calc-net-label">Neto estimado</span>
                                <span className="calc-net-value">{fmt(result.net)}</span>
                                <span className="calc-net-rate">Tasa efectiva: {result.effectiveRate.toFixed(1)}%</span>
                            </div>

                            <div className="calc-breakdown-card">
                                <h3 className="calc-section-title">Desglose</h3>
                                <div className="calc-breakdown-list">
                                    <div className="calc-breakdown-row gross">
                                        <span>Ingresos brutos</span>
                                        <span>{fmt(result.gross)}</span>
                                    </div>
                                    {result.rteFte > 0 && (
                                        <div className="calc-breakdown-row deduction">
                                            <span>Retención en la fuente ({isDeclarante ? '11%' : '10%'})</span>
                                            <span>− {fmt(result.rteFte)}</span>
                                        </div>
                                    )}
                                    {result.ica > 0 && (
                                        <div className="calc-breakdown-row deduction">
                                            <span>ICA ({(ICA_RATES[city].rate * 1000).toFixed(2)}‰)</span>
                                            <span>− {fmt(result.ica)}</span>
                                        </div>
                                    )}
                                    {result.rentaAnticipada > 0 && (
                                        <div className="calc-breakdown-row deduction">
                                            <span>Provisión renta (1.5%)</span>
                                            <span>− {fmt(result.rentaAnticipada)}</span>
                                        </div>
                                    )}
                                    {result.gmf > 0 && (
                                        <div className="calc-breakdown-row deduction">
                                            <span>GMF (4×1000)</span>
                                            <span>− {fmt(result.gmf)}</span>
                                        </div>
                                    )}
                                    <div className="calc-breakdown-row total">
                                        <span>Total deducciones</span>
                                        <span>− {fmt(result.totalDeductions)}</span>
                                    </div>
                                    <div className="calc-breakdown-row net">
                                        <span>Neto</span>
                                        <span>{fmt(result.net)}</span>
                                    </div>
                                </div>

                                <button type="button" className="btn btn-secondary calc-export-btn" onClick={handleExport}>
                                    <Download size={15} /> Exportar a Excel
                                </button>
                            </div>

                            <div className="calc-info-card">
                                <Info size={14} />
                                <p>
                                    Este cálculo es una <strong>estimación referencial</strong>. Las tarifas reales
                                    dependen de tu actividad económica, si eres responsable de IVA y las resoluciones
                                    vigentes de la DIAN. Consulta con tu contador para declaraciones oficiales.
                                </p>
                            </div>
                        </>
                    ) : (
                        <div className="calc-empty">
                            <Calculator size={48} />
                            <p>Ingresa tus ingresos del mes para ver el cálculo</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
