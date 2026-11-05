import { db } from "@/db";
import { scores } from "@/db/schema";
import { desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

let ready: Promise<unknown> | null = null;
function ensure() {
  ready ??= db.execute(
    sql`create table if not exists scores (id serial primary key, name text not null, wave integer not null, created_at timestamp not null default now())`
  );
  return ready;
}

export async function GET() {
  try {
    await ensure();
    const rows = await db.select({ name: scores.name, wave: scores.wave }).from(scores).orderBy(desc(scores.wave)).limit(10);
    return Response.json({ scores: rows });
  } catch {
    return Response.json({ scores: [] });
  }
}

export async function POST(req: Request) {
  try {
    await ensure();
    const body = (await req.json()) as { name?: string; wave?: number };
    const name = String(body.name ?? "فرمانده").trim().slice(0, 20) || "فرمانده";
    const wave = Math.floor(Number(body.wave));
    if (!Number.isFinite(wave) || wave < 1 || wave > 10000) return Response.json({ ok: false }, { status: 400 });
    await db.insert(scores).values({ name, wave });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
