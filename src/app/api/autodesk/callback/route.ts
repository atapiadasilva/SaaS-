import { NextRequest, NextResponse } from 'next/server';

const CLIENT_ID     = process.env.AUTODESK_CLIENT_ID!;
const CLIENT_SECRET = process.env.AUTODESK_CLIENT_SECRET!;
const CALLBACK_URL  = process.env.AUTODESK_CALLBACK_URL!;

export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state') ?? '';

  // Decode base64 state back to returnTo path
  let returnTo = '/';
  try {
    returnTo = Buffer.from(state, 'base64').toString('utf-8');
  } catch { returnTo = '/'; }

  if (!code) {
    return NextResponse.redirect(new URL(returnTo + '?aps_error=no_code', req.url));
  }

  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri:  CALLBACK_URL,
  });

  const tokenRes = await fetch(
    'https://developer.api.autodesk.com/authentication/v2/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }
  );

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    console.error('APS token error:', tokenData);
    return NextResponse.redirect(new URL(returnTo + '?aps_error=token_failed', req.url));
  }

  const res = NextResponse.redirect(new URL(returnTo + '?aps_connected=1', req.url));

  res.cookies.set('aps_token', tokenData.access_token, {
    httpOnly: true,
    secure: false, // localhost
    sameSite: 'lax',
    maxAge: tokenData.expires_in ?? 3600,
    path: '/',
  });

  if (tokenData.refresh_token) {
    res.cookies.set('aps_refresh', tokenData.refresh_token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });
  }

  return res;
}
