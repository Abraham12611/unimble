"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CaretDown, Plus, Check } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { useWorkspaceContext } from "@/lib/workspace-context";

function WorkspaceAvatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-[var(--bg-card-hover)] text-[10px] font-semibold text-[var(--text-secondary)]">
      {initials || "W"}
    </div>
  );
}

export function WorkspaceSwitcher({ onCreateWorkspace }: { onCreateWorkspace?: () => void }) {
  const { workspace, workspaces, isLoading, switchWorkspace } = useWorkspaceContext();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => (workspaces ?? []).filter((ws) => ws.name.toLowerCase().includes(search.toLowerCase())),
    [workspaces, search]
  );

  // Close on outside click
  useEffect(() => {
    if (!open) return;

    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setSearch("");
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll("[data-ws-item]");
    const item = items[highlightIndex];
    if (item) {
      item.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex]);

  const selectItem = useCallback(
    (index: number) => {
      if (index >= 0 && index < filtered.length) {
        switchWorkspace(filtered[index].slug);
        setOpen(false);
        setSearch("");
      }
    },
    [filtered, switchWorkspace]
  );

  function handleDropdownKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectItem(highlightIndex);
    }
  }

  function handleOpen() {
    setOpen(true);
    setHighlightIndex(0);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setHighlightIndex(0);
  }

  // Callback ref to auto-focus the search input when it mounts
  const searchInputRef = useCallback((node: HTMLInputElement | null) => {
    if (node) {
      node.focus();
    }
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : handleOpen())}
        disabled={isLoading}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-card-hover)]"
      >
        {workspace && <WorkspaceAvatar name={workspace.name} />}
        <span className="max-w-[160px] truncate">
          {isLoading ? "Loading…" : (workspace?.name ?? "Select workspace")}
        </span>
        <CaretDown
          size={14}
          className={cn("text-[var(--text-muted)] transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 w-[260px] rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-card)] shadow-[var(--shadow-popup)]"
          onKeyDown={handleDropdownKeyDown}
        >
          {(workspaces?.length ?? 0) > 3 && (
            <div className="border-b border-[var(--border-subtle)] p-2">
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search workspaces…"
                aria-label="Search workspaces"
                className="w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-input)] px-2 py-1.5 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--border-focus)]"
              />
            </div>
          )}

          <div ref={listRef} className="max-h-[240px] overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-center text-[12px] text-[var(--text-muted)]">
                No workspaces found
              </div>
            ) : (
              filtered.map((ws, index) => {
                const isActive = ws.slug === workspace?.slug;
                const isHighlighted = index === highlightIndex;
                return (
                  <button
                    key={ws._id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    data-ws-item
                    onClick={() => {
                      switchWorkspace(ws.slug);
                      setOpen(false);
                      setSearch("");
                    }}
                    onMouseEnter={() => setHighlightIndex(index)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] transition-colors",
                      isHighlighted
                        ? "bg-[var(--bg-card-hover)] text-[var(--text-primary)]"
                        : isActive
                          ? "text-[var(--text-primary)]"
                          : "text-[var(--text-secondary)]"
                    )}
                  >
                    <WorkspaceAvatar name={ws.name} />
                    <span className="min-w-0 flex-1 truncate">{ws.name}</span>
                    {isActive && (
                      <Check size={14} className="shrink-0 text-[var(--semantic-positive-fg)]" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t border-[var(--border-subtle)] p-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setSearch("");
                onCreateWorkspace?.();
              }}
              className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
            >
              <Plus size={14} />
              <span>Create workspace</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
