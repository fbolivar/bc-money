// Aplica reglas a una lista de transacciones, devuelve las transacciones con category_id sugerido
export interface CategorizationRule {
    id: string;
    keyword: string;
    category_id: string;
    match_type: 'contains' | 'starts_with' | 'exact';
    field: 'description' | 'merchant';
    priority: number;
}

export function applyRules(
    transactions: Array<{ description?: string | null; merchant?: string | null; category_id?: string | null }>,
    rules: CategorizationRule[],
): typeof transactions {
    const sorted = [...rules].sort((a, b) => b.priority - a.priority);
    return transactions.map(tx => {
        if (tx.category_id) return tx; // ya tiene categoría
        for (const rule of sorted) {
            const haystack = (rule.field === 'merchant' ? tx.merchant : tx.description) ?? '';
            const needle = rule.keyword.toLowerCase();
            const hay = haystack.toLowerCase();
            const match =
                rule.match_type === 'contains'
                    ? hay.includes(needle)
                    : rule.match_type === 'starts_with'
                      ? hay.startsWith(needle)
                      : hay === needle;
            if (match) return { ...tx, category_id: rule.category_id };
        }
        return tx;
    });
}
