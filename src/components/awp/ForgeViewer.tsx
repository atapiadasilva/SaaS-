'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

declare global { interface Window { Autodesk: any; } }

export interface ForgeViewerHandle {
  getSelectedIds:  () => number[];
  highlight:       (dbIds: number[], rgba: { r: number; g: number; b: number; a: number }) => void;
  clearHighlights: () => void;
  hide:            (dbIds: number[]) => void;
  show:            (dbIds: number[]) => void;
  showAll:         () => void;
  select:          (dbIds: number[]) => void;
  isolate:         (dbIds: number[]) => void;
  fitToView:       (dbIds?: number[]) => void;
}

interface ForgeViewerProps {
  urn: string;
  onSelectionChange?: (dbIds: number[]) => void;
  onReady?: () => void;
}

const VIEWER_VERSION = '7.97';
const VIEWER_CSS = `https://developer.api.autodesk.com/modelderivative/v2/viewers/${VIEWER_VERSION}/style.css`;
const VIEWER_JS  = `https://developer.api.autodesk.com/modelderivative/v2/viewers/${VIEWER_VERSION}/viewer3D.min.js`;

function loadCSS(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.type = 'text/css'; l.href = href;
  document.head.appendChild(l);
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`) && window.Autodesk) { resolve(); return; }
    if (document.querySelector(`script[src="${src}"]`)) {
      const t = setInterval(() => { if (window.Autodesk) { clearInterval(t); resolve(); } }, 100);
      setTimeout(() => { clearInterval(t); reject(new Error('Timeout Forge SDK')); }, 15000);
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => {
      const t = setInterval(() => { if (window.Autodesk) { clearInterval(t); resolve(); } }, 50);
      setTimeout(() => { clearInterval(t); reject(new Error('Autodesk SDK no inicializó')); }, 10000);
    };
    s.onerror = () => reject(new Error(`Error cargando: ${src}`));
    document.head.appendChild(s);
  });
}

const ForgeViewer = forwardRef<ForgeViewerHandle, ForgeViewerProps>(
  ({ urn, onSelectionChange, onReady }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef    = useRef<any>(null);
    const modelRef     = useRef<any>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [errMsg, setErrMsg] = useState('');

    // Expose imperative API
    useImperativeHandle(ref, () => ({
      getSelectedIds: () => viewerRef.current?.getSelection() ?? [],

      highlight: (dbIds, { r, g, b, a }) => {
        const v = viewerRef.current;
        if (!v || !modelRef.current) return;
        const color = new window.THREE.Vector4(r, g, b, a);
        dbIds.forEach(id => v.setThemingColor(id, color, modelRef.current, true));
      },

      clearHighlights: () => {
        const v = viewerRef.current;
        if (!v || !modelRef.current) return;
        v.clearThemingColors(modelRef.current);
      },

      hide: (dbIds) => {
        if (!viewerRef.current) return;
        viewerRef.current.hide(dbIds, modelRef.current);
      },

      show: (dbIds) => {
        if (!viewerRef.current) return;
        viewerRef.current.show(dbIds, modelRef.current);
      },

      showAll: () => {
        if (!viewerRef.current) return;
        viewerRef.current.showAll();
      },

      select: (dbIds) => {
        if (!viewerRef.current) return;
        viewerRef.current.select(dbIds);
      },

      isolate: (dbIds) => {
        if (!viewerRef.current) return;
        viewerRef.current.isolate(dbIds, modelRef.current);
      },

      fitToView: (dbIds) => {
        if (!viewerRef.current) return;
        viewerRef.current.fitToView(dbIds ?? [], modelRef.current);
      },
    }), []);

    useEffect(() => {
      if (!urn || !containerRef.current) return;
      let cancelled = false;

      async function init() {
        try {
          loadCSS(VIEWER_CSS);
          await loadScript(VIEWER_JS);
          if (cancelled) return;
          if (!window.Autodesk?.Viewing) throw new Error('Autodesk Viewing SDK no disponible');

          const tokenRes = await fetch('/api/autodesk/viewer-token');
          const tokenData = await tokenRes.json();
          if (!tokenData.access_token) throw new Error('Sin token del viewer');
          if (cancelled) return;

          const AV = window.Autodesk.Viewing;

          await new Promise<void>(resolve =>
            AV.Initializer({
              env: 'AutodeskProduction2',
              api: 'streamingV2',
              getAccessToken: (cb: (t: string, e: number) => void) =>
                cb(tokenData.access_token, tokenData.expires_in ?? 3600),
            }, resolve)
          );
          if (cancelled) return;

          const viewer = new AV.GuiViewer3D(containerRef.current!, {});
          viewer.start();
          viewerRef.current = viewer;

          // Selection event
          viewer.addEventListener(AV.SELECTION_CHANGED_EVENT, (e: any) => {
            onSelectionChange?.(e.dbIdArray ?? []);
          });

          const docUrn = urn.startsWith('urn:') ? urn : `urn:${urn}`;

          await new Promise<void>((resolve, reject) =>
            AV.Document.load(docUrn,
              async (doc: any) => {
                try {
                  const viewable = doc.getRoot().getDefaultGeometry();
                  if (!viewable) throw new Error('Sin geometría');
                  const model = await viewer.loadDocumentNode(doc, viewable);
                  modelRef.current = model;
                  setStatus('ready');
                  onReady?.();
                  resolve();
                } catch (e: any) { reject(e); }
              },
              (code: number, msg: string) => reject(new Error(`Doc error (${code}): ${msg}`))
            )
          );
        } catch (err: any) {
          if (!cancelled) { setStatus('error'); setErrMsg(err.message ?? 'Error'); }
        }
      }

      init();
      return () => {
        cancelled = true;
        try { viewerRef.current?.finish(); viewerRef.current = null; modelRef.current = null; } catch {}
      };
    }, [urn]);

    return (
      <div className="relative w-full h-full bg-[#1a1a2e]">
        <div ref={containerRef} className="w-full h-full" />

        {status === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#1a1a2e] z-10">
            <Loader2 size={28} className="animate-spin text-blue-400" />
            <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest">Cargando modelo 3D...</p>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#1a1a2e] z-10 p-8 text-center">
            <AlertCircle size={28} className="text-rose-400" />
            <p className="text-[11px] font-black text-rose-300 uppercase tracking-widest">Error al cargar</p>
            <p className="text-[10px] text-slate-400 max-w-xs">{errMsg}</p>
            <button onClick={() => { setStatus('loading'); setErrMsg(''); }}
              className="px-4 py-2 bg-blue-600 text-white text-[10px] font-black rounded-xl mt-2">
              Reintentar
            </button>
          </div>
        )}
      </div>
    );
  }
);

ForgeViewer.displayName = 'ForgeViewer';
export default ForgeViewer;
