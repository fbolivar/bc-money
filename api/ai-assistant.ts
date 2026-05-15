export const config = { runtime: 'edge' };

const SYSTEM_PROMPT = `Eres BC Asesor, un asistente financiero personal especializado en finanzas colombianas.
Ayudas a los usuarios con:
- Análisis de sus finanzas personales (ingresos, gastos, deudas, ahorros)
- Consejos para ahorrar y mejorar su situación financiera
- Dudas sobre impuestos en Colombia (IVA, retención en la fuente, renta, ICA)
- Información sobre el sistema financiero colombiano
- Planificación financiera y metas de ahorro
- Interpretación de sus datos financieros en BC Money

Responde siempre en español colombiano, de manera clara, amigable y profesional.
Cuando el usuario comparte datos financieros, analízalos y da recomendaciones específicas y accionables.
Mantén las respuestas concisas (máximo 3-4 párrafos) salvo que el usuario pida más detalle.`;

function buildSystemPrompt(context: Record<string, unknown> | null): string {
    if (!context) return SYSTEM_PROMPT;

    const fmt = (n: number) =>
        new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);

    return `${SYSTEM_PROMPT}

Contexto financiero actual del usuario (este mes):
- Ingresos: ${fmt(Number(context.totalIncomeThisMonth ?? 0))}
- Gastos: ${fmt(Number(context.totalExpensesThisMonth ?? 0))}
- Balance (ingresos - gastos): ${fmt(Number(context.totalIncomeThisMonth ?? 0) - Number(context.totalExpensesThisMonth ?? 0))}
- Presupuestos activos: ${context.activeBudgetsCount ?? 0}
- Deudas activas: ${fmt(Number(context.totalActiveDebts ?? 0))}
- Saldo total en cuentas: ${fmt(Number(context.totalAccountBalance ?? 0))}
- Moneda: ${context.currency ?? 'COP'}

Usa estos datos para dar recomendaciones personalizadas cuando sea relevante.`;
}

export default async function handler(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200 });
    }

    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return new Response(
            JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }

    let body: { messages?: Array<{ role: string; content: string }>; context?: Record<string, unknown> | null };
    try {
        body = await req.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const { messages = [], context = null } = body;

    const validMessages = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: String(m.content) }));

    if (validMessages.length === 0) {
        return new Response(JSON.stringify({ error: 'No messages provided' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
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
            max_tokens: 1024,
            system: buildSystemPrompt(context),
            messages: validMessages,
        }),
    });

    if (!anthropicRes.ok) {
        const errText = await anthropicRes.text();
        return new Response(JSON.stringify({ error: errText }), {
            status: anthropicRes.status,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const data = (await anthropicRes.json()) as { content?: Array<{ type: string; text: string }> };
    const content = data.content?.find(b => b.type === 'text')?.text ?? '';

    return new Response(JSON.stringify({ content }), {
        headers: { 'Content-Type': 'application/json' },
    });
}
