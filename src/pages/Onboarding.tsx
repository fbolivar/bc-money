import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    User,
    DollarSign,
    Clock,
    Target,
    ChevronRight,
    ChevronLeft,
    Check,
    Briefcase,
    GraduationCap,
    Laptop,
    Users,
    Coffee,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import './Onboarding.css';

const STEPS = [
    { id: 1, title: 'Tu Perfil', icon: User },
    { id: 2, title: 'Tus Ingresos', icon: DollarSign },
    { id: 3, title: 'Gastos Esenciales', icon: Clock },
    { id: 4, title: 'Tu Primera Meta', icon: Target },
];

const LIFE_SITUATIONS = [
    { value: 'student', label: 'Estudiante', icon: GraduationCap },
    { value: 'first_job', label: 'Primer Empleo', icon: Briefcase },
    { value: 'employed', label: 'Empleado', icon: Users },
    { value: 'freelancer', label: 'Freelancer', icon: Laptop },
    { value: 'retired', label: 'Retirado', icon: Coffee },
];

export function Onboarding() {
    const { user, refreshProfile } = useAuth();
    const navigate = useNavigate();
    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(false);

    // Form state
    const [lifeSituation, setLifeSituation] = useState('first_job');
    const [currency, setCurrency] = useState('USD');
    const [incomeType, setIncomeType] = useState<'hourly' | 'fixed'>('hourly');
    const [hourlyRate, setHourlyRate] = useState(14);
    const [hoursPerWeek, setHoursPerWeek] = useState(27);
    const [fixedSalary, setFixedSalary] = useState(2000);
    const [payFrequency, setPayFrequency] = useState<'weekly' | 'biweekly' | 'monthly'>('biweekly');
    const [netPercentage, setNetPercentage] = useState(75);

    // Calculated values
    const [essentialExpenses, setEssentialExpenses] = useState({
        housing: 600,
        utilities: 100,
        transport: 150,
        food: 300,
        phone: 50,
    });
    const [emergencyFundGoal, setEmergencyFundGoal] = useState(300);

    const estimatedGrossMonthly = incomeType === 'hourly'
        ? hourlyRate * hoursPerWeek * 4.33
        : fixedSalary;

    const estimatedNetMonthly = estimatedGrossMonthly * (netPercentage / 100);
    const totalEssentials = Object.values(essentialExpenses).reduce((a, b) => a + b, 0);
    const remainingAfterEssentials = estimatedNetMonthly - totalEssentials;
    const suggestedSavings = Math.max(0, remainingAfterEssentials * 0.2);

    const handleNext = () => {
        if (currentStep < 4) {
            setCurrentStep(currentStep + 1);
        }
    };

    const handleBack = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1);
        }
    };

    const handleComplete = async () => {
        if (!user) return;
        setLoading(true);

        try {
            // Update profile
            await supabase
                .from('profiles')
                .update({
                    life_situation: lifeSituation,
                    currency,
                    income_type: incomeType,
                    hourly_rate: incomeType === 'hourly' ? hourlyRate : null,
                    hours_per_week: incomeType === 'hourly' ? hoursPerWeek : null,
                    fixed_salary: incomeType === 'fixed' ? fixedSalary : null,
                    pay_frequency: payFrequency,
                    net_income_percentage: netPercentage,
                    onboarding_completed: true,
                    onboarding_step: 4,
                })
                .eq('id', user.id);

            // Create emergency fund goal
            await supabase
                .from('goals')
                .insert({
                    user_id: user.id,
                    name: 'Fondo de Emergencia',
                    description: 'Tu colchón financiero para imprevistos',
                    target_amount: emergencyFundGoal,
                    current_amount: 0,
                    goal_type: 'emergency_fund',
                    priority: 1,
                    icon: 'shield',
                    color: '#10B981',
                });

            // Create essential budgets
            const essentialCategories = [
                { name: 'Vivienda', amount: essentialExpenses.housing },
                { name: 'Servicios', amount: essentialExpenses.utilities },
                { name: 'Transporte', amount: essentialExpenses.transport },
                { name: 'Alimentación', amount: essentialExpenses.food },
                { name: 'Teléfono/Internet', amount: essentialExpenses.phone },
            ];

            // Get category IDs
            const { data: categories } = await supabase
                .from('categories')
                .select('id, name')
                .in('name', essentialCategories.map(e => e.name));

            if (categories) {
                for (const cat of essentialCategories) {
                    const category = categories.find(c => c.name === cat.name);
                    if (category) {
                        await supabase
                            .from('budgets')
                            .insert({
                                user_id: user.id,
                                category_id: category.id,
                                amount: cat.amount,
                                period: 'monthly',
                            });
                    }
                }
            }

            await refreshProfile();
            navigate('/');
        } catch (error) {
            console.error('Error completing onboarding:', error);
        } finally {
            setLoading(false);
        }
    };

    const renderStep = () => {
        switch (currentStep) {
            case 1:
                return (
                    <div className="onboarding-step animate-slideIn">
                        <h2>¿Cuál es tu situación actual?</h2>
                        <p className="step-description">
                            Esto nos ayuda a personalizar tu experiencia y darte mejores recomendaciones.
                        </p>

                        <div className="situation-grid">
                            {LIFE_SITUATIONS.map((situation) => (
                                <button
                                    key={situation.value}
                                    className={`situation-card ${lifeSituation === situation.value ? 'selected' : ''}`}
                                    onClick={() => setLifeSituation(situation.value)}
                                >
                                    <situation.icon size={32} />
                                    <span>{situation.label}</span>
                                </button>
                            ))}
                        </div>

                        <div className="form-group mt-lg">
                            <label className="form-label">Moneda principal</label>
                            <select
                                className="form-select"
                                value={currency}
                                onChange={(e) => setCurrency(e.target.value)}
                            >
                                <option value="USD">USD - Dólar estadounidense</option>
                                <option value="EUR">EUR - Euro</option>
                                <option value="COP">COP - Peso colombiano</option>
                                <option value="MXN">MXN - Peso mexicano</option>
                            </select>
                        </div>
                    </div>
                );

            case 2:
                return (
                    <div className="onboarding-step animate-slideIn">
                        <h2>¿Cómo recibes tus ingresos?</h2>
                        <p className="step-description">
                            Entender tu flujo de dinero nos ayuda a crear un presupuesto realista.
                        </p>

                        <div className="income-type-toggle">
                            <button
                                className={`toggle-btn ${incomeType === 'hourly' ? 'active' : ''}`}
                                onClick={() => setIncomeType('hourly')}
                            >
                                Por Hora
                            </button>
                            <button
                                className={`toggle-btn ${incomeType === 'fixed' ? 'active' : ''}`}
                                onClick={() => setIncomeType('fixed')}
                            >
                                Salario Fijo
                            </button>
                        </div>

                        {incomeType === 'hourly' ? (
                            <div className="income-inputs">
                                <div className="form-group">
                                    <label className="form-label">Tarifa por hora ({currency})</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={hourlyRate}
                                        onChange={(e) => setHourlyRate(Number(e.target.value))}
                                        min={0}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Horas por semana (promedio)</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={hoursPerWeek}
                                        onChange={(e) => setHoursPerWeek(Number(e.target.value))}
                                        min={0}
                                        max={168}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="form-group">
                                <label className="form-label">Salario mensual ({currency})</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={fixedSalary}
                                    onChange={(e) => setFixedSalary(Number(e.target.value))}
                                    min={0}
                                />
                            </div>
                        )}

                        <div className="form-group">
                            <label className="form-label">Frecuencia de pago</label>
                            <select
                                className="form-select"
                                value={payFrequency}
                                onChange={(e) => setPayFrequency(e.target.value as 'weekly' | 'biweekly' | 'monthly')}
                            >
                                <option value="weekly">Semanal</option>
                                <option value="biweekly">Quincenal</option>
                                <option value="monthly">Mensual</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="form-label">
                                Ingreso neto aproximado (% después de impuestos)
                                <span className="form-hint"> - Si no estás seguro, 75% es un buen estimado</span>
                            </label>
                            <div className="slider-container">
                                <input
                                    type="range"
                                    min={50}
                                    max={100}
                                    value={netPercentage}
                                    onChange={(e) => setNetPercentage(Number(e.target.value))}
                                />
                                <span className="slider-value">{netPercentage}%</span>
                            </div>
                        </div>

                        <div className="income-summary">
                            <div className="summary-item">
                                <span>Ingreso bruto mensual estimado</span>
                                <strong>${estimatedGrossMonthly.toFixed(0)}</strong>
                            </div>
                            <div className="summary-item highlight">
                                <span>Ingreso neto mensual estimado</span>
                                <strong>${estimatedNetMonthly.toFixed(0)}</strong>
                            </div>
                        </div>
                    </div>
                );

            case 3:
                return (
                    <div className="onboarding-step animate-slideIn">
                        <h2>Tus gastos esenciales</h2>
                        <p className="step-description">
                            Estos son los gastos que debes cubrir cada mes. Ajusta los valores a tu realidad.
                        </p>

                        <div className="expenses-grid">
                            {Object.entries(essentialExpenses).map(([key, value]) => (
                                <div key={key} className="expense-item">
                                    <label className="form-label">
                                        {key === 'housing' && '🏠 Vivienda (renta/hipoteca)'}
                                        {key === 'utilities' && '💡 Servicios (agua, luz, gas)'}
                                        {key === 'transport' && '🚗 Transporte'}
                                        {key === 'food' && '🍎 Alimentación'}
                                        {key === 'phone' && '📱 Teléfono/Internet'}
                                    </label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={value}
                                        onChange={(e) => setEssentialExpenses(prev => ({
                                            ...prev,
                                            [key]: Number(e.target.value)
                                        }))}
                                        min={0}
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="expenses-summary">
                            <div className="summary-row">
                                <span>Total gastos esenciales</span>
                                <strong className="text-danger">${totalEssentials.toFixed(0)}</strong>
                            </div>
                            <div className="summary-row">
                                <span>Ingreso neto estimado</span>
                                <strong>${estimatedNetMonthly.toFixed(0)}</strong>
                            </div>
                            <div className="summary-row highlight">
                                <span>Disponible después de esenciales</span>
                                <strong className={remainingAfterEssentials >= 0 ? 'text-success' : 'text-danger'}>
                                    ${remainingAfterEssentials.toFixed(0)}
                                </strong>
                            </div>
                            {remainingAfterEssentials > 0 && (
                                <div className="summary-row">
                                    <span>Ahorro sugerido (20%)</span>
                                    <strong className="text-success">${suggestedSavings.toFixed(0)}</strong>
                                </div>
                            )}
                        </div>
                    </div>
                );

            case 4:
                return (
                    <div className="onboarding-step animate-slideIn">
                        <h2>Tu primera meta: Fondo de Emergencia</h2>
                        <p className="step-description">
                            Un fondo de emergencia te protege de imprevistos. Empezamos con una meta pequeña y alcanzable.
                        </p>

                        <div className="goal-card">
                            <div className="goal-icon">🛡️</div>
                            <h3>Fondo de Emergencia</h3>
                            <p>Tu colchón financiero para imprevistos como reparaciones, gastos médicos o pérdida de ingresos.</p>

                            <div className="form-group mt-lg">
                                <label className="form-label">Meta inicial ({currency})</label>
                                <div className="goal-options">
                                    {[300, 500, 1000].map((amount) => (
                                        <button
                                            key={amount}
                                            className={`goal-option ${emergencyFundGoal === amount ? 'selected' : ''}`}
                                            onClick={() => setEmergencyFundGoal(amount)}
                                        >
                                            ${amount}
                                        </button>
                                    ))}
                                </div>
                                <input
                                    type="number"
                                    className="form-input mt-md"
                                    value={emergencyFundGoal}
                                    onChange={(e) => setEmergencyFundGoal(Number(e.target.value))}
                                    placeholder="O ingresa otro monto"
                                />
                            </div>

                            {suggestedSavings > 0 && (
                                <div className="goal-estimate">
                                    <p>
                                        Ahorrando <strong>${suggestedSavings.toFixed(0)}/mes</strong>,
                                        alcanzarás esta meta en aproximadamente{' '}
                                        <strong>{Math.ceil(emergencyFundGoal / suggestedSavings)} meses</strong>.
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="plan-summary">
                            <h3>Tu Plan Inicial</h3>
                            <ul className="plan-list">
                                <li>
                                    <Check size={20} className="text-success" />
                                    <span>Perfil configurado: <strong>{LIFE_SITUATIONS.find(s => s.value === lifeSituation)?.label}</strong></span>
                                </li>
                                <li>
                                    <Check size={20} className="text-success" />
                                    <span>Ingreso neto: <strong>${estimatedNetMonthly.toFixed(0)}/mes</strong></span>
                                </li>
                                <li>
                                    <Check size={20} className="text-success" />
                                    <span>Gastos esenciales: <strong>${totalEssentials}/mes</strong></span>
                                </li>
                                <li>
                                    <Check size={20} className="text-success" />
                                    <span>Meta de emergencia: <strong>${emergencyFundGoal}</strong></span>
                                </li>
                            </ul>
                        </div>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className="onboarding-page">
            <div className="onboarding-container">
                <div className="onboarding-progress">
                    {STEPS.map((step) => (
                        <div
                            key={step.id}
                            className={`progress-step ${currentStep >= step.id ? 'active' : ''} ${currentStep > step.id ? 'completed' : ''}`}
                        >
                            <div className="step-icon">
                                {currentStep > step.id ? <Check size={16} /> : <step.icon size={16} />}
                            </div>
                            <span className="step-title">{step.title}</span>
                        </div>
                    ))}
                </div>

                <div className="onboarding-content">
                    {renderStep()}
                </div>

                <div className="onboarding-actions">
                    {currentStep > 1 && (
                        <button className="btn btn-secondary" onClick={handleBack}>
                            <ChevronLeft size={18} />
                            Atrás
                        </button>
                    )}

                    {currentStep < 4 ? (
                        <button className="btn btn-primary btn-lg" onClick={handleNext}>
                            Continuar
                            <ChevronRight size={18} />
                        </button>
                    ) : (
                        <button
                            className="btn btn-primary btn-lg"
                            onClick={handleComplete}
                            disabled={loading}
                        >
                            {loading ? 'Guardando...' : '¡Comenzar!'}
                            <ChevronRight size={18} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
