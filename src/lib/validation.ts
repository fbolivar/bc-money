import { z } from 'zod';

export const transactionSchema = z.object({
    type: z.enum(['income', 'expense']),
    amount: z.number().positive('El monto debe ser mayor a 0').max(999999999, 'Monto demasiado grande'),
    category_id: z.string().optional(),
    account_id: z.string().optional(),
    description: z.string().max(500, 'Máximo 500 caracteres').optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
    payment_method: z.enum(['cash', 'debit', 'credit', 'transfer', 'other']),
});

export const accountSchema = z.object({
    name: z.string().min(1, 'Nombre requerido').max(100),
    type: z.enum(['checking', 'savings', 'credit_card', 'cash', 'crypto', 'investment']),
    currency: z.string().length(3),
    balance: z.number(),
});

export const debtSchema = z.object({
    name: z.string().min(1, 'Nombre requerido').max(100),
    type: z.enum(['mortgage', 'personal_loan', 'credit_card', 'informal', 'car_loan', 'student_loan', 'other']),
    original_amount: z.number().positive('El monto debe ser mayor a 0'),
    interest_rate: z.number().min(0).max(100),
    payment_day: z.number().min(1).max(31).optional(),
});

export const passwordSchema = z.string()
    .min(8, 'Mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Debe incluir mayúsculas')
    .regex(/[a-z]/, 'Debe incluir minúsculas')
    .regex(/[0-9]/, 'Debe incluir números');

export const emailSchema = z.string().email('Email inválido');

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
    const result = schema.safeParse(data);
    if (result.success) return { success: true, data: result.data };
    const issues = result.error?.issues || result.error?.errors || [];
    return { success: false, error: (issues[0] as { message?: string })?.message || 'Datos inválidos' };
}
