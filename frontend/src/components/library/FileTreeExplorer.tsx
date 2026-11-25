// Lucian UX/UI Prompt #102 · Clean Accessible File Tree Explorer
import { useState } from 'react';
import './FileTreeExplorer.css';

export interface FileTreeNode {
  path: string;
  name: string;
  isDir: boolean;
  children?: FileTreeNode[];
  loaded?: boolean;
}

export interface FileTreeExplorerProps {
  nodes: FileTreeNode[];
  selectedPath?: string | null;
  onSelectFile?: (node: FileTreeNode) => void;
  onLoadFolder?: (node: FileTreeNode) => Promise<void> | void;
  className?: string;
}

function getFileGlyph(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['svg', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'ico'].includes(ext)) return '◇';
  if (['json', 'yaml', 'yml', 'toml', 'env', 'config'].includes(ext)) return '⌘';
  if (['fig', 'css', 'scss', 'html'].includes(ext)) return '▧';
  return '≡';
}

function TreeBranch({
  nodes,
  selectedPath,
  expanded,
  loadingPaths,
  onToggleFolder,
  onSelectFile,
}: {
  nodes: FileTreeNode[];
  selectedPath?: string | null;
  expanded: Record<string, boolean>;
  loadingPaths: Record<string, boolean>;
  onToggleFolder: (node: FileTreeNode) => void;
  onSelectFile?: (node: FileTreeNode) => void;
}) {
  if (nodes.length === 0) {
    return <div className="u102-empty">Thư mục trống</div>;
  }

  return (
    <>
      {nodes.map((node) => {
        if (node.isDir) {
          const isOpen = Boolean(expanded[node.path]);
          const isLoading = Boolean(loadingPaths[node.path]);
          return (
            <div key={node.path}>
              <button
                type="button"
                className="u102-btn u102-folder"
                aria-expanded={isOpen}
                onClick={() => onToggleFolder(node)}
              >
                <span className="u102-arrow" aria-hidden="true">
                  ›
                </span>
                <span className="u102-glyph" aria-hidden="true">
                  ▱
                </span>
                <span className="u102-name" title={node.name}>
                  {node.name}
                </span>
                {isLoading && <span className="text-[10px] opacity-60">…</span>}
              </button>
              {isOpen && (
                <div className="u102-branch">
                  <TreeBranch
                    nodes={node.children || []}
                    selectedPath={selectedPath}
                    expanded={expanded}
                    loadingPaths={loadingPaths}
                    onToggleFolder={onToggleFolder}
                    onSelectFile={onSelectFile}
                  />
                </div>
              )}
            </div>
          );
        }

        const isSelected = selectedPath === node.path;
        return (
          <button
            key={node.path}
            type="button"
            className="u102-btn u102-file"
            aria-pressed={isSelected}
            onClick={() => onSelectFile?.(node)}
          >
            <span className="u102-glyph" aria-hidden="true">
              {getFileGlyph(node.name)}
            </span>
            <span className="u102-name" title={node.name}>
              {node.name}
            </span>
          </button>
        );
      })}
    </>
  );
}

export function FileTreeExplorer({
  nodes,
  selectedPath = null,
  onSelectFile,
  onLoadFolder,
  className = '',
}: FileTreeExplorerProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loadingPaths, setLoadingPaths] = useState<Record<string, boolean>>({});

  const handleToggleFolder = async (node: FileTreeNode) => {
    const nextOpen = !expanded[node.path];
    setExpanded((prev) => ({ ...prev, [node.path]: nextOpen }));

    if (nextOpen && !node.loaded && onLoadFolder) {
      setLoadingPaths((prev) => ({ ...prev, [node.path]: true }));
      try {
        await onLoadFolder(node);
      } finally {
        setLoadingPaths((prev) => ({ ...prev, [node.path]: false }));
      }
    }
  };

  return (
    <div className={`u102-wrap ${className}`.trim()}>
      <TreeBranch
        nodes={nodes}
        selectedPath={selectedPath}
        expanded={expanded}
        loadingPaths={loadingPaths}
        onToggleFolder={handleToggleFolder}
        onSelectFile={onSelectFile}
      />
    </div>
  );
}

export default FileTreeExplorer;
