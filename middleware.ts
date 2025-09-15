import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const appPassword = process.env.APP_PASSWORD;
  // In production, still run middleware even if env missing; otherwise skip
  if (!appPassword && process.env.NODE_ENV !== 'production') return NextResponse.next();

  const { pathname, search } = req.nextUrl;

  // Allowlisted paths
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/public') ||
    pathname.startsWith('/_vercel') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth')
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
  // Run middleware on all paths; we internally allowlist assets/auth
  matcher: ['/:path*'],
};


