// DataLab · Edge Function "payments-webhook": AbacatePay calls this when a checkout changes
// (checkout.completed, checkout.refunded…). Configure in AbacatePay:
//   https://<ref>.supabase.co/functions/v1/payments-webhook?webhookSecret=<ABACATEPAY_WEBHOOK_SECRET>
// The event is only a trigger: the order is settled from AbacatePay's own API answer, so a forged
// call can at most make us re-check a real checkout. verify_jwt = false (AbacatePay has no Supabase JWT).
import { sql } from '../_shared/db.ts';
import { settleFromProvider } from '../_shared/abacatepay.ts';

const SECRET = Deno.env.get('ABACATEPAY_WEBHOOK_SECRET') ?? '';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function same(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

// the checkout id and our order id, wherever this event version keeps them
function refsOf(ev: Record<string, any>): { checkout: string | null; order: string | null } {
  const d = ev?.data ?? {};
  const c = d.checkout ?? d.billing ?? d;
  const checkout = [c?.id, d?.id].find((v) => typeof v === 'string' && v.startsWith('bill_')) ?? null;
  const order = [c?.externalId, c?.metadata?.order, d?.externalId, d?.metadata?.order].find((v) => typeof v === 'string' && UUID.test(v)) ?? null;
  return { checkout, order };
}

const reply = (status: number, msg: string) => new Response(JSON.stringify({ ok: status < 400, message: msg }), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, 'POST only');
  if (!SECRET || !same(new URL(req.url).searchParams.get('webhookSecret') ?? '', SECRET)) return reply(401, 'bad secret');
  const text = await req.text();
  if (text.length > 64 * 1024) return reply(413, 'too large');
  let ev: Record<string, any>;
  try { ev = JSON.parse(text); } catch { return reply(400, 'bad json'); }

  const { checkout, order } = refsOf(ev);
  if (!checkout && !order) return reply(200, 'ignored'); // not about a checkout
  const [o] = checkout
    ? await sql`select id, checkout_id from public.payment_orders where checkout_id = ${checkout}`
    : await sql`select id, checkout_id from public.payment_orders where id = ${order}::uuid`;
  if (!o || !o.checkout_id) return reply(200, 'unknown order'); // another app on the same account
  try {
    const r = await settleFromProvider(o.id, o.checkout_id);
    return reply(200, 'order ' + r.status);
  } catch (e) {
    console.error('webhook settle failed', o.id, String((e as Error)?.message ?? e));
    return reply(500, 'retry'); // AbacatePay retries; the game's status check also settles it
  }
});
