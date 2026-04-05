import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('aps_token')?.value;
  if (!token) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });

  const hubId = req.nextUrl.searchParams.get('hubId');
  if (!hubId) return NextResponse.json({ error: 'hubId required' }, { status: 400 });

  const res = await fetch(
    `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  return NextResponse.json(data);
}
