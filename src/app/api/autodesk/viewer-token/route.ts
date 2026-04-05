import { NextRequest, NextResponse } from 'next/server';

const CLIENT_ID     = process.env.AUTODESK_CLIENT_ID!;
const CLIENT_SECRET = process.env.AUTODESK_CLIENT_SECRET!;

// Returns a 2-legged token for the Forge Viewer (public viewables)
export async function GET(req: NextRequest) {
  // Try 3-legged token first (from cookie)
  const userToken = req.cookies.get('aps_token')?.value;
  if (userToken) {
    return NextResponse.json({ access_token: userToken });
  }

  // Fallback: 2-legged token (only works for public/own models)
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope:         'viewables:read',
  });

  const res = await fetch(
    'https://developer.api.autodesk.com/authentication/v2/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }
  );

  const data = await res.json();
  if (!data.access_token) {
    return NextResponse.json({ error: 'token_failed' }, { status: 500 });
  }

  return NextResponse.json({
    access_token: data.access_token,
    expires_in:   data.expires_in,
  });
}
