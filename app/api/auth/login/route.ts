export const runtime = 'nodejs';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest){
  try{
    const { password } = await req.json();
    const expected = process.env.APP_PASSWORD || '';
    if (!expected) return new Response('Password not configured', { status: 500 });
    if (String(password) !== expected) return new Response('Invalid password', { status: 401 });
    const res = new Response('ok', { status: 200 });
    res.headers.append('Set-Cookie', `app_auth=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60*60*24*7}`);
    return res;
  } catch {
    return new Response('Bad request', { status: 400 });
  }
}


