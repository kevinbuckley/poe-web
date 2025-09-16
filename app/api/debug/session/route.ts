export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { getSession, getEventLen } from '../../../../lib/store/sessions';
import { storageMode } from '../../../../lib/store/sessions';

export async function GET(req: NextRequest){
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id') || '';
  const session = await getSession(id);
  const events = id ? await getEventLen(id).catch(()=>0) : 0;
  const body = { ok: !!session, storage: storageMode(), id, events, session: session || null };
  return new Response(JSON.stringify(body, null, 2), { headers: { 'Content-Type':'application/json' }, status: session ? 200 : 404 });
}


