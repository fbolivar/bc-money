import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.VITE_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
);

function fmt(amount: number, currency = 'COP'): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

function weekRange(): { start: string; end: string } {
    const now = new Date();
    const day = now.getDay();
    const diffToMon = (day === 0 ? -6 : 1 - day);
    const mon = new Date(now);
    mon.setDate(now.getDate() + diffToMon);
    mon.setHours(0, 0, 0, 0);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    sun.setHours(23, 59, 59, 999);
    return { start: mon.toISOString(), end: sun.toISOString() };
}

function buildHtml(name: string, income: number, expenses: number, balance: number, topCategories: { name: string; total: number }[], currency: string): string {
    const net = income - expenses;
    const netColor = net >= 0 ? '#10B981' : '#EF4444';
    const catRows = topCategories.map(c =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #F3F4F6">${c.name}</td><td style="padding:6px 12px;border-bottom:1px solid #F3F4F6;text-align:right;color:#EF4444">${fmt(c.total, currency)}</td></tr>`
    ).join('');

    return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:Arial,sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08)">
    <div style="background:#6366F1;padding:28px 32px">
      <h1 style="margin:0;color:#FFFFFF;font-size:22px;font-weight:700">BC Money</h1>
      <p style="margin:6px 0 0;color:#C7D2FE;font-size:14px">Resumen financiero semanal</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 20px;color:#374151;font-size:15px">Hola <strong>${name}</strong>, aqui tienes tu resumen de esta semana:</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tbody>
          <tr style="background:#F0FDF4">
            <td style="padding:10px 14px;font-size:14px;color:#374151">Ingresos</td>
            <td style="padding:10px 14px;font-size:15px;font-weight:700;text-align:right;color:#10B981">${fmt(income, currency)}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;font-size:14px;color:#374151">Gastos</td>
            <td style="padding:10px 14px;font-size:15px;font-weight:700;text-align:right;color:#EF4444">${fmt(expenses, currency)}</td>
          </tr>
          <tr style="background:#F9FAFB">
            <td style="padding:10px 14px;font-size:14px;color:#374151">Balance neto</td>
            <td style="padding:10px 14px;font-size:15px;font-weight:700;text-align:right;color:${netColor}">${fmt(net, currency)}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;font-size:14px;color:#374151">Saldo total cuentas</td>
            <td style="padding:10px 14px;font-size:15px;font-weight:700;text-align:right;color:#6366F1">${fmt(balance, currency)}</td>
          </tr>
        </tbody>
      </table>
      ${topCategories.length > 0 ? `
      <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#374151">Top categorias de gasto</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;border:1px solid #F3F4F6;border-radius:8px;overflow:hidden">
        <tbody>${catRows}</tbody>
      </table>` : ''}
      <p style="margin:0;font-size:12px;color:#9CA3AF;border-top:1px solid #F3F4F6;padding-top:16px">
        Recibiste este correo porque activaste los resumenes semanales en BC Money.<br>
        Puedes desactivarlos en <strong>Configuracion &gt; Alertas</strong>.
      </p>
    </div>
  </div>
</body>
</html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

    const { data: users } = await supabase
        .from('profiles')
        .select('id, email, full_name, currency')
        .eq('email_alerts_enabled', true);

    if (!users?.length) return res.json({ sent: 0 });

    const { start, end } = weekRange();
    let sent = 0;

    for (const user of users) {
        const userId: string = user.id;
        const currency: string = user.currency ?? 'COP';

        const [{ data: txns }, { data: accounts }] = await Promise.all([
            supabase.from('transactions').select('type, amount, category_id').eq('user_id', userId).gte('date', start).lte('date', end),
            supabase.from('accounts').select('balance').eq('user_id', userId),
        ]);

        const income = (txns ?? []).filter(t => t.type === 'ingreso').reduce((s, t) => s + Number(t.amount), 0);
        const expenses = (txns ?? []).filter(t => t.type === 'gasto').reduce((s, t) => s + Number(t.amount), 0);
        const balance = (accounts ?? []).reduce((s, a) => s + Number(a.balance), 0);

        const catMap: Record<string, number> = {};
        for (const t of (txns ?? []).filter(t => t.type === 'gasto' && t.category_id)) {
            catMap[t.category_id] = (catMap[t.category_id] ?? 0) + Number(t.amount);
        }
        const topCatIds = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);

        const topCategories: { name: string; total: number }[] = [];
        if (topCatIds.length > 0) {
            const { data: cats } = await supabase.from('categories').select('id, name').in('id', topCatIds);
            for (const id of topCatIds) {
                const cat = (cats ?? []).find(c => c.id === id);
                topCategories.push({ name: cat?.name ?? 'Sin categoria', total: catMap[id] });
            }
        }

        const html = buildHtml(user.full_name ?? user.email, income, expenses, balance, topCategories, currency);

        const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            },
            body: JSON.stringify({
                from: 'BC Money <alertas@bcmoney.app>',
                to: user.email,
                subject: 'Resumen semanal - BC Money',
                html,
            }),
        });

        if (emailRes.ok) sent++;
    }

    res.json({ sent, users: users.length });
}
