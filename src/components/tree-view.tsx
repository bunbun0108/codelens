"use client";

import * as React from "react";
import { 
  Folder, FolderOpen, File, FileCode, FileJson, 
  FileText, Database, Settings, Search, X 
} from "lucide-react";
import { TreeNode } from "../shared/schemas";

function getFileIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.ts') || lower.endsWith('.tsx') || lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.css')) return FileCode;
  if (lower.endsWith('.json')) return FileJson;
  if (lower.endsWith('.md')) return FileText;
  if (lower.endsWith('.prisma')) return Database;
  if (lower.includes('config') || lower.startsWith('.')) return Settings;
  return File;
}

type FlatNode = {
  id: string;
  kind: "directory" | "file";
  node: TreeNode;
  level: number;
  expanded?: boolean;
};

export function TreeView({ 
  tree, 
  selectedFile, 
  onSelect 
}: { 
  tree: TreeNode[];
  selectedFile: string | null;
  onSelect: (path: string) => void;
}) {
  const [filter, setFilter] = React.useState("");
  
  // Folders collapsed by default except top-level
  const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(() => {
    const set = new Set<string>();
    tree.forEach(node => {
      if (node.kind === "directory") set.add(node.path);
    });
    return set;
  });

  // Also expand parents of selected file
  React.useEffect(() => {
    if (selectedFile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpandedPaths(prev => {
        const next = new Set(prev);
        const parts = selectedFile.split('/');
        let current = "";
        let changed = false;
        for(let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          if (part !== undefined) {
            current = current ? `${current}/${part}` : part;
            if (!next.has(current)) {
              next.add(current);
              changed = true;
            }
          }
        }
        return changed ? next : prev;
      });
    }
  }, [selectedFile]);

  const flatNodes = React.useMemo(() => {
    const flatten = (
      nodes: TreeNode[],
      filterText: string,
      level: number
    ): FlatNode[] => {
      const result: FlatNode[] = [];
      const lowerFilter = filterText.toLowerCase();

      for (const node of nodes) {
        if (node.kind === "file") {
          if (!filterText || node.path.toLowerCase().includes(lowerFilter)) {
            result.push({ id: node.path, kind: "file", node, level });
          }
        } else {
          const childrenResult = flatten(node.children, filterText, level + 1);
          if (filterText) {
            if (childrenResult.length > 0) {
              result.push({ id: node.path, kind: "directory", node, level, expanded: true });
              result.push(...childrenResult);
            }
          } else {
            const isExpanded = expandedPaths.has(node.path);
            result.push({ id: node.path, kind: "directory", node, level, expanded: isExpanded });
            if (isExpanded) {
              result.push(...childrenResult);
            }
          }
        }
      }
      return result;
    };
    return flatten(tree, filter, 0);
  }, [tree, filter, expandedPaths]);

  const [focusedId, setFocusedId] = React.useState<string | null>(null);
  const itemRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());

  // Keep focus on valid node if it disappeared (or just reset)
  React.useEffect(() => {
    if (focusedId && !flatNodes.find(n => n.id === focusedId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFocusedId(null);
    }
  }, [flatNodes, focusedId]);

  const toggleExpand = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number, node: FlatNode) => {
    let nextIndex = -1;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        nextIndex = Math.min(index + 1, flatNodes.length - 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        nextIndex = Math.max(index - 1, 0);
        break;
      case "Home":
        e.preventDefault();
        nextIndex = 0;
        break;
      case "End":
        e.preventDefault();
        nextIndex = flatNodes.length - 1;
        break;
      case "ArrowRight":
        e.preventDefault();
        if (node.kind === "directory") {
          if (!node.expanded) {
            toggleExpand(node.id);
          } else {
            nextIndex = Math.min(index + 1, flatNodes.length - 1);
          }
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (node.kind === "directory" && node.expanded) {
          toggleExpand(node.id);
        } else {
          // Go to parent
          for (let i = index - 1; i >= 0; i--) {
            const n = flatNodes[i];
            if (n && n.level < node.level) {
              nextIndex = i;
              break;
            }
          }
        }
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (node.kind === "directory") {
          toggleExpand(node.id);
        } else {
          onSelect(node.id);
        }
        break;
      default:
        break;
    }

    if (nextIndex !== -1 && nextIndex !== index) {
      const nextNode = flatNodes[nextIndex];
      if (nextNode) {
        const nextId = nextNode.id;
        setFocusedId(nextId);
        itemRefs.current.get(nextId)?.focus();
      }
    }
  };

  return (
    <div className="flex flex-col w-full h-full overflow-hidden text-sm">
      <div className="px-3 py-2 border-b shrink-0 flex items-center gap-2" style={{ borderColor: "#3A745D" }}>
        <Search className="h-4 w-4 opacity-50" />
        <input
          type="text"
          placeholder="Filter files..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-transparent border-none outline-none flex-1 placeholder:opacity-40 min-w-0"
          style={{ color: "#AFFDF0" }}
        />
        {filter && (
          <button 
            onClick={() => setFilter("")}
            className="hover:opacity-70 focus:outline-none"
            aria-label="Clear filter"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 custom-scrollbar" role="tree">
        {flatNodes.length === 0 ? (
          <div className="flex items-center justify-center h-20 opacity-50 text-xs italic">
            NO MATCHES
          </div>
        ) : (
          flatNodes.map((flatNode, index) => {
            const isSelected = flatNode.id === selectedFile;
            const isFocused = flatNode.id === focusedId;
            
            let Icon;
            if (flatNode.kind === "directory") {
              Icon = flatNode.expanded ? FolderOpen : Folder;
            } else {
              Icon = getFileIcon(flatNode.node.name);
            }

            return (
              <div
                key={flatNode.id}
                role="treeitem"
                aria-expanded={flatNode.kind === "directory" ? flatNode.expanded : undefined}
                aria-selected={isSelected}
                aria-level={flatNode.level + 1}
                tabIndex={isFocused || (focusedId === null && index === 0) ? 0 : -1}
                ref={(el) => {
                  if (el) itemRefs.current.set(flatNode.id, el);
                  else itemRefs.current.delete(flatNode.id);
                }}
                onFocus={() => setFocusedId(flatNode.id)}
                onClick={() => {
                  if (flatNode.kind === "directory") {
                    toggleExpand(flatNode.id);
                  } else {
                    onSelect(flatNode.id);
                  }
                  setFocusedId(flatNode.id);
                }}
                onKeyDown={(e) => handleKeyDown(e, index, flatNode)}
                className={`
                  flex items-center w-full rounded outline-none transition-colors cursor-pointer select-none
                  h-[24px] whitespace-nowrap
                `}
                style={{ 
                  paddingLeft: `${flatNode.level * 12 + 4}px`,
                  backgroundColor: isSelected ? "#3A745D" : "transparent",
                  color: isSelected ? "#AFFDF0" : (flatNode.kind === "directory" ? "#BEEF8D" : "inherit"),
                  boxShadow: isFocused ? "inset 0 0 0 1px #3A745D" : "none"
                }}
                title={flatNode.id}
              >
                <span className="flex items-center gap-1.5 min-w-0 pr-2">
                  <span className="shrink-0 opacity-80" style={{ color: isSelected ? "#AFFDF0" : "inherit" }}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className={`truncate ${flatNode.kind === "directory" ? "font-semibold" : ""}`}>
                    {flatNode.node.name}
                  </span>
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
