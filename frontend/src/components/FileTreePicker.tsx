import { useState, useMemo, useCallback } from 'react';
import type { TreeNode } from '../types';

interface Props {
  tree: TreeNode[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
}

interface TreeNodeEntry {
  path: string;
  name: string;
  type: 'blob' | 'tree';
  size?: number;
  children: TreeNodeEntry[];
  fileCount: number;
}

function buildTree(nodes: TreeNode[]): TreeNodeEntry[] {
  const root: Record<string, TreeNodeEntry> = {};

  for (const node of nodes) {
    const parts = node.path.split('/');
    let current = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const entryPath = currentPath ? `${currentPath}/${part}` : part;

      if (!current[part]) {
        current[part] = {
          path: entryPath,
          name: part,
          type: isLast ? node.type : 'tree',
          size: isLast ? node.size : undefined,
          children: isLast ? [] : [],
          fileCount: 0,
        };
      }

      if (isLast) {
        current[part].type = node.type;
        current[part].size = node.size;
      } else {
        current = current[part].children as unknown as Record<string, TreeNodeEntry>;
      }

      currentPath = entryPath;
    }
  }

  function countFiles(entry: TreeNodeEntry): number {
    if (entry.type === 'blob') {
      entry.fileCount = 1;
      return 1;
    }
    const arr = Object.values(entry.children as unknown as Record<string, TreeNodeEntry>);
    entry.fileCount = arr.reduce((sum, c) => sum + countFiles(c), 0);
    return entry.fileCount;
  }

  function toSorted(children: Record<string, TreeNodeEntry>): TreeNodeEntry[] {
    const arr = Object.values(children);
    countFiles({ path: '', name: '', type: 'tree', children: arr as unknown as TreeNodeEntry[], fileCount: 0 });
    return arr.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'tree' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  return toSorted(root);
}

function getAllFilePaths(entry: TreeNodeEntry): string[] {
  if (entry.type === 'blob') return [entry.path];
  const children = entry.children as TreeNodeEntry[];
  return children.flatMap(c => getAllFilePaths(c));
}

function getFolderSelectionState(
  entry: TreeNodeEntry,
  selected: Set<string>
): 'checked' | 'indeterminate' | 'unchecked' {
  if (entry.type === 'blob') {
    return selected.has(entry.path) ? 'checked' : 'unchecked';
  }
  const descendants = getAllFilePaths(entry);
  if (descendants.length === 0) return 'unchecked';
  const checkedCount = descendants.filter(p => selected.has(p)).length;
  if (checkedCount === 0) return 'unchecked';
  if (checkedCount === descendants.length) return 'checked';
  return 'indeterminate';
}

export default function FileTreePicker({ tree, selected, onChange }: Props) {
  const rootEntries = useMemo(() => buildTree(tree), [tree]);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const e = new Set<string>();
    for (const entry of rootEntries) {
      if (entry.type === 'tree') e.add(entry.path);
    }
    return e;
  });

  const toggleExpand = useCallback((path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleFolderCheck = useCallback(
    (entry: TreeNodeEntry, newState: 'checked' | 'unchecked') => {
      const files = getAllFilePaths(entry);
      const next = new Set(selected);
      if (newState === 'checked') {
        for (const f of files) next.add(f);
      } else {
        for (const f of files) next.delete(f);
      }
      onChange(next);
    },
    [selected, onChange]
  );

  const handleFileCheck = useCallback(
    (path: string) => {
      const next = new Set(selected);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      onChange(next);
    },
    [selected, onChange]
  );

  function renderEntry(entry: TreeNodeEntry, depth: number) {
    const isExpanded = expanded.has(entry.path);
    const folderState = getFolderSelectionState(entry, selected);

    if (entry.type === 'blob') {
      return (
        <div
          key={entry.path}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '6px 12px',
            paddingLeft: `${12 + depth * 18}px`,
            fontSize: '12px',
            fontFamily: 'Geist Mono, monospace',
            color: 'var(--text-2)',
            fontWeight: 400,
            cursor: 'pointer',
            borderBottom: 'none',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-2)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          onClick={() => handleFileCheck(entry.path)}
        >
          <Checkbox state={folderState} />
          <span>{entry.name}</span>
        </div>
      );
    }

    return (
      <div key={entry.path}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '6px 12px',
            paddingLeft: `${12 + depth * 18}px`,
            fontSize: '12px',
            fontFamily: 'Geist Mono, monospace',
            cursor: 'pointer',
            borderBottom: 'none',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-2)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span
            onClick={(e) => { e.stopPropagation(); toggleExpand(entry.path); }}
            style={{
              fontSize: '10px',
              color: 'var(--text-3)',
              width: '14px',
              textAlign: 'center',
              flexShrink: 0,
              userSelect: 'none',
            }}
          >
            {isExpanded ? '▼' : '▶'}
          </span>
          <span onClick={() => {
            const state = getFolderSelectionState(entry, selected);
            handleFolderCheck(entry, state === 'checked' ? 'unchecked' : 'checked');
          }}>
            <Checkbox state={folderState} />
          </span>
          <span
            style={{
              color: 'var(--text-1)',
              fontWeight: 500,
            }}
            onClick={(e) => { e.stopPropagation(); toggleExpand(entry.path); }}
          >
            {entry.name}/
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-3)' }}>
            ({entry.fileCount} file{entry.fileCount !== 1 ? 's' : ''})
          </span>
        </div>
        {isExpanded &&
          (entry.children as TreeNodeEntry[]).map(child => renderEntry(child, depth + 1))}
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'var(--bg-1)',
        border: '1px solid var(--border)',
        maxHeight: 'calc(100vh - 320px)',
        overflowY: 'auto',
      }}
    >
      {rootEntries.map(entry => renderEntry(entry, 0))}
    </div>
  );
}

function Checkbox({ state }: { state: 'checked' | 'indeterminate' | 'unchecked' }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '14px',
        height: '14px',
        flexShrink: 0,
        border: state === 'unchecked' ? '1px solid var(--border-2)' : '1px solid var(--accent)',
        background: state === 'unchecked' ? 'transparent' : state === 'checked' ? 'var(--accent)' : 'transparent',
        position: 'relative',
      }}
    >
      {state === 'checked' && (
        <span style={{ color: '#fff', fontSize: '9px', lineHeight: 1, fontWeight: 700 }}>✓</span>
      )}
      {state === 'indeterminate' && (
        <span style={{
          display: 'block',
          width: '6px',
          height: '2px',
          background: 'var(--accent)',
        }} />
      )}
    </span>
  );
}
