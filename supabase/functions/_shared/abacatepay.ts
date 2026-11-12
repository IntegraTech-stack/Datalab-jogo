// DataLab · AbacatePay API (v2) for the Edge Functions. The API key is a secret of the functions
// (ABACATEPAY_API_KEY) and never reaches the browser. Docs: https://docs.abacatepay.com
import { HttpError } from './http.ts';
import { sql } from './db.ts';

const BASE = 'https://api.abacatepay.com/v2';
const KEY = Deno.env.get('ABACATEPAY_API_KEY') ?? '';

async function api<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  if (!KEY) {
    console.error('ABACATEPAY_API_KEY is not set');
    throw new HttpError(503, 'payments_off', 'Pagamentos indisponíveis no momento.');
  }
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    console.error('abacatepay network', path, String(e));
    throw new HttpError(502, 'payments_unreachable', 'Não foi possível falar com o pagamento. Tente de novo.');
  }
  const out = await res.json().catch(() => null) as { data?: T; error?: unknown } | null;
  if (!res.ok || !out || out.error || out.data === undefined) {
    console.error('abacatepay error', path, res.status, JSON.stringify(out && out.error));
    throw new HttpError(502, 'payments_error', 'O pagamento recusou o pedido. Tente de novo em instantes.');
  }
  return out.data;
}

export interface Checkout {
  id: string;
  url: string;
  externalId?: string | null;
  amount: number;
  paidAmount?: number | null;
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED' | 'REFUNDED';
}

interface Product { id: string; externalId?: string; price: number; status?: string }
interface Pack { sku: string; name: string; price_cents: number; product_id: string | null }

// The pack's AbacatePay product: the one saved in gold_packs, else the product with externalId = sku,
// else a new one created with the pack's price. Saved back so the lookup happens once.
export async function productFor(pack: Pack): Promise<string> {
  if (pack.product_id) return pack.product_id;
  const found = await api<Product[]>('GET', '/products/list?externalId=' + encodeURIComponent(pack.sku));
  let p = (found || []).find((x) => x.externalId === pack.sku && x.status !== 'INACTIVE');
  if (!p) p = await api<Product>('POST', '/products/create', { externalId: pack.sku, name: pack.name, price: pack.price_cents, currency: 'BRL', description: 'DataLab · ' + pack.name });
  if (p.price !== pack.price_cents) console.error('abacatepay product price differs from gold_packs', pack.sku, p.price, pack.price_cents);
  await sql`update public.gold_packs set provider_product_id = ${p.id} where sku = ${pack.sku} and provider_product_id is null`;
  return p.id;
}

export function createCheckout(productId: string, orderId: string, uid: string, sku: string, site: string | null): Promise<Checkout> {
  return api<Checkout>('POST', '/checkouts/create', {
    items: [{ id: productId, quantity: 1 }],
    methods: ['PIX'], // Pix only: no card on the AbacatePay page
    externalId: orderId,
    metadata: { order: orderId, user: uid, sku },
    ...(site ? { returnUrl: site + '/jogo.html', completionUrl: site + '/pagamento.html' } : {}),
  });
}

export const getCheckout = (id: string) => api<Checkout>('GET', '/checkouts/get?id=' + encodeURIComponent(id));

// Settle an order from AbacatePay's own answer (never from what a webhook or the browser claims).
export async function settleFromProvider(orderId: string, checkoutId: string) {
  const c = await getCheckout(checkoutId);
  if (c.externalId && c.externalId !== orderId) throw new HttpError(409, 'checkout_mismatch', 'Pagamento não corresponde ao pedido.');
  const amount = c.paidAmount ?? (c.status === 'PAID' ? c.amount : null);
  const [r] = await sql`select private.payment_settle(${orderId}::uuid, ${c.status}, ${amount}) as r`;
  return r.r;
}
