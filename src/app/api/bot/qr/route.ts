import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchBridgeQr } from '@/lib/bot-bridge';
import QRCode from 'qrcode';

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const qr = await fetchBridgeQr();
  if (!qr) return NextResponse.json({ qrDataUrl: null });

  const qrDataUrl = await QRCode.toDataURL(qr, { width: 400, margin: 1 });
  return NextResponse.json({ qrDataUrl });
}
