'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import IwpDetail from './IwpDetail';

export interface IwpViewerBridge {
  captureScope?: (name: string) => Promise<string | null>;
  selectElements?: (dbIds: number[]) => void;
}

interface Props {
  projectId: string;
  cwp: { cwp: string; disc?: string; nombre?: string; prog?: any };
  viewer?: IwpViewerBridge;
}

export default function IwpManager({ projectId, cwp }: Props) {
  const [iwps, setIwps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIwp, setSelectedIwp] = useState<string | null>(null);

  useEffect(() => {
    if (!cwp?.cwp) { setLoading(false); return; }
    fetch(`/api/mining-iwp?project_id=${projectId}&cwp_id=${cwp.cwp}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.error); return d; })
      .then(d => { setIwps(d.iwps ?? []); })
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, [projectId, cwp?.cwp]);

  if (loading) return <div style={{ padding: 24 }}>Cargando...</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 900 }}>IWP ({iwps.length})</div>
        {iwps.map((iwp: any) => (
          <div key={iwp.iwp_id} onClick={() => setSelectedIwp(iwp.iwp_id)} style={{ padding: 10, cursor: 'pointer', border: selectedIwp === iwp.iwp_id ? '2px solid #FF0000' : '1px solid #EEE' }}>
            {iwp.iwp_id}
          </div>
        ))}
      </div>
      <div>
        {selectedIwp ? <IwpDetail projectId={projectId} iwpId={selectedIwp} /> : <div>Selecciona un IWP</div>}
      </div>
    </div>
  );
}
