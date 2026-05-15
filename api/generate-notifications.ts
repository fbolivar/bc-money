export const config = { runtime: 'edge' };

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

interface NotificationInsert {
  user_id: string;
  title: string;
  body: string;
  type: string;
  link?: string;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const token = authHeader.slice(7);
  const anonClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
  const userId = user.id;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: existing } = await serviceClient
    .from('app_notifications')
    .select('title')
    .eq('user_id', userId)
    .gte('created_at', todayStart.toISOString());

  const existingTitles = new Set((existing ?? []).map((n: { title: string }) => n.title));

  const toInsert: NotificationInsert[] = [];

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const threeDaysAhead = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);

  const [budgetsRes, txRes, catRes] = await Promise.all([
    serviceClient.from('budgets').select('id,category_id,amount').eq('user_id', userId),
    serviceClient.from('transactions').select('category_id,amount').eq('user_id', userId).eq('type', 'expense')
      .gte('date', monthStart).lte('date', monthEnd),
    serviceClient.from('categories').select('id,name').or(`user_id.eq.${userId},is_system.eq.true`),
  ]);

  if (budgetsRes.data && txRes.data && catRes.data) {
    for (const b of budgetsRes.data) {
      const spent = txRes.data
        .filter((t: { category_id: string; amount: number }) => t.category_id === b.category_id)
        .reduce((s: number, t: { amount: number }) => s + Number(t.amount), 0);
      const pct = Number(b.amount) > 0 ? (spent / Number(b.amount)) * 100 : 0;
      if (pct >= 80) {
        const cat = catRes.data.find((c: { id: string; name: string }) => c.id === b.category_id);
        const catName = cat?.name ?? 'Presupuesto';
        const title = `Presupuesto: ${catName}`;
        if (!existingTitles.has(title)) {
          toInsert.push({
            user_id: userId,
            title,
            body: pct >= 100
              ? `Has excedido el presupuesto de ${catName} (${Math.round(pct)}% usado este mes)`
              : `Llevas el ${Math.round(pct)}% del presupuesto de ${catName} este mes`,
            type: pct >= 100 ? 'danger' : 'warning',
            link: '/presupuestos',
          });
        }
      }
    }
  }

  const { data: subscriptions } = await serviceClient
    .from('subscriptions')
    .select('id,name,next_billing_date')
    .eq('user_id', userId)
    .eq('status', 'active')
    .lte('next_billing_date', threeDaysAhead)
    .gte('next_billing_date', todayStr);

  for (const s of subscriptions ?? []) {
    const title = `Suscripción: ${s.name}`;
    if (!existingTitles.has(title)) {
      const days = Math.ceil((new Date(s.next_billing_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      toInsert.push({
        user_id: userId,
        title,
        body: days <= 0 ? `La suscripción ${s.name} vence hoy` : `La suscripción ${s.name} vence en ${days} día${days > 1 ? 's' : ''}`,
        type: 'warning',
        link: '/suscripciones',
      });
    }
  }

  const { data: debts } = await serviceClient
    .from('debts')
    .select('id,name,next_payment_date')
    .eq('user_id', userId)
    .eq('status', 'active')
    .lte('next_payment_date', threeDaysAhead)
    .gte('next_payment_date', todayStr);

  for (const d of debts ?? []) {
    const title = `Deuda: ${d.name}`;
    if (!existingTitles.has(title)) {
      const days = Math.ceil((new Date(d.next_payment_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      toInsert.push({
        user_id: userId,
        title,
        body: days <= 0 ? `Pago de ${d.name} vence hoy` : `Pago de ${d.name} vence en ${days} día${days > 1 ? 's' : ''}`,
        type: 'danger',
        link: '/deudas',
      });
    }
  }

  const { data: goals } = await serviceClient
    .from('goals')
    .select('id,name,current_amount,target_amount')
    .eq('user_id', userId);

  for (const g of goals ?? []) {
    if (Number(g.current_amount) >= Number(g.target_amount) && Number(g.target_amount) > 0) {
      const title = `Meta alcanzada: ${g.name}`;
      if (!existingTitles.has(title)) {
        toInsert.push({
          user_id: userId,
          title,
          body: `Felicitaciones, has alcanzado tu meta "${g.name}"`,
          type: 'success',
          link: '/metas',
        });
      }
    }
  }

  // ── Detección de gastos anómalos ─────────────────────────────────────────
  // Compara gasto del mes actual por categoría vs promedio de los 3 meses previos
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);

  const { data: historicalTx } = await serviceClient
    .from('transactions')
    .select('category_id, amount, date')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .gte('date', threeMonthsAgo)
    .lte('date', prevMonthEnd);

  const { data: currentTx } = await serviceClient
    .from('transactions')
    .select('category_id, amount')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .gte('date', monthStart)
    .lte('date', monthEnd);

  if (historicalTx && currentTx && catRes.data) {
    // Acumular gasto histórico por categoría (3 meses)
    const historicalByCat: Record<string, number[]> = {};
    for (const t of historicalTx) {
      if (!t.category_id) continue;
      const txMonth = t.date.slice(0, 7);
      if (!historicalByCat[t.category_id]) historicalByCat[t.category_id] = [];
      // Guardar como [mes, monto] para luego agrupar por mes
      const idx = historicalByCat[t.category_id].findIndex((_, i) => i === 0);
      historicalByCat[t.category_id].push(Number(t.amount));
      void txMonth; void idx;
    }

    // Gasto histórico agrupado por mes y categoría
    const monthlyByCat: Record<string, Record<string, number>> = {};
    for (const t of historicalTx) {
      if (!t.category_id) continue;
      const m = t.date.slice(0, 7);
      if (!monthlyByCat[t.category_id]) monthlyByCat[t.category_id] = {};
      monthlyByCat[t.category_id][m] = (monthlyByCat[t.category_id][m] ?? 0) + Number(t.amount);
    }

    // Gasto actual por categoría
    const currentByCat: Record<string, number> = {};
    for (const t of currentTx) {
      if (!t.category_id) continue;
      currentByCat[t.category_id] = (currentByCat[t.category_id] ?? 0) + Number(t.amount);
    }

    for (const [catId, current] of Object.entries(currentByCat)) {
      const monthlyAmounts = Object.values(monthlyByCat[catId] ?? {});
      if (monthlyAmounts.length < 2) continue; // necesita al menos 2 meses de historial
      const avg = monthlyAmounts.reduce((a, b) => a + b, 0) / monthlyAmounts.length;
      if (avg < 10000) continue; // ignorar categorías con gasto mínimo
      const ratio = current / avg;
      if (ratio >= 1.5) {
        const cat = catRes.data.find((c: { id: string; name: string }) => c.id === catId);
        const catName = cat?.name ?? 'Una categoría';
        const title = `Gasto inusual: ${catName}`;
        if (!existingTitles.has(title)) {
          toInsert.push({
            user_id: userId,
            title,
            body: `Llevas ${ratio.toFixed(1)}x más de lo habitual en ${catName} este mes`,
            type: ratio >= 2 ? 'danger' : 'warning',
            link: '/reportes',
          });
        }
      }
    }
  }

  if (toInsert.length > 0) {
    await serviceClient.from('app_notifications').insert(toInsert);
  }

  return new Response(JSON.stringify({ inserted: toInsert.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
