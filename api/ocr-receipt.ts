export const config = { runtime: 'edge' };

interface OcrRequestBody {
    imageBase64: string;
    mimeType: string;
}

interface OcrResult {
    amount: number | null;
    merchant: string | null;
    date: string | null;
    description: string | null;
}

export default async function handler(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200 });
    }

    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseAnonKey) {
        const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
            headers: {
                Authorization: authHeader,
                apikey: supabaseAnonKey,
            },
        });
        if (!userRes.ok) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    let body: OcrRequestBody;
    try {
        body = await req.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const { imageBase64, mimeType } = body;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 256,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: mimeType,
                                data: imageBase64,
                            },
                        },
                        {
                            type: 'text',
                            text: 'Analiza este recibo/tiquete y extrae: monto total (número sin símbolo de moneda), nombre del comercio o establecimiento, fecha (formato YYYY-MM-DD), y descripción breve. Responde SOLO con JSON válido: {"amount": number, "merchant": "string", "date": "YYYY-MM-DD", "description": "string"}. Si no puedes determinar algún campo, usa null.',
                        },
                    ],
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
    const text = data.content?.find(b => b.type === 'text')?.text ?? '{}';

    let result: OcrResult;
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        result = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
        result = { amount: null, merchant: null, date: null, description: null };
    }

    return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
    });
}
