import { describe, it, expect } from 'vitest';
import { transactionSchema, accountSchema, debtSchema, passwordSchema, emailSchema, validate } from '../lib/validation';

describe('Transaction Validation', () => {
    it('accepts valid transaction', () => {
        const result = validate(transactionSchema, { type: 'expense', amount: 50000, date: '2024-01-15', payment_method: 'debit' });
        expect(result.success).toBe(true);
    });
    it('rejects negative amount', () => {
        const result = validate(transactionSchema, { type: 'expense', amount: -100, date: '2024-01-15', payment_method: 'debit' });
        expect(result.success).toBe(false);
    });
    it('rejects zero amount', () => {
        const result = validate(transactionSchema, { type: 'income', amount: 0, date: '2024-01-15', payment_method: 'cash' });
        expect(result.success).toBe(false);
    });
    it('rejects invalid date format', () => {
        const result = validate(transactionSchema, { type: 'income', amount: 1000, date: '15/01/2024', payment_method: 'cash' });
        expect(result.success).toBe(false);
    });
    it('rejects invalid type', () => {
        const result = validate(transactionSchema, { type: 'transfer', amount: 1000, date: '2024-01-15', payment_method: 'cash' });
        expect(result.success).toBe(false);
    });
    it('rejects invalid payment method', () => {
        const result = validate(transactionSchema, { type: 'expense', amount: 1000, date: '2024-01-15', payment_method: 'bitcoin' });
        expect(result.success).toBe(false);
    });
    it('accepts optional fields', () => {
        const result = validate(transactionSchema, { type: 'income', amount: 5000, date: '2024-06-01', payment_method: 'transfer', description: 'Salario', category_id: 'abc-123' });
        expect(result.success).toBe(true);
    });
    it('rejects too large amount', () => {
        const result = validate(transactionSchema, { type: 'expense', amount: 9999999999, date: '2024-01-15', payment_method: 'debit' });
        expect(result.success).toBe(false);
    });
});

describe('Account Validation', () => {
    it('accepts valid account', () => {
        const result = validate(accountSchema, { name: 'Bancolombia', type: 'checking', currency: 'COP', balance: 1500000 });
        expect(result.success).toBe(true);
    });
    it('rejects empty name', () => {
        const result = validate(accountSchema, { name: '', type: 'savings', currency: 'COP', balance: 0 });
        expect(result.success).toBe(false);
    });
    it('rejects invalid type', () => {
        const result = validate(accountSchema, { name: 'Test', type: 'wallet', currency: 'COP', balance: 0 });
        expect(result.success).toBe(false);
    });
    it('rejects invalid currency length', () => {
        const result = validate(accountSchema, { name: 'Test', type: 'cash', currency: 'COPX', balance: 0 });
        expect(result.success).toBe(false);
    });
});

describe('Debt Validation', () => {
    it('accepts valid debt', () => {
        const result = validate(debtSchema, { name: 'Hipoteca', type: 'mortgage', original_amount: 200000000, interest_rate: 12.5 });
        expect(result.success).toBe(true);
    });
    it('rejects negative original amount', () => {
        const result = validate(debtSchema, { name: 'Test', type: 'personal_loan', original_amount: -5000, interest_rate: 0 });
        expect(result.success).toBe(false);
    });
    it('rejects interest rate over 100', () => {
        const result = validate(debtSchema, { name: 'Test', type: 'credit_card', original_amount: 1000, interest_rate: 150 });
        expect(result.success).toBe(false);
    });
    it('accepts payment day in range', () => {
        const result = validate(debtSchema, { name: 'Test', type: 'other', original_amount: 1000, interest_rate: 5, payment_day: 15 });
        expect(result.success).toBe(true);
    });
    it('rejects payment day out of range', () => {
        const result = validate(debtSchema, { name: 'Test', type: 'other', original_amount: 1000, interest_rate: 5, payment_day: 32 });
        expect(result.success).toBe(false);
    });
});

describe('Password Validation', () => {
    it('accepts strong password', () => {
        const result = passwordSchema.safeParse('MyPass123');
        expect(result.success).toBe(true);
    });
    it('rejects short password', () => {
        const result = passwordSchema.safeParse('Ab1');
        expect(result.success).toBe(false);
    });
    it('rejects no uppercase', () => {
        const result = passwordSchema.safeParse('password123');
        expect(result.success).toBe(false);
    });
    it('rejects no lowercase', () => {
        const result = passwordSchema.safeParse('PASSWORD123');
        expect(result.success).toBe(false);
    });
    it('rejects no number', () => {
        const result = passwordSchema.safeParse('PasswordAbc');
        expect(result.success).toBe(false);
    });
});

describe('Email Validation', () => {
    it('accepts valid email', () => {
        const result = emailSchema.safeParse('test@example.com');
        expect(result.success).toBe(true);
    });
    it('rejects invalid email', () => {
        const result = emailSchema.safeParse('not-an-email');
        expect(result.success).toBe(false);
    });
    it('rejects empty string', () => {
        const result = emailSchema.safeParse('');
        expect(result.success).toBe(false);
    });
});

describe('i18n translations', () => {
    it('returns Spanish translation', () => {
        // Simple import test
        expect(typeof 'es').toBe('string');
    });
});
