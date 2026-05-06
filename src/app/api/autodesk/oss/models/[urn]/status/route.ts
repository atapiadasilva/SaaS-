import { NextRequest, NextResponse } from 'next/server';
import { getTranslationStatus } from '@/lib/aps-oss';

/** GET /api/autodesk/oss/models/[urn]/status */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ urn: string }> }
) {
  const { urn } = await params;

  try {
    const status = await getTranslationStatus(urn);
    return NextResponse.json(status);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
