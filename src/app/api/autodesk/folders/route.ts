import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('aps_token')?.value;
  if (!token) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get('projectId');
  const folderId  = req.nextUrl.searchParams.get('folderId');

  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const hubId = req.nextUrl.searchParams.get('hubId');

  // If no folderId, get the top-level folder (project root)
  let url: string;
  if (!folderId) {
    if (!hubId) return NextResponse.json({ error: 'hubId required for topFolders' }, { status: 400 });
    url = `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects/${projectId}/topFolders`;
  } else {
    url = `https://developer.api.autodesk.com/data/v1/projects/${projectId}/folders/${folderId}/contents`;
  }

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  return NextResponse.json(data);
}
