"use client";

import { useEffect, useRef, useState } from "react";
import { CaretDown, Plus, Check } from "@phosphor-icons/react";
import { useWorkspaceContext } from "@/lib/workspace-context";

export function WorkspaceSwitcher() {
  const { workspace, workspaces, isLoading, switchWorkspace } = useWorkspaceContext();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  const filtered = (workspaces ?? []).filter((ws) =>
    ws.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={isLoading}
        className="flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[13px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#1C1C1C]"
      >
        <span className="max-w-[160px] truncate">
          {isLoading ? "Loading…" : (workspace?.name ?? "Select workspace")}
        </span>
        <CaretDown
          size={14}
          className={`text-[#555555] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[240px] rounded-[10px] border border-[#2A2A2A] bg-[#161616] shadow-[0_8px_32px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.06)]">
          {(workspaces?.length ?? 0) > 3 && (
            <div className="border-b border-[#222222] p-2">
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search workspaces…"
                className="w-full rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-2 py-1.5 text-[12px] text-[#F0F0F0] outline-none placeholder:text-[#555555] focus:border-[#3A3A3A]"
              />
            </div>
          )}

          <div className="max-h-[240px] overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-center text-[12px] text-[#555555]">
                No workspaces found
              </div>
            ) : (
              filtered.map((ws) => {
                const isActive = ws.slug === workspace?.slug;
                return (
                  <button
                    key={ws._id}
                    type="button"
                    onClick={() => {
                      switchWorkspace(ws.slug);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={`flex w-full items-center justify-between rounded-[6px] px-2 py-1.5 text-left text-[13px] transition-colors ${
                      isActive
                        ? "bg-[#1C1C1C] text-[#F0F0F0]"
                        : "text-[#888888] hover:bg-[#1C1C1C] hover:text-[#F0F0F0]"
                    }`}
                  >
                    <span className="truncate">{ws.name}</span>
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
                // TODO: Open create workspace modal (Phase 4.4.2)
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
