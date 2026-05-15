export const config = { runtime: 'edge' };

interface InsightsContext {
    totalIncomeThisMonth: number;
    totalExpensesThisMonth: number;
    totalIncomePrevMonth: number;
    totalExpensesPrevMonth: number;
    totalActiveDebts: number;
    totalAccountBalance: number;
    activeBudgetsCount: number;
    topExpenseCategory: string;
    topExpenseCategoryAmount: number;
    savingsRate: number;
    currency: string;
}

function fmt(n: number, currency = 'COP') {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency, minimumFractionDigits: 0 }).format(n);
}

function buildPrompt(ctx: InsightsContext): string {
    const expenseDelta = ctx.totalExpensesPrevMonth > 0
        ? ((ctx.totalExpensesThisMonth - ctx.totalExpensesPrevMonth) / ctx.totalExpensesPrevMonth) * 100
        : 0;
    const incomeDelta = ctx.totalIncomePrevMonth > 0
        ? ((ctx.totalIncomeThisMonth - ctx.totalIncomePrevMonth) / ctx.totalIncomePrevMonth) * 100
        : 0;

    return `Eres BC Asesor, un asistente financiero colombiano. Analiza los datos financieros del usuario y genera exactamente 3 insights concisos y accionables en español.

Datos financieros:
- Ingresos este mes: ${fmt(ctx.totalIncomeThisMonth, ctx.currency)}
- Gastos este mes: ${fmt(ctx.totalExpensesThisMonth, ctx.currency)}
- Ingresos mes anterior: ${fmt(ctx.totalIncomePrevMonth, ctx.currency)}
- Gastos mes anterior: ${fmt(ctx.totalExpensesPrevMonth, ctx.currency)}
- Variación gastos vs mes anterior: ${expenseDelta > 0 ? '+' : ''}${expenseDelta.toFixed(1)}%
- Variación ingresos vs mes anterior: ${incomeDelta > 0 ? '+' : ''}${incomeDelta.toFixed(1)}%
- Tasa de ahorro este mes: ${ctx.savingsRate.toFixed(1)}%
- Deudas activas: ${fmt(ctx.totalActiveDebts, ctx.currency)}
- Saldo total cuentas: ${fmt(ctx.totalAccountBalance, ctx.currency)}
- Categoría con más gastos: ${ctx.topExpenseCategory} (${fmt(ctx.topExpenseCategoryAmount, ctx.currency)})
- Presupuestos activos: ${ctx.activeBudgetsCount}

Responde ÚNICAMENTE con un JSON válido con este formato exacto (sin texto adicional):
{
  "insights": [
    {"icon": "emoji", "title": "Título corto", "body": "Observación o recomendación concreta en 1-2 oraciones.", "type": "positive|warning|info"},
    {"icon": "emoji", "title": "Título corto", "body": "...", "type": "positive|warning|info"},
    {"icon": "emoji", "title": "Título corto", "body": "...", "type": "positive|warning|info"}
  ]
}

Usa type "positive" para buenas noticias, "warning" para alertas, "info" para observaciones neutras.
Sé específico con los números. No repitas información obvia.`;
}

export default async function handler(req: Request): Promise<Response> {
    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'API key not configured' }), {
            status: 500, headers: { 'Content-Type': 'application/json' },
        });
    }

    let ctx: InsightsContext;
    try {
        ctx = await req.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
            status: 400, headers: { 'Content-Type': 'application/json' },
        });
    }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 512,
            messages: [{ role: 'user', content: buildPrompt(ctx) }],
        }),
    });

    if (!anthropicRes.ok) {
        return new Response(JSON.stringify({ error: 'AI service error' }), {
            status: 502, headers: { 'Content-Type': 'application/json' },
        });
    }

    const aiData = (await anthropicRes.json()) as { content?: Array<{ type: string; text: string }> };
    const text = aiData.content?.find(b => b.type === 'text')?.text ?? '{}';

    try {
        const parsed = JSON.parse(text);
        return new Response(JSON.stringify(parsed), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch {
        return new Response(JSON.stringify({ insights: [] }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
