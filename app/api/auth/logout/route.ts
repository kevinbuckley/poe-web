export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest){
  // Clear cookie and redirect back to login
  const url = new URL('/login', req.url);
  const res = NextResponse.redirect(url);
  res.headers.set('Set-Cookie', 'app_auth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  return res;
}


