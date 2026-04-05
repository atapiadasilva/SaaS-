import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('aps_token')?.value;
  if (!token) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });

  const res = await fetch('https://developer.api.autodesk.com/project/v1/hubs', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return NextResponse.json(data);
}
