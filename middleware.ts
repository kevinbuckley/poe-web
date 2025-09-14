import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const appPassword = process.env.APP_PASSWORD;
  // If no password configured, do nothing
  if (!appPassword) return NextResponse.next();

  const { pathname, search } = req.nextUrl;

  // Allowlisted paths
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/public') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/login')
  ) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get('app_auth')?.value;
  if (cookie === '1') return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  if (pathname !== '/') url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!.*\.).*)'],
};


