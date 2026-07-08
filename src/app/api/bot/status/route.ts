import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchBridgeStatus } from '@/lib/bot-bridge';

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const status = await fetchBridgeStatus();
  if (!status) return NextResponse.json({ status: 'unreachable' });
  return NextResponse.json(status);
}
