// DataLab · database access for the Edge Functions.
// Connects straight to Postgres with SUPABASE_DB_URL (provided by Supabase to every Edge Function as
// a secret — it never reaches the browser) so the private.* functions stay off the public Data API.
import postgres from 'npm:postgres@3.4.5';

const url = Deno.env.get('SUPABASE_DB_URL');
if (!url) console.error('SUPABASE_DB_URL is not set');

// prepare:false — required behind Supabase's transaction pooler
export const sql = postgres(url ?? '', { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10 });

// Throttle a user per bucket (raises rate_limited from the database).
export async function rateLimit(uid: string, bucket: string, max: number, windowSeconds: number) {
  await sql`select private.hit_rate(${uid}::uuid, ${bucket}, ${max}, ${windowSeconds})`;
}

export async function hasRole(uid: string, roles: string[]): Promise<boolean> {
  const rows = await sql`select private.has_role(${uid}::uuid, ${roles}::public.app_role[]) as ok`;
  return rows[0]?.ok === true;
}
