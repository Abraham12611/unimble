"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CaretDown, Plus, Check } from "@phosphor-icons/react";
import { useWorkspaceContext } from "@/lib/workspace-context";

function WorkspaceAvatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-[#2A2A2A] text-[10px] font-semibold text-[#888888]">
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
        className="flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[13px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#1C1C1C]"
      >
        {workspace && <WorkspaceAvatar name={workspace.name} />}
        <span className="max-w-[160px] truncate">
          {isLoading ? "Loading…" : (workspace?.name ?? "Select workspace")}
        </span>
        <CaretDown
          size={14}
          className={`text-[#555555] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-[260px] rounded-[10px] border border-[#2A2A2A] bg-[#161616] shadow-[0_8px_32px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.06)]"
          onKeyDown={handleDropdownKeyDown}
        >
          {(workspaces?.length ?? 0) > 3 && (
            <div className="border-b border-[#222222] p-2">
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search workspaces…"
                className="w-full rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-2 py-1.5 text-[12px] text-[#F0F0F0] outline-none placeholder:text-[#555555] focus:border-[#3A3A3A]"
              />
            </div>
          )}

          <div ref={listRef} className="max-h-[240px] overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-center text-[12px] text-[#555555]">
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
                    data-ws-item
                    onClick={() => {
                      switchWorkspace(ws.slug);
                      setOpen(false);
                      setSearch("");
                    }}
                    onMouseEnter={() => setHighlightIndex(index)}
                    className={`flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] transition-colors ${
                      isHighlighted
                        ? "bg-[#1C1C1C] text-[#F0F0F0]"
                        : isActive
                          ? "text-[#F0F0F0]"
                          : "text-[#888888]"
                    }`}
                  >
                    <WorkspaceAvatar name={ws.name} />
                    <span className="min-w-0 flex-1 truncate">{ws.name}</span>
                    {isActive && <Check size={14} className="shrink-0 text-[#22C55E]" />}
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t border-[#222222] p-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setSearch("");
                onCreateWorkspace?.();
              }}
              className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-[13px] text-[#888888] transition-colors hover:bg-[#1C1C1C] hover:text-[#F0F0F0]"
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
