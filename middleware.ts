import { NextRequest, NextResponse } from 'next/server';
import { API_SESSION_COOKIE } from '@/lib/securityConstants';

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  if (!req.cookies.get(API_SESSION_COOKIE)?.value) {
    res.cookies.set(API_SESSION_COOKIE, crypto.randomUUID(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  }

  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo.svg|favicon.svg).*)',
  ],
};
