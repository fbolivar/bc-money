/**
 * Parse a date string (YYYY-MM-DD) without timezone shift.
 * new Date('2024-04-01') creates UTC midnight which becomes March 31 in UTC-5.
 * This function creates the date in local timezone instead.
 */
export function parseLocalDate(dateStr: string): Date {
    if (!dateStr) return new Date();
    // If it already has time component, parse normally
    if (dateStr.includes('T')) return new Date(dateStr);
    // Split YYYY-MM-DD and create in local timezone
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
}
