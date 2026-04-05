'use client';

import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

const EntityNode = ({ data }: { data: { name: string; attributes: { name: string; is_primary_key: boolean }[] } }) => {
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl min-w-[200px] text-white overflow-hidden font-sans">
      <div className="bg-slate-800 px-4 py-2 border-b border-slate-700 font-bold text-sm tracking-wide uppercase text-[#0C1E4F]">
        {data.name}
      </div>
      <div className="py-2">
        {(data.attributes || []).map((col) => (
          <div key={col.name} className="relative px-4 py-1 hover:bg-slate-800 transition-colors flex justify-between items-center group">
            <span className="text-xs font-medium text-slate-300">
              {col.name}
              {col.is_primary_key && <span className="ml-2 text-yellow-500 text-[10px]">PK</span>}
            </span>
            <Handle
              type="source"
              position={Position.Right}
              id={col.name}
              className="!w-2 !h-2 !bg-blue-500 !border-none group-hover:scale-125 transition-transform"
            />
            <Handle
              type="target"
              position={Position.Left}
              id={col.name}
              className="!w-2 !h-2 !bg-[#0C1E4F] !border-none group-hover:scale-125 transition-transform"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default memo(EntityNode);
