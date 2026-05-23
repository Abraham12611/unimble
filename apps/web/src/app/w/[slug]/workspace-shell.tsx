"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  House,
  Robot,
  GitBranch,
  Play,
  ShieldCheck,
  Plugs,
  ChartBar,
  Gear,
  Brain,
  Bell,
  MagnifyingGlass,
  List,
  X,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useState, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { lockScroll, unlockScroll } from "@/lib/use-scroll-lock";
import { WorkspaceProvider, useWorkspaceContext } from "@/lib/workspace-context";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { CreateWorkspaceModal } from "./create-workspace-modal";
import { CommandPalette } from "@/components/shell/command-palette";

const NAV_ITEMS = [
  { href: "dashboard", icon: House, label: "Home", shortcut: "G H" },
  { href: "operators", icon: Robot, label: "Operators", shortcut: "G O" },
  { href: "workflows", icon: GitBranch, label: "Workflows", shortcut: "G W" },
  { href: "executions", icon: Play, label: "Executions", shortcut: "G E" },
  { href: "approvals", icon: ShieldCheck, label: "Approvals", shortcut: "G P" },
  { href: "integrations", icon: Plugs, label: "Integrations", shortcut: "G I" },
  { href: "analytics", icon: ChartBar, label: "Analytics", shortcut: "G A" },
  { href: "settings", icon: Gear, label: "Settings", shortcut: "G S" },
  { href: "learning", icon: Brain, label: "Learning", shortcut: "G L" },
] as const;

/* ---------------------------------------------------------------------------
 * Sidebar Navigation — 48px collapsed, icon-only per design system
 * --------------------------------------------------------------------------- */

function SidebarNav() {
  const pathname = usePathname();
  const { slug } = useWorkspaceContext();

  return (
    <nav
      className="hidden md:flex h-full w-12 flex-col items-center border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] py-3"
      aria-label="Main navigation"
    >
      <div className="flex flex-1 flex-col items-center gap-2">
        {NAV_ITEMS.map((item) => {
          const fullHref = `/w/${slug}/${item.href}`;
          const isActive = pathname?.startsWith(fullHref);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={fullHref}
              title={`${item.label} (${item.shortcut})`}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex h-8 w-8 items-center justify-center rounded-[6px] transition-colors duration-[120ms]",
                isActive
                  ? "bg-[var(--bg-card-hover)] text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-secondary)]"
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-[var(--text-primary)]" />
              )}
              <Icon size={18} weight={isActive ? "fill" : "regular"} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/* ---------------------------------------------------------------------------
 * Mobile Bottom Navigation — shown below md breakpoint
 * --------------------------------------------------------------------------- */

function MobileBottomNav() {
  const pathname = usePathname();
  const { slug } = useWorkspaceContext();

  // Show only the 5 most important nav items on mobile
  const mobileItems = NAV_ITEMS.slice(0, 5);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden items-center justify-around border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-2"
      aria-label="Mobile navigation"
    >
      {mobileItems.map((item) => {
        const fullHref = `/w/${slug}/${item.href}`;
        const isActive = pathname?.startsWith(fullHref);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={fullHref}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-[6px] px-3 py-1.5 transition-colors",
              isActive ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
            )}
          >
            <Icon size={20} weight={isActive ? "fill" : "regular"} />
            <span className="text-[10px]">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/* ---------------------------------------------------------------------------
 * Mobile Sidebar Drawer — full nav for mobile
 * --------------------------------------------------------------------------- */

function MobileSidebarDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { slug } = useWorkspaceContext();

  useEffect(() => {
    if (open) {
      lockScroll();
    }
    return () => {
      if (open) {
        unlockScroll();
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div
        className="absolute inset-0 bg-[var(--bg-overlay)]"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="absolute left-0 top-0 bottom-0 w-64 bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] p-4">
        <div className="flex items-center justify-between mb-6">
          <span className="text-[15px] font-medium text-[var(--text-primary)]">Navigation</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)]"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="flex flex-col gap-1" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const fullHref = `/w/${slug}/${item.href}`;
            const isActive = pathname?.startsWith(fullHref);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={fullHref}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-[6px] px-3 py-2 text-[13px] transition-colors",
                  isActive
                    ? "bg-[var(--bg-card-hover)] text-[var(--text-primary)] font-medium"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
                )}
              >
                <Icon size={18} weight={isActive ? "fill" : "regular"} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Top Bar — 52px height per design system
 * --------------------------------------------------------------------------- */

function TopBar({
  onCreateWorkspace,
  onOpenCommandPalette,
  onOpenMobileMenu,
}: {
  onCreateWorkspace: () => void;
  onOpenCommandPalette: () => void;
  onOpenMobileMenu: () => void;
}) {
  return (
    <header className="flex h-[52px] items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-base)] px-4">
      <div className="flex items-center gap-3">
        {/* Mobile menu button */}
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="flex md:hidden h-8 w-8 items-center justify-center rounded-[6px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-secondary)]"
          aria-label="Open menu"
        >
          <List size={18} />
        </button>

        <Link href="/" className="text-[15px] font-medium text-[var(--text-primary)]">
          Unimble
        </Link>
        <span className="text-[var(--border-focus)]">/</span>
        <WorkspaceSwitcher onCreateWorkspace={onCreateWorkspace} />
      </div>

      <div className="flex items-center gap-2">
        {/* Search / Command Palette trigger */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          title="Search (⌘K)"
          className="flex h-8 items-center gap-2 rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2.5 text-[var(--text-muted)] transition-colors hover:border-[var(--border-default)] hover:text-[var(--text-secondary)]"
        >
          <MagnifyingGlass size={14} />
          <span className="hidden sm:inline text-[12px]">Search…</span>
          <kbd className="hidden sm:inline rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1 py-0.5 text-[10px] text-[var(--text-muted)]">
            ⌘K
          </kbd>
        </button>

        <button
          type="button"
          title="Notifications"
          className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-secondary)]"
        >
          <Bell size={18} />
        </button>
        <UserButton userProfileMode="navigation" userProfileUrl="/settings/profile" />
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------------------
 * Workspace Guard — loading and not-found states
 * --------------------------------------------------------------------------- */

function WorkspaceGuard({ children }: { children: ReactNode }) {
  const { workspace, isLoading } = useWorkspaceContext();

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--bg-base)] text-[var(--text-muted)]">
        <div className="text-[13px]">Loading workspace…</div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[var(--bg-base)]">
        <div className="space-y-2 text-center">
          <div className="text-[15px] font-medium text-[var(--text-primary)]">
            Workspace not found
          </div>
          <div className="text-[12px] text-[var(--text-secondary)]">
            This workspace doesn&apos;t exist or you don&apos;t have access.
          </div>
          <Link
            href="/dashboard"
            className="mt-3 inline-block rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-card-hover)] px-4 py-2 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-card)]"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/* ---------------------------------------------------------------------------
 * Keyboard Shortcuts Hook
 * --------------------------------------------------------------------------- */

function useKeyboardShortcuts({ onOpenCommandPalette }: { onOpenCommandPalette: () => void }) {
  const { slug } = useWorkspaceContext();
  const router = useRouter();
  const pendingGRef = useRef(false);
  const gTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      // Cmd/Ctrl + K → Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenCommandPalette();
        return;
      }

      // "/" → Focus search (same as Cmd+K)
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onOpenCommandPalette();
        return;
      }

      // G + <key> navigation
      if (e.key === "g" || e.key === "G") {
        if (!pendingGRef.current) {
          pendingGRef.current = true;
          gTimeoutRef.current = setTimeout(() => {
            pendingGRef.current = false;
          }, 1000);
          return;
        }
      }

      if (pendingGRef.current) {
        pendingGRef.current = false;
        if (gTimeoutRef.current) {
          clearTimeout(gTimeoutRef.current);
          gTimeoutRef.current = null;
        }

        const keyMap: Record<string, string> = {
          h: "dashboard",
          o: "operators",
          w: "workflows",
          e: "executions",
          p: "approvals",
          i: "integrations",
          a: "analytics",
          s: "settings",
          l: "learning",
        };

        const route = keyMap[e.key.toLowerCase()];
        if (route) {
          e.preventDefault();
          router.push(`/w/${slug}/${route}`);
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (gTimeoutRef.current) {
        clearTimeout(gTimeoutRef.current);
      }
    };
  }, [slug, onOpenCommandPalette, router]);
}

/* ---------------------------------------------------------------------------
 * WorkspaceShell — Main app shell composition
 * --------------------------------------------------------------------------- */

function ShellContent({ children }: { children: ReactNode }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const openCommandPalette = useCallback(() => setShowCommandPalette(true), []);

  useKeyboardShortcuts({ onOpenCommandPalette: openCommandPalette });

  return (
    <div className="flex h-screen flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <TopBar
        onCreateWorkspace={() => setShowCreateModal(true)}
        onOpenCommandPalette={openCommandPalette}
        onOpenMobileMenu={() => setShowMobileMenu(true)}
      />
      <div className="flex flex-1 overflow-hidden">
        <SidebarNav />
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          <WorkspaceGuard>
            <div className="mx-auto w-full max-w-6xl p-6">{children}</div>
          </WorkspaceGuard>
        </main>
      </div>
      <MobileBottomNav />
      <MobileSidebarDrawer open={showMobileMenu} onClose={() => setShowMobileMenu(false)} />
      {showCreateModal && <CreateWorkspaceModal onClose={() => setShowCreateModal(false)} />}
      <CommandPalette open={showCommandPalette} onClose={() => setShowCommandPalette(false)} />
    </div>
  );
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider>
      <ShellContent>{children}</ShellContent>
    </WorkspaceProvider>
  );
}
