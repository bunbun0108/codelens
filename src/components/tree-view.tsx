import { useMemo } from "react";

type TreeItem = {
  path: string;
  type: string;
};

export function TreeView({ 
  tree, 
  selectedFile, 
  onSelect 
}: { 
  tree: TreeItem[];
  selectedFile: string | null;
  onSelect: (path: string) => void;
}) {
  // Compute depth and basename for each item
  const items = useMemo(() => {
    return tree.map(item => {
      const parts = item.path.split("/");
      const depth = parts.length - 1;
      const basename = parts[parts.length - 1];
      return {
        ...item,
        depth,
        basename,
      };
    });
  }, [tree]);

  return (
    <div className="flex flex-col w-full">
      {items.map((item) => (
        <div
          key={item.path}
          onClick={() => {
            if (item.type === "blob") {
              onSelect(item.path);
            }
          }}
          className={`
            text-left w-full truncate py-1 pr-2 text-sm transition-colors select-none
            ${item.path === selectedFile ? "bg-line text-accent" : "hover:bg-surface text-accent"}
            ${item.type === "tree" ? "font-bold text-accent-2" : "cursor-pointer"}
          `}
          style={{ paddingLeft: `${item.depth * 1 + 0.5}rem` }}
          title={item.path}
        >
          {item.type === "tree" ? `${item.basename}/` : item.basename}
        </div>
      ))}
    </div>
  );
}
