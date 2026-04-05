import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('aps_token')?.value;
  if (!token) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });

  const body = await req.json();
  let projectId: string;
  let lineageUrn: string;

  // Modo 1: projectId + itemId directo (desde el browser)
  if (body.projectId && body.itemId) {
    projectId  = body.projectId.startsWith('b.') ? body.projectId : `b.${body.projectId}`;
    lineageUrn = body.itemId;
  }
  // Modo 2: URL de ACC docs (pegar URL manualmente)
  else if (body.accUrl) {
    try {
      const url = new URL(body.accUrl);
      const pathMatch = url.pathname.match(/projects\/([^/?]+)/);
      const rawId = pathMatch?.[1];
      if (!rawId) return NextResponse.json({ error: 'No se pudo extraer el projectId de la URL' }, { status: 400 });
      projectId  = rawId.startsWith('b.') ? rawId : `b.${rawId}`;
      const entityId = url.searchParams.get('entityId');
      if (!entityId) return NextResponse.json({ error: 'No se encontró entityId en la URL' }, { status: 400 });
      lineageUrn = decodeURIComponent(entityId);
    } catch (e: any) {
      return NextResponse.json({ error: `URL inválida: ${e.message}` }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: 'Se requiere (projectId + itemId) o accUrl' }, { status: 400 });
  }

  try {
    const versionsRes = await fetch(
      `https://developer.api.autodesk.com/data/v1/projects/${projectId}/items/${encodeURIComponent(lineageUrn)}/versions?page[limit]=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!versionsRes.ok) {
      const txt = await versionsRes.text();
      return NextResponse.json({ error: `ACC API (${versionsRes.status}): ${txt}` }, { status: 400 });
    }

    const versionsData = await versionsRes.json();
    const version = versionsData?.data?.[0];
    if (!version) return NextResponse.json({ error: 'Sin versiones disponibles para este modelo' }, { status: 400 });

    const versionId = version.id;
    const urn = Buffer.from(versionId).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    return NextResponse.json({
      urn,
      versionId,
      name: version.attributes?.name ?? version.attributes?.displayName ?? 'Modelo',
      projectId,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Error interno' }, { status: 500 });
  }
}
