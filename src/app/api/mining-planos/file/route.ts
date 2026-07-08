import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { findLocalPdfByDocNum } from '@/lib/aconex-local';
import fs from 'fs';
import path from 'path';

// GET /api/mining-planos/file?codigo_documento=333-PRC23084-312-42-DW-8001
// Sirve el PDF real desde la carpeta local de exportaciones de Aconex (ACONEX_DOCS_DIR) — el
// archivo nunca sale de esta máquina ni pasa por ningún storage en la nube. Si este server se
// despliega en otra máquina, esta ruta deja de encontrar archivos (es intencionalmente solo
// para uso local mientras el documento maestro de Aconex vive en el disco de quien corre la app).
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const codigoDocumento = req.nextUrl.searchParams.get('codigo_documento');
  if (!codigoDocumento) return NextResponse.json({ error: 'Missing codigo_documento' }, { status: 400 });

  if (!process.env.ACONEX_DOCS_DIR) {
    return NextResponse.json({ error: 'ACONEX_DOCS_DIR no está configurado en .env.local — esta función solo funciona en la máquina donde viven los PDFs de Aconex.' }, { status: 501 });
  }

  const filePath = findLocalPdfByDocNum(codigoDocumento);
  if (!filePath) {
    return NextResponse.json({ error: `No se encontró un PDF local para "${codigoDocumento}".` }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${path.basename(filePath)}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
