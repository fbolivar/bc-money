import { createContext, useContext } from 'react';

export type Locale = 'es' | 'en';

const translations: Record<Locale, Record<string, string>> = {
    es: {
        'nav.dashboard': 'Dashboard',
        'nav.transactions': 'Transacciones',
        'nav.accounts': 'Cuentas',
        'nav.categories': 'Categorías',
        'nav.budgets': 'Presupuestos',
        'nav.goals': 'Metas',
        'nav.debts': 'Deudas',
        'nav.subscriptions': 'Suscripciones',
        'nav.debtPlan': 'Plan Deudas',
        'nav.warranties': 'Garantías',
        'nav.pets': 'Mascotas',
        'nav.shopping': 'Compras',
        'nav.home': 'Hogar',
        'nav.netWorth': 'Patrimonio',
        'nav.calendar': 'Calendario',
        'nav.reports': 'Reportes',
        'nav.notes': 'Notas',
        'nav.import': 'Importar',
        'nav.investments': 'Inversiones',
        'nav.settings': 'Configuración',
        'nav.logout': 'Cerrar Sesión',
        'common.save': 'Guardar',
        'common.cancel': 'Cancelar',
        'common.delete': 'Eliminar',
        'common.create': 'Crear',
        'common.edit': 'Editar',
        'common.search': 'Buscar...',
        'common.loading': 'Cargando...',
        'common.noData': 'Sin datos',
        'common.income': 'Ingreso',
        'common.expense': 'Gasto',
        'common.balance': 'Balance',
        'common.amount': 'Monto',
        'common.date': 'Fecha',
        'common.name': 'Nombre',
        'common.type': 'Tipo',
        'common.description': 'Descripción',
        'common.total': 'Total',
        'auth.login': 'Iniciar Sesión',
        'auth.signup': 'Registrarse',
        'auth.email': 'Correo Electrónico',
        'auth.password': 'Contraseña',
        'auth.welcome': 'Bienvenido a BC Money',
        'section.main': 'PRINCIPAL',
        'section.planning': 'PLANIFICACIÓN',
        'section.tracking': 'SEGUIMIENTO',
        'section.reports': 'INFORMES',
    },
    en: {
        'nav.dashboard': 'Dashboard',
        'nav.transactions': 'Transactions',
        'nav.accounts': 'Accounts',
        'nav.categories': 'Categories',
        'nav.budgets': 'Budgets',
        'nav.goals': 'Goals',
        'nav.debts': 'Debts',
        'nav.subscriptions': 'Subscriptions',
        'nav.debtPlan': 'Debt Plan',
        'nav.warranties': 'Warranties',
        'nav.pets': 'Pets',
        'nav.shopping': 'Shopping',
        'nav.home': 'Home',
        'nav.netWorth': 'Net Worth',
        'nav.calendar': 'Calendar',
        'nav.reports': 'Reports',
        'nav.notes': 'Notes',
        'nav.import': 'Import',
        'nav.investments': 'Investments',
        'nav.settings': 'Settings',
        'nav.logout': 'Sign Out',
        'common.save': 'Save',
        'common.cancel': 'Cancel',
        'common.delete': 'Delete',
        'common.create': 'Create',
        'common.edit': 'Edit',
        'common.search': 'Search...',
        'common.loading': 'Loading...',
        'common.noData': 'No data',
        'common.income': 'Income',
        'common.expense': 'Expense',
        'common.balance': 'Balance',
        'common.amount': 'Amount',
        'common.date': 'Date',
        'common.name': 'Name',
        'common.type': 'Type',
        'common.description': 'Description',
        'common.total': 'Total',
        'auth.login': 'Sign In',
        'auth.signup': 'Sign Up',
        'auth.email': 'Email',
        'auth.password': 'Password',
        'auth.welcome': 'Welcome to BC Money',
        'section.main': 'MAIN',
        'section.planning': 'PLANNING',
        'section.tracking': 'TRACKING',
        'section.reports': 'REPORTS',
    },
};

export function t(key: string, locale: Locale = 'es'): string {
    return translations[locale]?.[key] || translations.es[key] || key;
}

export function getLocale(): Locale {
    const saved = localStorage.getItem('bc-money-locale');
    if (saved === 'en' || saved === 'es') return saved;
    return 'es';
}

export function setLocale(locale: Locale) {
    localStorage.setItem('bc-money-locale', locale);
}

export const I18nContext = createContext<{ locale: Locale; t: (key: string) => string }>({
    locale: 'es',
    t: (key: string) => t(key, 'es'),
});

export const useI18n = () => useContext(I18nContext);
