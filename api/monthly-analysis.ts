import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.VITE_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';

async function callClaude(prompt: string): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 500,
            messages: [{ role: 'user', content: prompt }],
        }),
    });
    if (!res.ok) return '';
    const data = (await res.json()) as { content?: Array<{ type: string; text: string }> };
    return data.content?.[0]?.text ?? '';
}

function fmt(n: number, currency = 'COP') {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

function buildEmail(name: string, analysis: string, income: number, expenses: number, savings: number, currency: string): string {
    const savingsRate = income > 0 ? ((income - expenses) / income * 100).toFixed(1) : '0';
    return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:Arial,sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)">
    <div style="background:linear-gradient(135deg,#6366F1,#8B5CF6);padding:28px 32px">
      <h1 style="margin:0;color:#fff;font-size:22px">🤖 Análisis Mensual IA</h1>
      <p style="margin:6px 0 0;color:#C7D2FE;font-size:14px">Tu resumen financiero personalizado</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 20px;color:#374151">Hola <strong>${name}</strong>, esto fue lo que pasó con tus finanzas el mes pasado:</p>
      <div style="display:flex;gap:12px;margin-bottom:24px">
        <div style="flex:1;background:#F0FDF4;border-radius:8px;padding:14px;text-align:center">
          <div style="font-size:11px;color:#6B7280;text-transform:uppercase;margin-bottom:4px">Ingresos</div>
          <div style="font-size:16px;font-weight:700;color:#10B981">${fmt(income, currency)}</div>
        </div>
        <div style="flex:1;background:#FFF1F2;border-radius:8px;padding:14px;text-align:center">
          <div style="font-size:11px;color:#6B7280;text-transform:uppercase;margin-bottom:4px">Gastos</div>
          <div style="font-size:16px;font-weight:700;color:#EF4444">${fmt(expenses, currency)}</div>
        </div>
        <div style="flex:1;background:#EFF6FF;border-radius:8px;padding:14px;text-align:center">
          <div style="font-size:11px;color:#6B7280;text-transform:uppercase;margin-bottom:4px">Ahorro</div>
          <div style="font-size:16px;font-weight:700;color:#3B82F6">${savingsRate}%</div>
        </div>
      </div>
      <div style="background:#F8F7FF;border-left:4px solid #6366F1;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px">
        <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#6366F1;text-transform:uppercase">Análisis de tu asesor IA</p>
        <div style="font-size:14px;color:#374151;line-height:1.7;white-space:pre-wrap">${analysis}</div>
      </div>
      <p style="margin:0;font-size:13px;color:#9CA3AF;text-align:center">BC Money · Tu finanzas personales inteligentes</p>
    </div>
  </div>
</body>
</html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

    const now = new Date();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);

    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, currency')
        .eq('onboarding_completed', true);

    if (!profiles?.length) return res.json({ sent: 0 });

    const RESEND_KEY = process.env.RESEND_API_KEY;
    let sent = 0;

    for (const profile of profiles) {
        try {
            const { data: txs } = await supabase
                .from('transactions')
                .select('amount, type, category_id, categories(name), description')
                .eq('user_id', profile.id)
                .gte('date', lastMonthStart)
                .lte('date', lastMonthEnd);

            if (!txs?.length) continue;

            const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
            const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
            const savings = income - expenses;

            // Group by category
            const byCategory: Record<string, number> = {};
            for (const t of txs.filter(t => t.type === 'expense')) {
                const cat = (t.categories as { name?: string } | null)?.name ?? 'Sin categoría';
                byCategory[cat] = (byCategory[cat] ?? 0) + Number(t.amount);
            }
            const topCats = Object.entries(byCategory)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([name, amount]) => `- ${name}: ${fmt(amount, profile.currency)}`)
                .join('\n');

            const savingsRate = income > 0 ? ((savings / income) * 100).toFixed(1) : '0';

            const prompt = `Eres BC Asesor, un experto financiero colombiano amigable y directo.
Analiza las finanzas de ${profile.full_name || 'este usuario'} del mes pasado:

Ingresos: ${fmt(income, profile.currency)}
Gastos: ${fmt(expenses, profile.currency)}
Ahorro: ${fmt(savings, profile.currency)} (${savingsRate}%)
Transacciones: ${txs.length}

Top gastos por categoría:
${topCats || 'Sin datos de categorías'}

Moneda: ${profile.currency}

Escribe un análisis personalizado en español de 3-4 párrafos que:
1. Evalúe su tasa de ahorro (ideal >20% según regla 50/30/20)
2. Señale 1-2 categorías donde podría optimizar
3. Dé 1-2 recomendaciones concretas y accionables para el próximo mes
4. Termine con un mensaje motivador

Sé directo, amigable y usa emojis ocasionalmente. Máximo 250 palabras.`;

            const analysis = await callClaude(prompt);
            if (!analysis) continue;

            if (RESEND_KEY && profile.email) {
                await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        from: 'BC Money <noreply@bc-security.com>',
                        to: [profile.email],
                        subject: `📊 Tu análisis financiero de ${new Date(lastMonthStart).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })}`,
                        html: buildEmail(profile.full_name || 'Usuario', analysis, income, expenses, savings, profile.currency),
                    }),
                });
                sent++;
            }
        } catch { /* skip user on error */ }
    }

    res.json({ sent, total: profiles.length });
}
