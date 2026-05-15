import { useState, useEffect, useCallback } from 'react';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import './AppTour.css';

interface TourStep {
    target: string;
    title: string;
    description: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
}

const STEPS: TourStep[] = [
    {
        target: '.dash-metrics',
        title: 'Tu resumen del mes',
        description: 'Aquí ves de un vistazo tus ingresos, gastos, balance y tasa de ahorro del mes actual.',
        position: 'bottom',
    },
    {
        target: '.fab-quick-add',
        title: 'Agregar rápido',
        description: 'Toca este botón para registrar un gasto o ingreso en segundos, sin salir de la pantalla.',
        position: 'top',
    },
    {
        target: '.hs-widget',
        title: 'Salud financiera',
        description: 'Tu puntuación 0-100 basada en ahorro, deudas, fondo de emergencia y presupuestos cumplidos.',
        position: 'bottom',
    },
    {
        target: '.dash-quick-actions',
        title: 'Accesos rápidos',
        description: 'Registra ingresos y gastos, revisa tus cuentas y metas desde aquí.',
        position: 'top',
    },
    {
        target: '.topbar',
        title: 'Búsqueda global',
        description: 'Usa el campo de búsqueda para encontrar cualquier transacción por descripción, comercio o monto.',
        position: 'bottom',
    },
    {
        target: '.sidebar-nav',
        title: '¡Todo listo!',
        description: 'El menú lateral tiene todo: presupuestos, metas, deudas, inversiones, reportes y más. Explora a tu ritmo.',
        position: 'right',
    },
];

const TOUR_KEY = 'app_tour_done_v1';

interface Rect { top: number; left: number; width: number; height: number; }

interface Props {
    onDone: () => void;
}

export function AppTour({ onDone }: Props) {
    const [step, setStep] = useState(0);
    const [targetRect, setTargetRect] = useState<Rect | null>(null);

    const measureTarget = useCallback((selector: string) => {
        const el = document.querySelector(selector);
        if (!el) { setTargetRect(null); return; }
        const r = el.getBoundingClientRect();
        setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }, []);

    useEffect(() => {
        measureTarget(STEPS[step].target);
        const onResize = () => measureTarget(STEPS[step].target);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [step, measureTarget]);

    function finish() {
        localStorage.setItem(TOUR_KEY, '1');
        onDone();
    }

    function next() {
        if (step < STEPS.length - 1) setStep(s => s + 1);
        else finish();
    }

    function prev() {
        if (step > 0) setStep(s => s - 1);
    }

    const current = STEPS[step];
    const PAD = 8;

    // Compute tooltip position
    let tooltipStyle: React.CSSProperties = {};
    const TW = 300, TH = 140;

    if (targetRect) {
        const pos = current.position || 'bottom';
        const vh = window.innerHeight;
        const vw = window.innerWidth;

        if (pos === 'bottom') {
            tooltipStyle = {
                top: Math.min(targetRect.top + targetRect.height + PAD, vh - TH - 16),
                left: Math.max(16, Math.min(targetRect.left + targetRect.width / 2 - TW / 2, vw - TW - 16)),
            };
        } else if (pos === 'top') {
            tooltipStyle = {
                top: Math.max(16, targetRect.top - TH - PAD),
                left: Math.max(16, Math.min(targetRect.left + targetRect.width / 2 - TW / 2, vw - TW - 16)),
            };
        } else if (pos === 'right') {
            tooltipStyle = {
                top: Math.max(16, Math.min(targetRect.top + targetRect.height / 2 - TH / 2, vh - TH - 16)),
                left: Math.min(targetRect.left + targetRect.width + PAD, vw - TW - 16),
            };
        } else {
            tooltipStyle = {
                top: Math.max(16, Math.min(targetRect.top + targetRect.height / 2 - TH / 2, vh - TH - 16)),
                left: Math.max(16, targetRect.left - TW - PAD),
            };
        }
    } else {
        // Centered fallback
        tooltipStyle = {
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
        };
    }

    return (
        <div className="tour-overlay">
            {/* Spotlight cutout */}
            {targetRect && (
                <svg className="tour-spotlight" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <mask id="tour-mask">
                            <rect width="100%" height="100%" fill="white" />
                            <rect
                                x={targetRect.left - PAD}
                                y={targetRect.top - PAD}
                                width={targetRect.width + PAD * 2}
                                height={targetRect.height + PAD * 2}
                                rx={10}
                                fill="black"
                            />
                        </mask>
                    </defs>
                    <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#tour-mask)" />
                </svg>
            )}
            {!targetRect && <div className="tour-backdrop" />}

            {/* Tooltip */}
            <div className="tour-tooltip" style={tooltipStyle}>
                <div className="tour-tt-header">
                    <span className="tour-step-label">Paso {step + 1} de {STEPS.length}</span>
                    <button type="button" className="tour-skip" onClick={finish} title="Saltar tour"><X size={15} /></button>
                </div>
                <h3 className="tour-tt-title">{current.title}</h3>
                <p className="tour-tt-desc">{current.description}</p>
                <div className="tour-tt-footer">
                    <div className="tour-dots">
                        {STEPS.map((_, i) => <span key={i} className={`tour-dot ${i === step ? 'active' : ''}`} />)}
                    </div>
                    <div className="tour-tt-nav">
                        {step > 0 && (
                            <button type="button" className="tour-btn-prev" onClick={prev}><ChevronLeft size={16} /></button>
                        )}
                        <button type="button" className="tour-btn-next" onClick={next}>
                            {step < STEPS.length - 1 ? <><span>Siguiente</span><ChevronRight size={16} /></> : <span>¡Listo!</span>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function shouldShowTour(): boolean {
    return !localStorage.getItem(TOUR_KEY);
}
