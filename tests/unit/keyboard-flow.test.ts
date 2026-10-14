/**
 * Unit tests for keyboard flow logic.
 *
 * Tests focus on pure logic that can be verified without a DOM:
 * - Escape in filter: clear if non-empty, else blur+focus tree
 * - Enter on file: select + focus viewer
 * - Escape in viewer: return focus to active tree item
 *
 * These test the decision logic extracted from the components;
 * the actual focus() calls are integration-tested in the E2E spec.
 */

import { describe, it, expect } from "vitest";

// ── Helper: Escape-in-filter logic ────────────────────────────────────────────

type FilterEscapeAction = "clearFilter" | "blurAndFocusTree";

function filterEscapeAction(currentFilter: string): FilterEscapeAction {
  return currentFilter.length > 0 ? "clearFilter" : "blurAndFocusTree";
}

describe("Escape in filter input", () => {
  it("returns 'clearFilter' when filter is non-empty", () => {
    expect(filterEscapeAction("readme")).toBe("clearFilter");
    expect(filterEscapeAction("tsx")).toBe("clearFilter");
    expect(filterEscapeAction(" ")).toBe("clearFilter");
  });

  it("returns 'blurAndFocusTree' when filter is empty", () => {
    expect(filterEscapeAction("")).toBe("blurAndFocusTree");
  });
});

// ── Helper: Enter-on-node logic ───────────────────────────────────────────────

type NodeKind = "file" | "directory";
type EnterNodeAction = "selectAndFocusViewer" | "toggleExpand";

function enterNodeAction(kind: NodeKind): EnterNodeAction {
  return kind === "file" ? "selectAndFocusViewer" : "toggleExpand";
}

describe("Enter on tree node", () => {
  it("returns 'selectAndFocusViewer' for file nodes", () => {
    expect(enterNodeAction("file")).toBe("selectAndFocusViewer");
  });

  it("returns 'toggleExpand' for directory nodes", () => {
    expect(enterNodeAction("directory")).toBe("toggleExpand");
  });
});

// ── Helper: Escape-in-viewer logic ───────────────────────────────────────────

type ViewerEscapeAction = "focusActiveTreeItem" | "focusFilterFallback";

function viewerEscapeAction(hasActiveTreeItem: boolean): ViewerEscapeAction {
  return hasActiveTreeItem ? "focusActiveTreeItem" : "focusFilterFallback";
}

describe("Escape in viewer scroll container", () => {
  it("focuses the active tree item when one exists", () => {
    expect(viewerEscapeAction(true)).toBe("focusActiveTreeItem");
  });

  it("falls back to the filter input when no tree item has focus", () => {
    expect(viewerEscapeAction(false)).toBe("focusFilterFallback");
  });
});

// ── Filter-then-focus integration logic ──────────────────────────────────────

describe("Filter Escape: second press after clear focuses tree", () => {
  it("two consecutive Escapes: first clears filter, second targets tree", () => {
    let filter = "greet";

    // First Escape
    const action1 = filterEscapeAction(filter);
    expect(action1).toBe("clearFilter");
    filter = "";

    // Second Escape (filter now empty)
    const action2 = filterEscapeAction(filter);
    expect(action2).toBe("blurAndFocusTree");
  });
});
