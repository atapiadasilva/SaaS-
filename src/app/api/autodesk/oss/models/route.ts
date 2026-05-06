import { NextRequest, NextResponse } from 'next/server';
import { listModels, uploadAndTranslate } from '@/lib/aps-oss';

// Increase body size limit for file uploads
export const maxDuration = 60; // seconds

/** GET /api/autodesk/oss/models?projectId=xxx */
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  try {
    const models = await listModels(projectId);
    return NextResponse.json({ models });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** POST /api/autodesk/oss/models?projectId=xxx  (multipart: field "model-file") */
export async function POST(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
  }

  const file = formData.get('model-file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'model-file required' }, { status: 400 });
  }

  const filename = (file as File).name;
  const buffer   = Buffer.from(await (file as File).arrayBuffer());

  try {
    const result = await uploadAndTranslate(projectId, filename, buffer);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
