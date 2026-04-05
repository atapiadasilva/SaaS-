import { NextRequest, NextResponse } from 'next/server';

const CLIENT_ID    = process.env.AUTODESK_CLIENT_ID!;
const CALLBACK_URL = process.env.AUTODESK_CALLBACK_URL!;

export async function GET(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get('returnTo') ?? '/';

  // state must be simple — no nested encoding
  const state = Buffer.from(returnTo).toString('base64').replace(/=/g, '');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     CLIENT_ID,
    redirect_uri:  CALLBACK_URL,
    scope:         'data:read viewables:read',
    state,
  });

  const authUrl = `https://developer.api.autodesk.com/authentication/v2/authorize?${params.toString()}`;
  return NextResponse.redirect(authUrl);
}
