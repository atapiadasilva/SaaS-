import { useState, useEffect, useRef } from 'react';
import { ChevronRight, ChevronDown, MonitorPlay, Component, Paintbrush, X } from 'lucide-react';
import type { ForgeViewerHandle } from './ForgeViewer';

interface ModelTreeProps {
  viewerRef: React.RefObject<ForgeViewerHandle | null>;
  onAssignBranch: (dbId: number, name: string) => void;
  onSelectNode: (dbId: number) => void;
  onAssignMultiple?: (items: { dbId: number; name: string }[]) => void;
  onCheckedChange?: (branchDbIds: number[]) => void;
  highlightedDbId?: number | null;
  onRootsLoaded?: (rootDbIds: number[]) => void;
}

interface TreeNode {
  dbId: number;
  name: string;
  childCount: number;
}

function ModelTreeNodeItem({
  node,
  viewerRef,
  onAssignBranch,
  onSelectNode,
  checked,
  onToggle,
  highlightedDbId,
}: {
  node: TreeNode;
  viewerRef: React.RefObject<ForgeViewerHandle | null>;
  onAssignBranch: (dbId: number, name: string) => void;
  onSelectNode: (dbId: number) => void;
  checked: Map<number, string>;
  onToggle: (dbId: number, name: string) => void;
  highlightedDbId?: number | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const isChecked = checked.has(node.dbId);
  const isHighlighted = highlightedDbId === node.dbId;
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isHighlighted && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isHighlighted]);

  const toggle = () => {
    if (!expanded && children.length === 0 && node.childCount > 0) {
      setLoading(true);
      const kids = viewerRef.current?.getChildren?.(node.dbId) || [];
      setChildren(kids);
      setLoading(false);
    }
    setExpanded(!expanded);
  };

  return (
    <div className="flex flex-col">
      <div
        ref={rowRef}
        className={`flex items-center gap-1 py-1 rounded px-1 group cursor-pointer transition ${
          isHighlighted ? 'bg-blue-500/20 ring-1 ring-inset ring-blue-400/40' :
          isChecked ? 'bg-amber-400/15' :
          'hover:bg-white/5'
        }`}
      >
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => onToggle(node.dbId, node.name)}
          onClick={e => e.stopPropagation()}
          className="w-3 h-3 shrink-0 accent-amber-400 cursor-pointer"
        />
        <button
          onClick={toggle}
          className={`p-0.5 rounded transition ${node.childCount > 0 ? 'text-white/40 hover:text-white hover:bg-white/10' : 'opacity-0 cursor-default'}`}
          disabled={node.childCount === 0}
        >
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>

        <div
          className="flex-1 flex items-center min-w-0"
          onClick={() => onSelectNode(node.dbId)}
        >
          <Component size={10} className="text-blue-400/50 mr-1.5 shrink-0" />
          <span className="text-[10px] font-bold text-white/80 truncate mr-2" title={node.name}>
            {node.name}
          </span>
          <span className="text-[8px] font-black text-white/20">({node.childCount})</span>
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onAssignBranch(node.dbId, node.name); }}
          title="Añadir a vista activa"
          className="p-1 rounded text-amber-400/50 hover:text-amber-300 hover:bg-amber-400/10 opacity-0 group-hover:opacity-100 transition shrink-0"
        >
          <Paintbrush size={11} />
        </button>
      </div>

      {expanded && (
        <div className="pl-3 ml-2 border-l border-white/10">
          {loading && <div className="text-[9px] text-white/30 italic py-1">Cargando...</div>}
          {children.map(child => (
            <ModelTreeNodeItem
              key={child.dbId}
              node={child}
              viewerRef={viewerRef}
              onAssignBranch={onAssignBranch}
              onSelectNode={onSelectNode}
              checked={checked}
              onToggle={onToggle}
              highlightedDbId={highlightedDbId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ModelTree({ viewerRef, onAssignBranch, onSelectNode, onAssignMultiple, onCheckedChange, highlightedDbId, onRootsLoaded }: ModelTreeProps) {
  const [roots, setRoots] = useState<TreeNode[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [checked, setChecked] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    let interval = setInterval(() => {
      const vr = viewerRef.current;
      if (vr && vr.getRootId && vr.getRootId() !== null) {
        clearInterval(interval);
        const rootId = vr.getRootId()!;
        const kids = vr.getChildren(rootId);
        let rootNodes: TreeNode[];
        if (kids.length === 1 && kids[0].childCount > 0) {
          rootNodes = vr.getChildren(kids[0].dbId);
        } else {
          rootNodes = kids;
        }
        setRoots(rootNodes);
        onRootsLoaded?.(rootNodes.map(r => r.dbId));
        setLoaded(true);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [viewerRef]);

  const handleToggle = (dbId: number, name: string) => {
    const next = new Map(checked);
    if (next.has(dbId)) next.delete(dbId);
    else next.set(dbId, name);
    setChecked(next);
    onCheckedChange?.([...next.keys()]);
  };

  const handleDeselectAll = () => {
    setChecked(new Map());
    onCheckedChange?.([]);
  };

  const handleAssignAll = () => {
    if (!onAssignMultiple || checked.size === 0) return;
    const items = Array.from(checked.entries()).map(([dbId, name]) => ({ dbId, name }));
    onAssignMultiple(items);
    setChecked(new Map());
    onCheckedChange?.([]);
  };

  if (!loaded) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 p-4 text-center">
        <MonitorPlay size={24} className="text-white/20 animate-pulse" />
        <p className="text-[10px] text-white/40">Cargando árbol...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Selection counter bar — always visible when items are checked */}
      {checked.size > 0 && (
        <div className="shrink-0 px-2 py-1 border-b border-amber-400/20 bg-amber-400/10 flex items-center justify-between">
          <span className="text-[9px] font-bold text-amber-300">
            {checked.size} rama{checked.size !== 1 ? 's' : ''} seleccionada{checked.size !== 1 ? 's' : ''}
          </span>
          <button
            onClick={handleDeselectAll}
            className="text-[9px] text-amber-400/70 hover:text-amber-200 underline transition"
          >
            Deseleccionar todo
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 pr-1">
        {roots.map(root => (
          <ModelTreeNodeItem
            key={root.dbId}
            node={root}
            viewerRef={viewerRef}
            onAssignBranch={onAssignBranch}
            onSelectNode={onSelectNode}
            checked={checked}
            onToggle={handleToggle}
            highlightedDbId={highlightedDbId}
          />
        ))}
      </div>

      {checked.size > 0 && (
        <div className="shrink-0 p-2 border-t border-white/10 bg-amber-400/10">
          <div className="flex gap-1">
            <button
              onClick={handleAssignAll}
              className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-400 text-white text-[9px] font-black rounded-lg transition flex items-center justify-center gap-1"
            >
              <Paintbrush size={10} /> Crear grupo combinado
            </button>
            <button
              onClick={handleDeselectAll}
              className="px-2 py-1.5 bg-white/10 hover:bg-white/20 text-white/60 hover:text-white text-[9px] rounded-lg transition flex items-center gap-1"
              title="Deseleccionar todo"
            >
              <X size={11} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
