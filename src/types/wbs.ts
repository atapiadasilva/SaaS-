export interface WBSNode {
  id: string; // El código EDT (ej: "1.2.3")
  name: string;
  parentId: string | null;
  level: number;
  type: 'project' | 'task';
  start: Date;
  end: Date;
  baselineStart?: Date;
  baselineEnd?: Date;
  work: number;
  progress: number;
  children: WBSNode[];
  metadata: Record<string, any>;
  isExpanded: boolean;
  isVisible: boolean;
}

export interface WBSTreeResult {
  rootTasks: WBSNode[];
  flatTasks: WBSNode[];
  maxLevel: number;
}
