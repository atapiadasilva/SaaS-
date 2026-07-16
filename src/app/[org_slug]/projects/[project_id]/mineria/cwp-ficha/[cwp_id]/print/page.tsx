'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import FichaDocument from '@/components/awp/ficha/FichaDocument';
import { type FichaData, type Orientacion, bloquesPorDefecto } from '@/components/awp/ficha/types';

export default function FichaCwpPrintPage() {
  const params = useParams();
  const projectId = params.project_id as string;
  const cwpId = decodeURIComponent(params.cwp_id as string);
  const [data, setData] = useState<FichaData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/mining-cwp-ficha?project_id=${projectId}&cwp_id=${encodeURIComponent(cwpId)}`)
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.error); return d; })
      .then(setData)
      .catch(e => setError(String(e.message ?? e)));
  }, [projectId, cwpId]);

  const orientacion: Orientacion = data?.ficha?.orientacion ?? 'vertical';
  const bloques = data?.ficha?.bloques ?? bloquesPorDefecto();

  // Auto-abrir el diálogo de impresión una vez que la data y las imágenes cargaron.
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [data]);

  if (error) return <div style={{ padding: 40, color: '#a00000', fontFamily: 'sans-serif' }}>Error: {error}</div>;
  if (!data) return <div style={{ padding: 40, color: '#64748b', fontFamily: 'sans-serif' }}>Cargando ficha…</div>;

  return (
    <div style={{ background: '#e2e8f0', minHeight: '100vh', padding: '16px 0' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @page { size: A4 ${orientacion === 'horizontal' ? 'landscape' : 'portrait'}; margin: 10mm; }
        @media print {
          html, body { background: #fff !important; }
          .noprint { display: none !important; }
          .page-wrap { box-shadow: none !important; margin: 0 !important; }
        }
      ` }} />
      <div className="noprint" style={{ maxWidth: 780, margin: '0 auto 14px', display: 'flex', gap: 10, alignItems: 'center', fontFamily: 'sans-serif' }}>
        <button onClick={() => window.print()} style={{ background: '#FF0000', color: '#fff', border: 0, borderRadius: 999, padding: '9px 22px', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
          Imprimir / Guardar PDF
        </button>
        <span style={{ fontSize: 12, color: '#475569' }}>Orientación: <b>{orientacion === 'horizontal' ? 'Horizontal' : 'Vertical'}</b> · Ctrl+P para guardar como PDF</span>
      </div>
      <div className="page-wrap" style={{ background: '#fff', maxWidth: orientacion === 'horizontal' ? 1160 : 836, margin: '0 auto', boxShadow: '0 4px 24px rgba(0,0,0,.12)' }}>
        <FichaDocument data={data} orientacion={orientacion} bloques={bloques} />
      </div>
    </div>
  );
}
