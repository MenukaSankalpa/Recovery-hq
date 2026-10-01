import { NextResponse } from 'next/server';
import { COOKIE, verifyToken } from '@/lib/jwt';

export async function middleware(req) {
  const ok = await verifyToken(req.cookies.get(COOKIE)?.value);
  if (!ok) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Protect every page except login / setup / API (API routes check auth themselves) / static files
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icon.svg|login|setup).*)'],
};
