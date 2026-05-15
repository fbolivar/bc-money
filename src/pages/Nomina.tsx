import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import {
    Users, Plus, Edit2, Trash2, X, Save, ChevronDown,
    FileText, CheckCircle, Clock, DollarSign, Briefcase,
    Calendar, TrendingUp, AlertCircle, Download,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './Nomina.css';

// ─── Colombia 2024 constants ──────────────────────────────────────────────────
const SMMLV_2024 = 1_300_000;
const TRANSPORT_ALLOWANCE_2024 = 162_000;
const HEALTH_EMPLOYEE_PCT = 0.04;
const PENSION_EMPLOYEE_PCT = 0.04;
const HEALTH_EMPLOYER_PCT = 0.085;
const PENSION_EMPLOYER_PCT = 0.12;
const ARL_RATES = [0.00522, 0.01044, 0.02436, 0.04350, 0.0696];
const SENA_PCT = 0.02;
const ICBF_PCT = 0.03;
const CCF_PCT = 0.04;

const MONTHS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// ─── Types ────────────────────────────────────────────────────────────────────
type Employee = {
    id: string;
    user_id: string;
    full_name: string;
    document_type: string;
    document_number: string;
    position: string;
    salary: number;
    transport_allowance: boolean;
    start_date: string;
    end_date: string | null;
    contract_type: string;
    eps: string;
    afp: string;
    arl_risk: number;
    is_active: boolean;
    notes: string;
    created_at: string;
};

type PayrollRecord = {
    id: string;
    employee_id: string;
    period_start: string;
    period_end: string;
    worked_days: number;
    salary: number;
    transport_allowance: number;
    overtime_hours: number;
    overtime_amount: number;
    other_income: number;
    total_income: number;
    health_employee: number;
    pension_employee: number;
    total_deductions: number;
    net_pay: number;
    health_employer: number;
    pension_employer: number;
    arl_employer: number;
    parafiscales: number;
    total_employer_cost: number;
    status: 'draft' | 'paid';
    notes: string;
    created_at: string;
    employee?: Employee;
};

type CalcResult = {
    earnedSalary: number;
    transport: number;
    totalIncome: number;
    healthEmp: number;
    pensionEmp: number;
    totalDeductions: number;
    netPay: number;
    healthEmpr: number;
    pensionEmpr: number;
    arl: number;
    parafiscales: number;
    totalEmployerCost: number;
};

const emptyEmployee: Omit<Employee, 'id' | 'user_id' | 'created_at'> = {
    full_name: '',
    document_type: 'CC',
    document_number: '',
    position: '',
    salary: SMMLV_2024,
    transport_allowance: true,
    start_date: new Date().toISOString().split('T')[0],
    end_date: null,
    contract_type: 'indefinido',
    eps: '',
    afp: '',
    arl_risk: 1,
    is_active: true,
    notes: '',
};

// ─── Payroll calculation ──────────────────────────────────────────────────────
function calcPayroll(
    salary: number,
    workedDays: number,
    transportAllowance: boolean,
    arlRisk: number,
    overtimeAmount = 0,
    otherIncome = 0,
): CalcResult {
    const dailySalary = salary / 30;
    const earnedSalary = dailySalary * workedDays;
    const transport =
        transportAllowance && salary <= 2 * SMMLV_2024
            ? TRANSPORT_ALLOWANCE_2024 * (workedDays / 30)
            : 0;
    const totalIncome = earnedSalary + transport + overtimeAmount + otherIncome;

    const healthEmp = earnedSalary * HEALTH_EMPLOYEE_PCT;
    const pensionEmp = earnedSalary * PENSION_EMPLOYEE_PCT;
    const totalDeductions = healthEmp + pensionEmp;
    const netPay = totalIncome - totalDeductions;

    const healthEmpr = earnedSalary * HEALTH_EMPLOYER_PCT;
    const pensionEmpr = earnedSalary * PENSION_EMPLOYER_PCT;
    const arl = earnedSalary * ARL_RATES[arlRisk - 1];
    const parafiscales = earnedSalary * (SENA_PCT + ICBF_PCT + CCF_PCT);
    const totalEmployerCost =
        earnedSalary + transport + overtimeAmount + otherIncome +
        healthEmpr + pensionEmpr + arl + parafiscales;

    return {
        earnedSalary, transport, totalIncome,
        healthEmp, pensionEmp, totalDeductions, netPay,
        healthEmpr, pensionEmpr, arl, parafiscales, totalEmployerCost,
    };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

function lastDayOfMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
}

// ─── Component ────────────────────────────────────────────────────────────────
export function Nomina() {
    const { user, profile, isAdmin } = useAuth();

    if (!profile?.billing_enabled && !isAdmin) {
        return (
            <div className="module-disabled">
                <Briefcase size={48} strokeWidth={1} />
                <h2>Módulo no activado</h2>
                <p>El módulo empresarial no está habilitado en tu cuenta.</p>
            </div>
        );
    }
    const [tab, setTab] = useState<'empleados' | 'liquidar' | 'historial' | 'prestaciones'>('empleados');

    // ── Employees state ──
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loadingEmp, setLoadingEmp] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
    const [empForm, setEmpForm] = useState(emptyEmployee);
    const [savingEmp, setSavingEmp] = useState(false);

    // ── Payroll state ──
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [payMonth, setPayMonth] = useState(new Date().getMonth());
    const [payYear, setPayYear] = useState(new Date().getFullYear());
    const [workedDays, setWorkedDays] = useState(30);
    const [overtimeHours, setOvertimeHours] = useState(0);
    const [otherIncome, setOtherIncome] = useState(0);
    const [payNotes, setPayNotes] = useState('');
    const [registeringPay, setRegisteringPay] = useState(false);

    // ── History state ──
    const [records, setRecords] = useState<PayrollRecord[]>([]);
    const [loadingRec, setLoadingRec] = useState(false);
    const [filterEmpId, setFilterEmpId] = useState('');
    const [filterMonth, setFilterMonth] = useState('');

    // ── Prestaciones state ──
    const [prestSalary, setPrestSalary] = useState(SMMLV_2024);
    const [prestDays, setPrestDays] = useState(360);

    // ── Load employees ──
    const loadEmployees = useCallback(async () => {
        if (!user) return;
        setLoadingEmp(true);
        const { data } = await supabase
            .from('employees')
            .select('*')
            .eq('user_id', user.id)
            .order('full_name');
        setEmployees(data || []);
        setLoadingEmp(false);
    }, [user]);

    useEffect(() => { loadEmployees(); }, [loadEmployees]);

    // ── Load records ──
    const loadRecords = useCallback(async () => {
        if (!user) return;
        setLoadingRec(true);
        let q = supabase
            .from('payroll_records')
            .select('*, employee:employees(full_name, position)')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
        if (filterEmpId) q = q.eq('employee_id', filterEmpId);
        const { data } = await q;
        setRecords((data as unknown as PayrollRecord[]) || []);
        setLoadingRec(false);
    }, [user, filterEmpId]);

    useEffect(() => {
        if (tab === 'historial') loadRecords();
    }, [tab, loadRecords]);

    // ── Employee CRUD ──
    function openNew() {
        setEditingEmployee(null);
        setEmpForm(emptyEmployee);
        setShowModal(true);
    }

    function openEdit(emp: Employee) {
        setEditingEmployee(emp);
        setEmpForm({
            full_name: emp.full_name,
            document_type: emp.document_type,
            document_number: emp.document_number,
            position: emp.position,
            salary: emp.salary,
            transport_allowance: emp.transport_allowance,
            start_date: emp.start_date,
            end_date: emp.end_date,
            contract_type: emp.contract_type,
            eps: emp.eps,
            afp: emp.afp,
            arl_risk: emp.arl_risk,
            is_active: emp.is_active,
            notes: emp.notes,
        });
        setShowModal(true);
    }

    async function saveEmployee() {
        if (!user || !empForm.full_name.trim() || !empForm.salary) return;
        setSavingEmp(true);
        try {
            if (editingEmployee) {
                await supabase.from('employees').update({ ...empForm, updated_at: new Date().toISOString() }).eq('id', editingEmployee.id);
            } else {
                await supabase.from('employees').insert({ ...empForm, user_id: user.id });
            }
            setShowModal(false);
            loadEmployees();
        } finally {
            setSavingEmp(false);
        }
    }

    async function toggleActive(emp: Employee) {
        await supabase.from('employees').update({ is_active: !emp.is_active, updated_at: new Date().toISOString() }).eq('id', emp.id);
        loadEmployees();
    }

    async function deleteEmployee(emp: Employee) {
        if (!window.confirm(`¿Eliminar a ${emp.full_name}? Esta acción no se puede deshacer.`)) return;
        await supabase.from('employees').delete().eq('id', emp.id);
        loadEmployees();
    }

    // ── Payroll calculation (live) ──
    const selectedEmp = employees.find(e => e.id === selectedEmployeeId);
    const overtimeAmount = selectedEmp
        ? (selectedEmp.salary / 240) * 1.25 * overtimeHours
        : 0;
    const calc: CalcResult | null = selectedEmp
        ? calcPayroll(selectedEmp.salary, workedDays, selectedEmp.transport_allowance, selectedEmp.arl_risk, overtimeAmount, otherIncome)
        : null;

    async function registerPayroll() {
        if (!user || !selectedEmp || !calc) return;
        setRegisteringPay(true);
        try {
            const periodStart = new Date(payYear, payMonth, 1).toISOString().split('T')[0];
            const periodEnd = new Date(payYear, payMonth, lastDayOfMonth(payYear, payMonth)).toISOString().split('T')[0];
            await supabase.from('payroll_records').insert({
                user_id: user.id,
                employee_id: selectedEmp.id,
                period_start: periodStart,
                period_end: periodEnd,
                worked_days: workedDays,
                salary: selectedEmp.salary,
                transport_allowance: calc.transport,
                overtime_hours: overtimeHours,
                overtime_amount: overtimeAmount,
                other_income: otherIncome,
                total_income: calc.totalIncome,
                health_employee: calc.healthEmp,
                pension_employee: calc.pensionEmp,
                total_deductions: calc.totalDeductions,
                net_pay: calc.netPay,
                health_employer: calc.healthEmpr,
                pension_employer: calc.pensionEmpr,
                arl_employer: calc.arl,
                parafiscales: calc.parafiscales,
                total_employer_cost: calc.totalEmployerCost,
                status: 'paid',
                notes: payNotes,
            });
            alert('Nómina registrada correctamente.');
            setTab('historial');
        } finally {
            setRegisteringPay(false);
        }
    }

    function exportComprobante() {
        if (!selectedEmp || !calc) return;
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text('Comprobante de Nómina', 105, 18, { align: 'center' });
        doc.setFontSize(11);
        doc.text(`Empleado: ${selectedEmp.full_name}`, 14, 30);
        doc.text(`Cargo: ${selectedEmp.position}`, 14, 37);
        doc.text(`Período: ${MONTHS[payMonth]} ${payYear}`, 14, 44);
        doc.text(`Días trabajados: ${workedDays}`, 14, 51);

        autoTable(doc, {
            startY: 58,
            head: [['Concepto', 'Valor']],
            body: [
                ['Salario ganado', fmt(calc.earnedSalary)],
                ['Auxilio de transporte', fmt(calc.transport)],
                ...(overtimeAmount > 0 ? [['Horas extra', fmt(overtimeAmount)]] : []),
                ...(otherIncome > 0 ? [['Otros ingresos', fmt(otherIncome)]] : []),
                ['TOTAL DEVENGADO', fmt(calc.totalIncome)],
                ['', ''],
                ['Salud empleado (4%)', `- ${fmt(calc.healthEmp)}`],
                ['Pensión empleado (4%)', `- ${fmt(calc.pensionEmp)}`],
                ['TOTAL DEDUCCIONES', `- ${fmt(calc.totalDeductions)}`],
                ['', ''],
                ['NETO A PAGAR', fmt(calc.netPay)],
                ['', ''],
                ['--- Aportes empleador ---', ''],
                ['Salud empleador (8.5%)', fmt(calc.healthEmpr)],
                ['Pensión empleador (12%)', fmt(calc.pensionEmpr)],
                [`ARL (Riesgo ${selectedEmp.arl_risk})`, fmt(calc.arl)],
                ['Parafiscales (Sena+ICBF+CCF)', fmt(calc.parafiscales)],
                ['COSTO TOTAL EMPLEADOR', fmt(calc.totalEmployerCost)],
            ],
            styles: { fontSize: 10 },
            headStyles: { fillColor: [79, 70, 229] },
        });

        doc.save(`nomina_${selectedEmp.full_name.replace(/\s+/g, '_')}_${MONTHS[payMonth]}_${payYear}.pdf`);
    }

    // ── Prestaciones ──
    const prima = (prestSalary / 12) * (prestDays / 30);
    const cesantias = (prestSalary * prestDays) / 360;
    const intCesantias = cesantias * 0.12 * (prestDays / 360);
    const vacaciones = (prestSalary * prestDays) / 720;

    // ── Filtered records ──
    const filteredRecords = records.filter(r => {
        if (filterMonth) {
            const m = new Date(r.period_start).getMonth();
            if (m !== parseInt(filterMonth)) return false;
        }
        return true;
    });

    return (
        <div className="nomina-page">
            {/* Header */}
            <div className="nomina-header">
                <div className="nomina-header-left">
                    <div className="nomina-header-icon">
                        <Users size={24} />
                    </div>
                    <div>
                        <h1>Nómina</h1>
                        <p>Gestión de empleados y liquidación Colombia 2024</p>
                    </div>
                </div>
                <div className="nomina-stats">
                    <div className="nomina-stat">
                        <span className="nomina-stat-value">{employees.filter(e => e.is_active).length}</span>
                        <span className="nomina-stat-label">Activos</span>
                    </div>
                    <div className="nomina-stat">
                        <span className="nomina-stat-value">{fmt(employees.filter(e => e.is_active).reduce((s, e) => s + e.salary, 0))}</span>
                        <span className="nomina-stat-label">Masa salarial</span>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="nomina-tabs">
                {[
                    { key: 'empleados', label: 'Empleados', icon: Users },
                    { key: 'liquidar', label: 'Liquidar nómina', icon: DollarSign },
                    { key: 'historial', label: 'Historial', icon: Clock },
                    { key: 'prestaciones', label: 'Prestaciones', icon: TrendingUp },
                ].map(t => (
                    <button
                        key={t.key}
                        className={`nomina-tab ${tab === t.key ? 'active' : ''}`}
                        onClick={() => setTab(t.key as typeof tab)}
                    >
                        <t.icon size={16} />
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ── TAB: Empleados ── */}
            {tab === 'empleados' && (
                <div className="nomina-section">
                    <div className="nomina-section-header">
                        <h2>Empleados</h2>
                        <button className="btn-primary" onClick={openNew}>
                            <Plus size={16} /> Nuevo empleado
                        </button>
                    </div>

                    {loadingEmp ? (
                        <div className="nomina-loading"><div className="loading-spinner" /></div>
                    ) : employees.length === 0 ? (
                        <div className="nomina-empty">
                            <Users size={48} />
                            <p>No tienes empleados registrados aún.</p>
                            <button className="btn-primary" onClick={openNew}>Agregar primer empleado</button>
                        </div>
                    ) : (
                        <div className="employees-grid">
                            {employees.map(emp => (
                                <div key={emp.id} className={`employee-card ${!emp.is_active ? 'inactive' : ''}`}>
                                    <div className="employee-card-header">
                                        <div className="employee-avatar">
                                            {emp.full_name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="employee-info">
                                            <h3>{emp.full_name}</h3>
                                            <p className="employee-position">{emp.position || 'Sin cargo'}</p>
                                        </div>
                                        <span className={`employee-badge ${emp.is_active ? 'badge-active' : 'badge-inactive'}`}>
                                            {emp.is_active ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </div>
                                    <div className="employee-details">
                                        <div className="employee-detail">
                                            <DollarSign size={14} />
                                            <span>{fmt(emp.salary)}/mes</span>
                                        </div>
                                        <div className="employee-detail">
                                            <Calendar size={14} />
                                            <span>Desde {new Date(emp.start_date + 'T00:00:00').toLocaleDateString('es-CO')}</span>
                                        </div>
                                        <div className="employee-detail">
                                            <Briefcase size={14} />
                                            <span className="capitalize">{emp.contract_type}</span>
                                        </div>
                                        <div className="employee-detail">
                                            <AlertCircle size={14} />
                                            <span>ARL Riesgo {emp.arl_risk}</span>
                                        </div>
                                    </div>
                                    <div className="employee-actions">
                                        <button className="btn-icon" title="Editar" onClick={() => openEdit(emp)}>
                                            <Edit2 size={15} />
                                        </button>
                                        <button
                                            className={`btn-icon ${emp.is_active ? 'btn-warning' : 'btn-success'}`}
                                            title={emp.is_active ? 'Inactivar' : 'Activar'}
                                            onClick={() => toggleActive(emp)}
                                        >
                                            {emp.is_active ? <X size={15} /> : <CheckCircle size={15} />}
                                        </button>
                                        <button className="btn-icon btn-danger" title="Eliminar" onClick={() => deleteEmployee(emp)}>
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── TAB: Liquidar nómina ── */}
            {tab === 'liquidar' && (
                <div className="nomina-section">
                    <h2 className="section-title">Liquidar nómina</h2>
                    <div className="liquidar-layout">
                        {/* Controls */}
                        <div className="liquidar-controls card">
                            <div className="form-group">
                                <label>Empleado</label>
                                <select value={selectedEmployeeId} onChange={e => setSelectedEmployeeId(e.target.value)}>
                                    <option value="">— Seleccionar —</option>
                                    {employees.filter(e => e.is_active).map(e => (
                                        <option key={e.id} value={e.id}>{e.full_name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Mes</label>
                                    <select value={payMonth} onChange={e => setPayMonth(parseInt(e.target.value))}>
                                        {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Año</label>
                                    <input type="number" value={payYear} onChange={e => setPayYear(parseInt(e.target.value))} min={2020} max={2030} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Días trabajados</label>
                                <input type="number" value={workedDays} onChange={e => setWorkedDays(Math.min(30, Math.max(1, parseInt(e.target.value) || 1)))} min={1} max={30} />
                            </div>
                            <div className="form-group">
                                <label>Horas extra</label>
                                <input type="number" value={overtimeHours} onChange={e => setOvertimeHours(Math.max(0, parseFloat(e.target.value) || 0))} min={0} />
                            </div>
                            <div className="form-group">
                                <label>Otros ingresos</label>
                                <input type="number" value={otherIncome} onChange={e => setOtherIncome(Math.max(0, parseFloat(e.target.value) || 0))} min={0} />
                            </div>
                            <div className="form-group">
                                <label>Notas</label>
                                <textarea rows={2} value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Observaciones..." />
                            </div>
                        </div>

                        {/* Result */}
                        {!selectedEmp ? (
                            <div className="liquidar-empty">
                                <DollarSign size={48} />
                                <p>Selecciona un empleado para ver la liquidación</p>
                            </div>
                        ) : calc && (
                            <div className="liquidar-result">
                                <div className="liquidar-emp-header">
                                    <div className="employee-avatar large">{selectedEmp.full_name.charAt(0)}</div>
                                    <div>
                                        <h3>{selectedEmp.full_name}</h3>
                                        <p>{selectedEmp.position} · {MONTHS[payMonth]} {payYear}</p>
                                    </div>
                                </div>

                                <div className="calc-section devengado">
                                    <h4>Devengado</h4>
                                    <div className="calc-row">
                                        <span>Salario ganado ({workedDays}/30 días)</span>
                                        <span>{fmt(calc.earnedSalary)}</span>
                                    </div>
                                    {calc.transport > 0 && (
                                        <div className="calc-row">
                                            <span>Auxilio de transporte</span>
                                            <span>{fmt(calc.transport)}</span>
                                        </div>
                                    )}
                                    {overtimeAmount > 0 && (
                                        <div className="calc-row">
                                            <span>Horas extra ({overtimeHours}h)</span>
                                            <span>{fmt(overtimeAmount)}</span>
                                        </div>
                                    )}
                                    {otherIncome > 0 && (
                                        <div className="calc-row">
                                            <span>Otros ingresos</span>
                                            <span>{fmt(otherIncome)}</span>
                                        </div>
                                    )}
                                    <div className="calc-row total">
                                        <span>Total devengado</span>
                                        <span>{fmt(calc.totalIncome)}</span>
                                    </div>
                                </div>

                                <div className="calc-section deducciones">
                                    <h4>Deducciones empleado</h4>
                                    <div className="calc-row">
                                        <span>Salud (4%)</span>
                                        <span className="text-danger">- {fmt(calc.healthEmp)}</span>
                                    </div>
                                    <div className="calc-row">
                                        <span>Pensión (4%)</span>
                                        <span className="text-danger">- {fmt(calc.pensionEmp)}</span>
                                    </div>
                                    <div className="calc-row total text-danger">
                                        <span>Total deducciones</span>
                                        <span>- {fmt(calc.totalDeductions)}</span>
                                    </div>
                                </div>

                                <div className="calc-neto">
                                    <span>Neto a pagar</span>
                                    <span>{fmt(calc.netPay)}</span>
                                </div>

                                <div className="calc-section empleador">
                                    <h4>Aportes empleador</h4>
                                    <div className="calc-row">
                                        <span>Salud (8.5%)</span>
                                        <span>{fmt(calc.healthEmpr)}</span>
                                    </div>
                                    <div className="calc-row">
                                        <span>Pensión (12%)</span>
                                        <span>{fmt(calc.pensionEmpr)}</span>
                                    </div>
                                    <div className="calc-row">
                                        <span>ARL (Riesgo {selectedEmp.arl_risk} · {(ARL_RATES[selectedEmp.arl_risk - 1] * 100).toFixed(3)}%)</span>
                                        <span>{fmt(calc.arl)}</span>
                                    </div>
                                    <div className="calc-row">
                                        <span>Sena 2% + ICBF 3% + CCF 4%</span>
                                        <span>{fmt(calc.parafiscales)}</span>
                                    </div>
                                    <div className="calc-row total text-primary">
                                        <span>Costo total empleador</span>
                                        <span>{fmt(calc.totalEmployerCost)}</span>
                                    </div>
                                </div>

                                <div className="liquidar-buttons">
                                    <button className="btn-primary" onClick={registerPayroll} disabled={registeringPay}>
                                        <CheckCircle size={16} />
                                        {registeringPay ? 'Registrando...' : 'Registrar pago'}
                                    </button>
                                    <button className="btn-secondary" onClick={exportComprobante}>
                                        <Download size={16} />
                                        Exportar PDF
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── TAB: Historial ── */}
            {tab === 'historial' && (
                <div className="nomina-section">
                    <div className="nomina-section-header">
                        <h2>Historial de nóminas</h2>
                    </div>
                    <div className="historial-filters">
                        <select value={filterEmpId} onChange={e => setFilterEmpId(e.target.value)}>
                            <option value="">Todos los empleados</option>
                            {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                        </select>
                        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
                            <option value="">Todos los meses</option>
                            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                        </select>
                        <button className="btn-secondary" onClick={loadRecords}>Actualizar</button>
                    </div>

                    {loadingRec ? (
                        <div className="nomina-loading"><div className="loading-spinner" /></div>
                    ) : filteredRecords.length === 0 ? (
                        <div className="nomina-empty">
                            <Clock size={48} />
                            <p>No hay registros de nómina aún.</p>
                        </div>
                    ) : (
                        <div className="historial-list">
                            {filteredRecords.map(rec => {
                                const emp = rec.employee as unknown as { full_name: string; position: string } | undefined;
                                const periodDate = new Date(rec.period_start + 'T00:00:00');
                                return (
                                    <div key={rec.id} className="historial-card">
                                        <div className="historial-card-left">
                                            <div className="employee-avatar small">
                                                {(emp?.full_name || '?').charAt(0)}
                                            </div>
                                            <div>
                                                <p className="historial-name">{emp?.full_name || 'Empleado'}</p>
                                                <p className="historial-period">
                                                    {MONTHS[periodDate.getMonth()]} {periodDate.getFullYear()} · {rec.worked_days} días
                                                </p>
                                            </div>
                                        </div>
                                        <div className="historial-card-right">
                                            <div className="historial-amounts">
                                                <div>
                                                    <p className="historial-amount-label">Neto pagado</p>
                                                    <p className="historial-amount">{fmt(rec.net_pay)}</p>
                                                </div>
                                                <div>
                                                    <p className="historial-amount-label">Costo total</p>
                                                    <p className="historial-amount text-secondary">{fmt(rec.total_employer_cost)}</p>
                                                </div>
                                            </div>
                                            <span className={`historial-badge ${rec.status === 'paid' ? 'badge-paid' : 'badge-draft'}`}>
                                                {rec.status === 'paid' ? 'Pagado' : 'Borrador'}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ── TAB: Prestaciones sociales ── */}
            {tab === 'prestaciones' && (
                <div className="nomina-section">
                    <h2 className="section-title">Calculadora de prestaciones sociales</h2>
                    <p className="section-subtitle">Estimación informativa según legislación colombiana</p>

                    <div className="prestaciones-layout">
                        <div className="prestaciones-inputs card">
                            <div className="form-group">
                                <label>Salario mensual</label>
                                <input
                                    type="number"
                                    value={prestSalary}
                                    onChange={e => setPrestSalary(Math.max(SMMLV_2024, parseFloat(e.target.value) || SMMLV_2024))}
                                    min={SMMLV_2024}
                                />
                                <small>Mínimo: {fmt(SMMLV_2024)}</small>
                            </div>
                            <div className="form-group">
                                <label>Días trabajados en el año</label>
                                <input
                                    type="number"
                                    value={prestDays}
                                    onChange={e => setPrestDays(Math.min(360, Math.max(1, parseInt(e.target.value) || 1)))}
                                    min={1}
                                    max={360}
                                />
                            </div>
                        </div>

                        <div className="prestaciones-results">
                            {[
                                {
                                    label: 'Prima de servicios',
                                    value: prima,
                                    formula: 'Salario / 12 × días / 30',
                                    desc: 'Pagadera en junio y diciembre',
                                    color: 'primary',
                                },
                                {
                                    label: 'Cesantías',
                                    value: cesantias,
                                    formula: 'Salario × días / 360',
                                    desc: 'Pagadas al fondo cada febrero',
                                    color: 'success',
                                },
                                {
                                    label: 'Intereses sobre cesantías',
                                    value: intCesantias,
                                    formula: 'Cesantías × 12% × días / 360',
                                    desc: 'Pagados al empleado en enero',
                                    color: 'warning',
                                },
                                {
                                    label: 'Vacaciones',
                                    value: vacaciones,
                                    formula: 'Salario × días / 720',
                                    desc: '15 días hábiles por año',
                                    color: 'info',
                                },
                            ].map(item => (
                                <div key={item.label} className={`prestacion-card card-${item.color}`}>
                                    <div className="prestacion-card-header">
                                        <h4>{item.label}</h4>
                                        <span className="prestacion-value">{fmt(item.value)}</span>
                                    </div>
                                    <p className="prestacion-formula">{item.formula}</p>
                                    <p className="prestacion-desc">{item.desc}</p>
                                </div>
                            ))}
                            <div className="prestaciones-total card">
                                <span>Total prestaciones estimadas</span>
                                <span className="prestacion-total-value">{fmt(prima + cesantias + intCesantias + vacaciones)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: Empleado ── */}
            {showModal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
                    <div className="modal-content nomina-modal">
                        <div className="modal-header">
                            <h3>{editingEmployee ? 'Editar empleado' : 'Nuevo empleado'}</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <div className="modal-section-title">Información personal</div>
                            <div className="form-row">
                                <div className="form-group flex-2">
                                    <label>Nombre completo *</label>
                                    <input
                                        type="text"
                                        value={empForm.full_name}
                                        onChange={e => setEmpForm(f => ({ ...f, full_name: e.target.value }))}
                                        placeholder="Ej: Juan García"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Tipo doc.</label>
                                    <select value={empForm.document_type} onChange={e => setEmpForm(f => ({ ...f, document_type: e.target.value }))}>
                                        {['CC', 'CE', 'NIT', 'PP'].map(t => <option key={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>No. documento</label>
                                    <input type="text" value={empForm.document_number} onChange={e => setEmpForm(f => ({ ...f, document_number: e.target.value }))} />
                                </div>
                            </div>

                            <div className="modal-section-title">Información laboral</div>
                            <div className="form-row">
                                <div className="form-group flex-2">
                                    <label>Cargo</label>
                                    <input type="text" value={empForm.position} onChange={e => setEmpForm(f => ({ ...f, position: e.target.value }))} placeholder="Ej: Desarrollador" />
                                </div>
                                <div className="form-group">
                                    <label>Tipo contrato</label>
                                    <select value={empForm.contract_type} onChange={e => setEmpForm(f => ({ ...f, contract_type: e.target.value }))}>
                                        <option value="indefinido">Indefinido</option>
                                        <option value="fijo">Fijo</option>
                                        <option value="obra">Obra/Labor</option>
                                        <option value="aprendizaje">Aprendizaje</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Salario mensual *</label>
                                    <input type="number" value={empForm.salary} onChange={e => setEmpForm(f => ({ ...f, salary: parseFloat(e.target.value) || 0 }))} min={0} />
                                </div>
                                <div className="form-group">
                                    <label>Riesgo ARL (1-5)</label>
                                    <select value={empForm.arl_risk} onChange={e => setEmpForm(f => ({ ...f, arl_risk: parseInt(e.target.value) }))}>
                                        {[1, 2, 3, 4, 5].map(r => <option key={r} value={r}>Nivel {r} ({(ARL_RATES[r - 1] * 100).toFixed(3)}%)</option>)}
                                    </select>
                                </div>
                                <div className="form-group form-check-group">
                                    <label className="form-check-label">
                                        <input type="checkbox" checked={empForm.transport_allowance} onChange={e => setEmpForm(f => ({ ...f, transport_allowance: e.target.checked }))} />
                                        Auxilio transporte
                                    </label>
                                    <small>Aplica si salario ≤ 2 SMMLV</small>
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Fecha inicio *</label>
                                    <input type="date" value={empForm.start_date} onChange={e => setEmpForm(f => ({ ...f, start_date: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label>Fecha fin</label>
                                    <input type="date" value={empForm.end_date || ''} onChange={e => setEmpForm(f => ({ ...f, end_date: e.target.value || null }))} />
                                </div>
                            </div>

                            <div className="modal-section-title">Seguridad social</div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>EPS</label>
                                    <input type="text" value={empForm.eps} onChange={e => setEmpForm(f => ({ ...f, eps: e.target.value }))} placeholder="Ej: Compensar" />
                                </div>
                                <div className="form-group">
                                    <label>AFP (Pensión)</label>
                                    <input type="text" value={empForm.afp} onChange={e => setEmpForm(f => ({ ...f, afp: e.target.value }))} placeholder="Ej: Porvenir" />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Notas</label>
                                <textarea rows={2} value={empForm.notes} onChange={e => setEmpForm(f => ({ ...f, notes: e.target.value }))} />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                            <button className="btn-primary" onClick={saveEmployee} disabled={savingEmp || !empForm.full_name.trim()}>
                                <Save size={16} />
                                {savingEmp ? 'Guardando...' : 'Guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
