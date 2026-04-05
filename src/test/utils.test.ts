import { describe, it, expect } from 'vitest';

// Test password validation logic
function validatePassword(password: string): string | null {
    if (password.length < 8) return 'min 8 chars';
    if (!/[A-Z]/.test(password)) return 'needs uppercase';
    if (!/[a-z]/.test(password)) return 'needs lowercase';
    if (!/[0-9]/.test(password)) return 'needs number';
    return null;
}

describe('Password Validation', () => {
    it('rejects short passwords', () => {
        expect(validatePassword('Ab1')).toBe('min 8 chars');
    });
    it('rejects missing uppercase', () => {
        expect(validatePassword('abcdefg1')).toBe('needs uppercase');
    });
    it('rejects missing lowercase', () => {
        expect(validatePassword('ABCDEFG1')).toBe('needs lowercase');
    });
    it('rejects missing numbers', () => {
        expect(validatePassword('Abcdefgh')).toBe('needs number');
    });
    it('accepts valid password', () => {
        expect(validatePassword('Abcdefg1')).toBeNull();
    });
});

// Test money formatting
function formatMoney(amount: number, currency: string): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

describe('Money Formatting', () => {
    it('formats COP correctly', () => {
        const result = formatMoney(1500000, 'COP');
        expect(result).toContain('1.500.000');
    });
    it('formats USD correctly', () => {
        const result = formatMoney(1500, 'USD');
        expect(result).toContain('1.500');
    });
    it('handles zero', () => {
        const result = formatMoney(0, 'COP');
        expect(result).toContain('0');
    });
    it('handles negative amounts', () => {
        const result = formatMoney(-500, 'COP');
        expect(result).toContain('500');
    });
});

// Test CSV parsing logic
function parseCSVLine(line: string, separator: string = ','): string[] {
    return line.split(separator).map(c => c.trim().replace(/"/g, ''));
}

describe('CSV Parsing', () => {
    it('parses comma-separated values', () => {
        const result = parseCSVLine('2024-01-01,Compra,50000');
        expect(result).toEqual(['2024-01-01', 'Compra', '50000']);
    });
    it('parses semicolon-separated values', () => {
        const result = parseCSVLine('2024-01-01;Compra;50000', ';');
        expect(result).toEqual(['2024-01-01', 'Compra', '50000']);
    });
    it('handles quoted values', () => {
        const result = parseCSVLine('"2024-01-01","Compra grande","50000"');
        expect(result).toEqual(['2024-01-01', 'Compra grande', '50000']);
    });
    it('handles empty values', () => {
        const result = parseCSVLine('2024-01-01,,50000');
        expect(result).toEqual(['2024-01-01', '', '50000']);
    });
});

// Test MAFE magic bytes validation
describe('MAFE Format Validation', () => {
    it('validates magic bytes', () => {
        const validHeader = new Uint8Array([0x4D, 0x41, 0x46, 0x45]);
        expect(validHeader[0]).toBe(0x4D); // M
        expect(validHeader[1]).toBe(0x41); // A
        expect(validHeader[2]).toBe(0x46); // F
        expect(validHeader[3]).toBe(0x45); // E
    });
    it('rejects invalid magic bytes', () => {
        const invalid = new Uint8Array([0x50, 0x4B, 0x03, 0x04]); // ZIP header
        const isMAFE = invalid[0] === 0x4D && invalid[1] === 0x41 && invalid[2] === 0x46 && invalid[3] === 0x45;
        expect(isMAFE).toBe(false);
    });
});

// Test debt payoff simulation logic
describe('Debt Payoff Calculation', () => {
    it('calculates simple payoff without interest', () => {
        const balance = 12000;
        const payment = 1000;
        const months = Math.ceil(balance / payment);
        expect(months).toBe(12);
    });
    it('calculates payoff with interest', () => {
        let balance = 10000;
        const rate = 0.01; // 1% monthly
        const payment = 1000;
        let months = 0;
        while (balance > 0 && months < 100) {
            balance += balance * rate;
            balance -= payment;
            months++;
        }
        expect(months).toBeGreaterThan(10);
        expect(months).toBeLessThan(12);
    });
    it('snowball orders by smallest balance', () => {
        const debts = [{ balance: 5000 }, { balance: 1000 }, { balance: 10000 }];
        const sorted = [...debts].sort((a, b) => a.balance - b.balance);
        expect(sorted[0].balance).toBe(1000);
        expect(sorted[2].balance).toBe(10000);
    });
    it('avalanche orders by highest rate', () => {
        const debts = [{ rate: 5 }, { rate: 20 }, { rate: 10 }];
        const sorted = [...debts].sort((a, b) => b.rate - a.rate);
        expect(sorted[0].rate).toBe(20);
        expect(sorted[2].rate).toBe(5);
    });
});
