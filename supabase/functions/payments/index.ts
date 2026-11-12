// DataLab · Edge Function "payments": buy Gold with real money (AbacatePay).
// POST { action: 'checkout', sku } → { order_id, url }   (open url: AbacatePay's payment page)
//      { action: 'status', order_id } → { order_id, status, coins, state }   (asks AbacatePay, credits when paid)
import { serve, json, readJson, str, uuid, ITEM_ID, HttpError } from '../_shared/http.ts';
import { requireUser } from '../_shared/auth.ts';
import { sql, rateLimit } from '../_shared/db.ts';
import { productFor, createCheckout, settleFromProvider } from '../_shared/abacatepay.ts';

// where AbacatePay sends the player back: the game's own origin (when allowed and https) or SITE_URL
const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
function siteOf(req: Request): string | null {
  const origin = req.headers.get('Origin') ?? '';
  if (origin.startsWith('https://') && allowed.includes(origin)) return origin;
  const site = (Deno.env.get('SITE_URL') ?? '').replace(/\/+$/, '');
  return site.startsWith('https://') ? site : null;
}

serve(async (req) => {
  const user = await requireUser(req);
  const body = await readJson(req, 2048);
  switch (body.action) {
    case 'checkout': {
      await rateLimit(user.id, 'pay', 6, 60);
      const sku = str(body.sku, 'sku', ITEM_ID);
      const [o] = await sql`select private.payment_order_new(${user.id}::uuid, ${sku}) as r`;
      const order = o.r as { order_id: string; sku: string; name: string; price_cents: number; product_id: string | null };
      try {
        const product = await productFor(order);
        const c = await createCheckout(product, order.order_id, user.id, order.sku, siteOf(req));
        await sql`select private.payment_order_attach(${order.order_id}::uuid, ${c.id}, ${c.url})`;
        return json(req, 200, { order_id: order.order_id, url: c.url });
      } catch (e) {
        await sql`select private.payment_order_fail(${order.order_id}::uuid)`;
        throw e;
      }
    }
    case 'status': {
      await rateLimit(user.id, 'pay_status', 40, 60);
      const id = uuid(body.order_id, 'order_id');
      const [o] = await sql`select id, status, coins, checkout_id from public.payment_orders where id = ${id}::uuid and user_id = ${user.id}::uuid`;
      if (!o) throw new HttpError(404, 'order_not_found', 'Pedido inexistente.');
      if (o.status !== 'pending' || !o.checkout_id) {
        const [s] = await sql`select private.inventory_state(${user.id}::uuid) as r`;
        return json(req, 200, { order_id: o.id, status: o.status, coins: o.coins, state: s.r });
      }
      return json(req, 200, await settleFromProvider(o.id, o.checkout_id));
    }
    default:
      throw new HttpError(400, 'bad_action', 'Ação desconhecida.');
  }
});
