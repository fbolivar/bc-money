export const config = { runtime: 'edge' };

interface StatementAnalysis {
    dateColumn: string;
    amountColumn: string;
    descriptionColumn: string;
    typeColumn: string | null;
    creditIndicator: string | null;
    debitIndicator: string | null;
    dateFormat: string;
    delimiter: string;
    skipRows: number;
    bankName: string | null;
}

const ANALYSIS_PROMPT = `Analiza este extracto bancario CSV colombiano y devuelve SOLO JSON válido:
{
  "dateColumn": "nombre exacto de la columna de fecha",
  "amountColumn": "nombre exacto de la columna de monto",
  "descriptionColumn": "nombre exacto de la columna de descripción",
  "typeColumn": "nombre de columna que indica tipo (ingreso/gasto) o null si no existe",
  "creditIndicator": "texto que indica ingreso (ej: 'Crédito', 'CR', '+') o null",
  "debitIndicator": "texto que indica gasto (ej: 'Débito', 'DB', '-') o null",
  "dateFormat": "formato de fecha detectado (ej: 'DD/MM/YYYY', 'YYYY-MM-DD')",
  "delimiter": "delimitador detectado (coma, punto y coma, tab)",
  "skipRows": número de filas a saltar al inicio,
  "bankName": "nombre del banco detectado o null"
}`;

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
            { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return new Response(
            JSON.stringify({ error: 'Missing or invalid Authorization header' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
        );
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey) {
        const token = authHeader.slice(7);
        const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
            headers: {
                Authorization: `Bearer ${token}`,
                apikey: supabaseAnonKey,
            },
        });
        if (!userRes.ok) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } },
            );
        }
    }

    let body: { csvContent?: string };
    try {
        body = await req.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const { csvContent } = body;
    if (!csvContent || typeof csvContent !== 'string') {
        return new Response(JSON.stringify({ error: 'csvContent is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    if (csvContent.length > 51200) {
        return new Response(JSON.stringify({ error: 'csvContent exceeds 50KB limit' }), {
            status: 413,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const lines = csvContent.split('\n').filter(l => l.trim()).slice(0, 20).join('\n');

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
            system: 'Eres un analizador experto de extractos bancarios colombianos. Devuelves SOLO JSON válido, sin texto adicional, sin markdown, sin bloques de código.',
            messages: [
                {
                    role: 'user',
                    content: `${ANALYSIS_PROMPT}\n\nExtracto:\n${lines}`,
                },
            ],
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
    const rawText = data.content?.find(b => b.type === 'text')?.text ?? '';

    let analysis: StatementAnalysis;
    try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON object found in response');
        analysis = JSON.parse(jsonMatch[0]) as StatementAnalysis;
    } catch {
        return new Response(
            JSON.stringify({ error: 'Failed to parse AI response', raw: rawText }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
    }

    return new Response(JSON.stringify(analysis), {
        headers: { 'Content-Type': 'application/json' },
    });
}
