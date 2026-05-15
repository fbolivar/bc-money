import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import {
    CreditCard, Plus, Pencil, Trash2, X, AlertTriangle,
    Calculator, ChevronDown, TrendingDown, Calendar, Info,
} from 'lucide-react';
import './TarjetasCredito.css';

interface Card {
    id: string;
    name: string;
    bank: string | null;
    last_four: string | null;
    credit_limit: number;
    current_balance: number;
    minimum_payment: number | null;
    payment_due_day: number | null;
    cut_day: number | null;
    interest_rate_monthly: number | null;
    currency: string;
    color: string;
    active: boolean;
    notes: string | null;
}

const CARD_COLORS = [
    '#6366f1', '#0ea5e9', '#10b981', '#f59e0b',
    '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6',
];

const BANKS = ['Bancolombia', 'Davivienda', 'BBVA', 'Banco de Bogotá', 'Scotiabank Colpatria', 'Itaú', 'Nequi', 'Otro'];

const EMPTY_FORM = {
    name: '', bank: '', last_four: '', credit_limit: '',
    current_balance: '', minimum_payment: '', payment_due_day: '',
    cut_day: '', interest_rate_monthly: '', currency: 'COP',
    color: '#6366f1', active: true, notes: '',
};

function utilizationClass(pct: number) {
    if (pct >= 70) return 'danger';
    if (pct >= 30) return 'warn';
    return 'good';
}

function daysUntil(day: number | null): number | null {
    if (!day) return null;
    const now = new Date();
    let next = new Date(now.getFullYear(), now.getMonth(), day);
    if (next <= now) next = new Date(now.getFullYear(), now.getMonth() + 1, day);
    return Math.ceil((next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function calcPayoff(balance: number, monthlyRate: number, monthlyPayment: number): { months: number; totalInterest: number } | null {
    if (monthlyPayment <= 0) return null;
    const interest = balance * monthlyRate;
    if (monthlyPayment <= interest) return null; // never pays off
    let b = balance;
    let totalInterest = 0;
    let months = 0;
    while (b > 0.01 && months < 600) {
        const i = b * monthlyRate;
        totalInterest += i;
        b = b + i - monthlyPayment;
        months++;
    }
    return { months, totalInterest };
}

export function TarjetasCredito() {
    const { user, profile } = useAuth();
    const currency = profile?.currency || 'COP';
    const [cards, setCards] = useState<Card[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<Card | null>(null);
    const [form, setForm] = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM, currency });
    const [saving, setSaving] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [calcCard, setCalcCard] = useState<Card | null>(null);
    const [calcPayment, setCalcPayment] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        const { data } = await supabase
            .from('credit_cards')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at');
        setCards(data || []);
        setLoading(false);
    }, [user]);

    useEffect(() => { load(); }, [load]);

    function openAdd() {
        setEditing(null);
        setForm({ ...EMPTY_FORM, currency });
        setShowForm(true);
    }

    function openEdit(c: Card) {
        setEditing(c);
        setForm({
            name: c.name, bank: c.bank || '', last_four: c.last_four || '',
            credit_limit: String(c.credit_limit),
            current_balance: String(c.current_balance),
            minimum_payment: c.minimum_payment != null ? String(c.minimum_payment) : '',
            payment_due_day: c.payment_due_day != null ? String(c.payment_due_day) : '',
            cut_day: c.cut_day != null ? String(c.cut_day) : '',
            interest_rate_monthly: c.interest_rate_monthly != null ? String(c.interest_rate_monthly) : '',
            currency: c.currency, color: c.color, active: c.active, notes: c.notes || '',
        });
        setShowForm(true);
    }

    async function handleSave() {
        if (!user || !form.name.trim() || !form.credit_limit) return;
        setSaving(true);
        const payload = {
            user_id: user.id,
            name: form.name.trim(),
            bank: form.bank.trim() || null,
            last_four: form.last_four.trim() || null,
            credit_limit: Number(form.credit_limit),
            current_balance: Number(form.current_balance) || 0,
            minimum_payment: form.minimum_payment ? Number(form.minimum_payment) : null,
            payment_due_day: form.payment_due_day ? Number(form.payment_due_day) : null,
            cut_day: form.cut_day ? Number(form.cut_day) : null,
            interest_rate_monthly: form.interest_rate_monthly ? Number(form.interest_rate_monthly) / 100 : null,
            currency: form.currency,
            color: form.color,
            active: form.active,
            notes: form.notes.trim() || null,
        };
        if (editing) {
            await supabase.from('credit_cards').update(payload).eq('id', editing.id);
        } else {
            await supabase.from('credit_cards').insert(payload);
        }
        setSaving(false);
        setShowForm(false);
        load();
    }

    async function handleDelete(id: string) {
        await supabase.from('credit_cards').delete().eq('id', id);
        setDeleteId(null);
        load();
    }

    function fmt(n: number, cur?: string) {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency', currency: cur || currency,
            minimumFractionDigits: 0, maximumFractionDigits: 0,
        }).format(n);
    }

    const activeCards = cards.filter(c => c.active);
    const totalLimit = activeCards.reduce((s, c) => s + c.credit_limit, 0);
    const totalBalance = activeCards.reduce((s, c) => s + c.current_balance, 0);
    const totalUtilization = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0;
    const totalMinPayment = activeCards.reduce((s, c) => s + (c.minimum_payment || 0), 0);

    // Payoff calc for modal
    const calcResult = calcCard && calcPayment && calcCard.interest_rate_monthly
        ? calcPayoff(calcCard.current_balance, calcCard.interest_rate_monthly, Number(calcPayment))
        : null;
    const calcMinResult = calcCard && calcCard.minimum_payment && calcCard.interest_rate_monthly
        ? calcPayoff(calcCard.current_balance, calcCard.interest_rate_monthly, calcCard.minimum_payment)
        : null;

    return (
        <div className="tc-page">
            {/* Summary */}
            <div className="tc-summary">
                <div className="tc-sum-card">
                    <CreditCard size={20} className="tc-sum-icon blue" />
                    <div>
                        <span>Cupo total</span>
                        <strong>{fmt(totalLimit)}</strong>
                    </div>
                </div>
                <div className="tc-sum-card">
                    <TrendingDown size={20} className="tc-sum-icon red" />
                    <div>
                        <span>Saldo utilizado</span>
                        <strong>{fmt(totalBalance)}</strong>
                    </div>
                </div>
                <div className={`tc-sum-card utilization ${utilizationClass(totalUtilization)}`}>
                    <div className="tc-util-ring">
                        <svg viewBox="0 0 36 36">
                            <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3" className="tc-ring-bg" />
                            <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3"
                                strokeDasharray={`${Math.min(totalUtilization, 100) * 0.942} 94.2`}
                                strokeLinecap="round"
                                className={`tc-ring-fill ${utilizationClass(totalUtilization)}`}
                                transform="rotate(-90 18 18)"
                            />
                        </svg>
                        <span>{Math.round(totalUtilization)}%</span>
                    </div>
                    <div>
                        <span>Utilización global</span>
                        <strong className={utilizationClass(totalUtilization)}>
                            {totalUtilization < 30 ? 'Saludable' : totalUtilization < 70 ? 'Moderada' : 'Alta'}
                        </strong>
                    </div>
                </div>
                <div className="tc-sum-card">
                    <Calendar size={20} className="tc-sum-icon orange" />
                    <div>
                        <span>Pago mínimo total</span>
                        <strong>{fmt(totalMinPayment)}</strong>
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="tc-toolbar">
                <h2 className="tc-toolbar-title">Mis Tarjetas ({activeCards.length})</h2>
                <button type="button" className="tc-add-btn" onClick={openAdd}>
                    <Plus size={16} /> Nueva tarjeta
                </button>
            </div>

            {/* Card grid */}
            {loading ? (
                <div className="tc-empty">Cargando...</div>
            ) : cards.length === 0 ? (
                <div className="tc-empty">
                    <CreditCard size={44} strokeWidth={1.2} />
                    <p>No tienes tarjetas registradas</p>
                    <button type="button" className="tc-add-btn" onClick={openAdd}>
                        <Plus size={15} /> Agregar tarjeta
                    </button>
                </div>
            ) : (
                <div className="tc-grid">
                    {cards.map(card => {
                        const util = card.credit_limit > 0 ? (card.current_balance / card.credit_limit) * 100 : 0;
                        const uCls = utilizationClass(util);
                        const daysPayment = daysUntil(card.payment_due_day);
                        const available = card.credit_limit - card.current_balance;
                        const isExpanded = expandedId === card.id;

                        return (
                            <div key={card.id} className={`tc-card-wrap ${!card.active ? 'tc-inactive' : ''}`}>
                                {/* Visual card */}
                                <div className="tc-visual" style={{ background: `linear-gradient(135deg, ${card.color}, ${card.color}cc)` }}>
                                    <div className="tc-visual-top">
                                        <span className="tc-visual-bank">{card.bank || 'Tarjeta'}</span>
                                        <div className="tc-visual-actions">
                                            <button type="button" title="Calculadora de pago" onClick={() => { setCalcCard(card); setCalcPayment(String(card.minimum_payment || '')); }}>
                                                <Calculator size={14} />
                                            </button>
                                            <button type="button" title="Editar" onClick={() => openEdit(card)}>
                                                <Pencil size={14} />
                                            </button>
                                            <button type="button" title="Eliminar" onClick={() => setDeleteId(card.id)}>
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="tc-visual-name">{card.name}</div>
                                    <div className="tc-visual-bottom">
                                        <span className="tc-visual-num">
                                            {card.last_four ? `•••• ${card.last_four}` : '•••• ••••'}
                                        </span>
                                        {daysPayment !== null && (
                                            <span className={`tc-visual-due ${daysPayment <= 3 ? 'urgent' : daysPayment <= 7 ? 'warn' : ''}`}>
                                                Pago en {daysPayment}d
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Stats */}
                                <div className="tc-card-stats">
                                    <div className="tc-util-row">
                                        <div className="tc-util-labels">
                                            <span className="tc-util-used">{fmt(card.current_balance, card.currency)} usado</span>
                                            <span className={`tc-util-pct ${uCls}`}>{util.toFixed(1)}%</span>
                                        </div>
                                        <div className="tc-util-bar-wrap">
                                            <div className={`tc-util-bar ${uCls}`} style={{ width: `${Math.min(util, 100)}%` }} />
                                        </div>
                                        <div className="tc-util-labels">
                                            <span className="tc-util-avail">Disponible: {fmt(available, card.currency)}</span>
                                            <span className="tc-util-limit">Cupo: {fmt(card.credit_limit, card.currency)}</span>
                                        </div>
                                    </div>

                                    <button type="button" className="tc-expand-btn" onClick={() => setExpandedId(isExpanded ? null : card.id)}>
                                        {isExpanded ? 'Menos detalle' : 'Ver detalle'}
                                        <ChevronDown size={13} className={isExpanded ? 'rotated' : ''} />
                                    </button>

                                    {isExpanded && (
                                        <div className="tc-detail">
                                            {card.minimum_payment != null && (
                                                <div className="tc-detail-row">
                                                    <span>Pago mínimo</span>
                                                    <strong>{fmt(card.minimum_payment, card.currency)}</strong>
                                                </div>
                                            )}
                                            {card.payment_due_day != null && (
                                                <div className="tc-detail-row">
                                                    <span>Fecha de pago</span>
                                                    <strong>Día {card.payment_due_day} {daysPayment !== null ? `(${daysPayment}d)` : ''}</strong>
                                                </div>
                                            )}
                                            {card.cut_day != null && (
                                                <div className="tc-detail-row">
                                                    <span>Fecha de corte</span>
                                                    <strong>Día {card.cut_day}</strong>
                                                </div>
                                            )}
                                            {card.interest_rate_monthly != null && (
                                                <>
                                                    <div className="tc-detail-row">
                                                        <span>Tasa mensual</span>
                                                        <strong>{(card.interest_rate_monthly * 100).toFixed(2)}%</strong>
                                                    </div>
                                                    <div className="tc-detail-row">
                                                        <span>Tasa efectiva anual</span>
                                                        <strong>{((Math.pow(1 + card.interest_rate_monthly, 12) - 1) * 100).toFixed(2)}%</strong>
                                                    </div>
                                                    {card.current_balance > 0 && (
                                                        <div className="tc-detail-row highlight">
                                                            <span>Interés este mes</span>
                                                            <strong className="red">{fmt(card.current_balance * card.interest_rate_monthly, card.currency)}</strong>
                                                        </div>
                                                    )}
                                                    {calcMinResult && (
                                                        <div className="tc-min-warning">
                                                            <AlertTriangle size={13} />
                                                            <span>Pagando solo el mínimo: <strong>{calcMinResult.months} meses</strong> y {fmt(calcMinResult.totalInterest, card.currency)} en intereses</span>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                            {card.notes && <p className="tc-detail-notes">{card.notes}</p>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Utilization guide */}
            {activeCards.length > 0 && (
                <div className="tc-guide">
                    <Info size={13} />
                    <span>Utilización recomendada: <strong className="good">verde &lt;30%</strong> · <strong className="warn">amarillo 30–70%</strong> · <strong className="red">rojo &gt;70%</strong> (afecta tu historial crediticio)</span>
                </div>
            )}

            {/* Payoff calculator modal */}
            {calcCard && (
                <div className="tc-overlay" onClick={() => setCalcCard(null)}>
                    <div className="tc-modal tc-calc-modal" onClick={e => e.stopPropagation()}>
                        <div className="tc-modal-header">
                            <div>
                                <h2>Calculadora de Pago</h2>
                                <span className="tc-modal-sub">{calcCard.name}</span>
                            </div>
                            <button type="button" onClick={() => setCalcCard(null)}><X size={20} /></button>
                        </div>
                        <div className="tc-calc-body">
                            <div className="tc-calc-info">
                                <div className="tc-calc-row">
                                    <span>Saldo actual</span>
                                    <strong>{fmt(calcCard.current_balance, calcCard.currency)}</strong>
                                </div>
                                {calcCard.interest_rate_monthly && (
                                    <div className="tc-calc-row">
                                        <span>Tasa mensual</span>
                                        <strong>{(calcCard.interest_rate_monthly * 100).toFixed(2)}%</strong>
                                    </div>
                                )}
                                {calcCard.minimum_payment && (
                                    <div className="tc-calc-row">
                                        <span>Pago mínimo</span>
                                        <strong>{fmt(calcCard.minimum_payment, calcCard.currency)}</strong>
                                    </div>
                                )}
                            </div>

                            {calcCard.interest_rate_monthly ? (
                                <>
                                    <div className="tc-field">
                                        <label>¿Cuánto pagarás cada mes?</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={calcPayment}
                                            onChange={e => setCalcPayment(e.target.value)}
                                            placeholder="Monto mensual"
                                            autoFocus
                                        />
                                    </div>

                                    {calcPayment && Number(calcPayment) > 0 && (
                                        calcResult ? (
                                            <div className="tc-calc-result">
                                                <div className={`tc-result-months ${calcResult.months <= 12 ? 'good' : calcResult.months <= 36 ? 'warn' : 'danger'}`}>
                                                    <span>Tiempo para liquidar</span>
                                                    <strong>{calcResult.months} {calcResult.months === 1 ? 'mes' : 'meses'}</strong>
                                                    <em>{calcResult.months > 12 ? `(${Math.floor(calcResult.months / 12)} año${Math.floor(calcResult.months / 12) > 1 ? 's' : ''} y ${calcResult.months % 12} meses)` : ''}</em>
                                                </div>
                                                <div className="tc-result-interest">
                                                    <span>Total a pagar</span>
                                                    <strong>{fmt(calcCard.current_balance + calcResult.totalInterest, calcCard.currency)}</strong>
                                                    <em>Intereses: {fmt(calcResult.totalInterest, calcCard.currency)}</em>
                                                </div>
                                                {calcMinResult && calcResult.months < calcMinResult.months && (
                                                    <div className="tc-result-saving">
                                                        <TrendingDown size={14} />
                                                        <span>Ahorras <strong>{fmt(calcMinResult.totalInterest - calcResult.totalInterest, calcCard.currency)}</strong> en intereses vs pago mínimo y terminas <strong>{calcMinResult.months - calcResult.months} meses antes</strong></span>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="tc-calc-warning">
                                                <AlertTriangle size={16} />
                                                <span>Con {fmt(Number(calcPayment), calcCard.currency)}/mes no alcanzas a cubrir los intereses ({fmt(calcCard.current_balance * calcCard.interest_rate_monthly, calcCard.currency)}/mes). El saldo seguirá creciendo.</span>
                                            </div>
                                        )
                                    )}

                                    {calcMinResult && (
                                        <div className="tc-min-scenario">
                                            <span>Pagando solo el mínimo ({calcCard.minimum_payment ? fmt(calcCard.minimum_payment, calcCard.currency) : '—'})</span>
                                            <strong>{calcMinResult.months} meses · {fmt(calcMinResult.totalInterest, calcCard.currency)} en intereses</strong>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="tc-calc-no-rate">
                                    <Info size={16} />
                                    <span>Agrega la tasa de interés mensual a esta tarjeta para usar la calculadora.</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Add/Edit modal */}
            {showForm && (
                <div className="tc-overlay" onClick={() => setShowForm(false)}>
                    <div className="tc-modal" onClick={e => e.stopPropagation()}>
                        <div className="tc-modal-header">
                            <h2>{editing ? 'Editar tarjeta' : 'Nueva tarjeta'}</h2>
                            <button type="button" onClick={() => setShowForm(false)}><X size={20} /></button>
                        </div>
                        <div className="tc-modal-body">
                            <div className="tc-field">
                                <label>Nombre de la tarjeta *</label>
                                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Visa Oro, Master Black..." />
                            </div>
                            <div className="tc-field-row">
                                <div className="tc-field">
                                    <label>Banco</label>
                                    <div className="tc-select-wrap">
                                        <select value={form.bank} onChange={e => setForm(f => ({ ...f, bank: e.target.value }))}>
                                            <option value="">Seleccionar...</option>
                                            {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                                        </select>
                                        <ChevronDown size={13} className="tc-chevron" />
                                    </div>
                                </div>
                                <div className="tc-field">
                                    <label>Últimos 4 dígitos</label>
                                    <input type="text" maxLength={4} value={form.last_four} onChange={e => setForm(f => ({ ...f, last_four: e.target.value.replace(/\D/g, '') }))} placeholder="0000" />
                                </div>
                            </div>
                            <div className="tc-field-row">
                                <div className="tc-field">
                                    <label>Cupo total *</label>
                                    <input type="number" min="0" value={form.credit_limit} onChange={e => setForm(f => ({ ...f, credit_limit: e.target.value }))} placeholder="0" />
                                </div>
                                <div className="tc-field">
                                    <label>Saldo actual</label>
                                    <input type="number" min="0" value={form.current_balance} onChange={e => setForm(f => ({ ...f, current_balance: e.target.value }))} placeholder="0" />
                                </div>
                            </div>
                            <div className="tc-field-row">
                                <div className="tc-field">
                                    <label>Pago mínimo</label>
                                    <input type="number" min="0" value={form.minimum_payment} onChange={e => setForm(f => ({ ...f, minimum_payment: e.target.value }))} placeholder="0" />
                                </div>
                                <div className="tc-field">
                                    <label>Tasa interés mensual (%)</label>
                                    <input type="number" min="0" step="0.01" value={form.interest_rate_monthly} onChange={e => setForm(f => ({ ...f, interest_rate_monthly: e.target.value }))} placeholder="Ej: 2.20" />
                                </div>
                            </div>
                            <div className="tc-field-row">
                                <div className="tc-field">
                                    <label>Día de pago (1-31)</label>
                                    <input type="number" min="1" max="31" value={form.payment_due_day} onChange={e => setForm(f => ({ ...f, payment_due_day: e.target.value }))} placeholder="Ej: 15" />
                                </div>
                                <div className="tc-field">
                                    <label>Día de corte (1-31)</label>
                                    <input type="number" min="1" max="31" value={form.cut_day} onChange={e => setForm(f => ({ ...f, cut_day: e.target.value }))} placeholder="Ej: 5" />
                                </div>
                            </div>
                            <div className="tc-field-row">
                                <div className="tc-field">
                                    <label>Moneda</label>
                                    <input type="text" maxLength={3} value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value.toUpperCase() }))} />
                                </div>
                                <div className="tc-field">
                                    <label>Color</label>
                                    <div className="tc-color-picker">
                                        {CARD_COLORS.map(c => (
                                            <button key={c} type="button" className={`tc-color-dot ${form.color === c ? 'selected' : ''}`}
                                                style={{ background: c }} onClick={() => setForm(f => ({ ...f, color: c }))}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="tc-field">
                                <label>Notas</label>
                                <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Beneficios, programa de puntos, etc." />
                            </div>
                            <label className="tc-active-toggle">
                                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                                Tarjeta activa
                            </label>
                        </div>
                        <div className="tc-modal-footer">
                            <button type="button" className="tc-btn-cancel" onClick={() => setShowForm(false)}>Cancelar</button>
                            <button type="button" className="tc-btn-save" onClick={handleSave} disabled={saving || !form.name.trim() || !form.credit_limit}>
                                {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear tarjeta'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete confirm */}
            {deleteId && (
                <div className="tc-overlay" onClick={() => setDeleteId(null)}>
                    <div className="tc-confirm" onClick={e => e.stopPropagation()}>
                        <AlertTriangle size={28} className="tc-confirm-icon" />
                        <p>¿Eliminar esta tarjeta?</p>
                        <div className="tc-confirm-btns">
                            <button type="button" onClick={() => setDeleteId(null)}>Cancelar</button>
                            <button type="button" className="danger" onClick={() => handleDelete(deleteId)}>Eliminar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
