"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  House,
  Robot,
  GitBranch,
  Play,
  Plugs,
  ChartBar,
  Gear,
  Brain,
  Bell,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { WorkspaceProvider, useWorkspaceContext } from "@/lib/workspace-context";
import { WorkspaceSwitcher } from "./workspace-switcher";

const NAV_ITEMS = [
  { href: "dashboard", icon: House, label: "Home" },
  { href: "operators", icon: Robot, label: "Operators" },
  { href: "workflows", icon: GitBranch, label: "Workflows" },
  { href: "executions", icon: Play, label: "Executions" },
  { href: "integrations", icon: Plugs, label: "Integrations" },
  { href: "analytics", icon: ChartBar, label: "Analytics" },
  { href: "settings", icon: Gear, label: "Settings" },
  { href: "learning", icon: Brain, label: "Learning" },
] as const;

function SidebarNav() {
  const pathname = usePathname();
  const { slug } = useWorkspaceContext();

  return (
    <nav className="flex h-full w-12 flex-col items-center border-r border-[#222222] bg-[#111111] py-3">
      <div className="flex flex-1 flex-col items-center gap-2">
        {NAV_ITEMS.map((item) => {
          const fullHref = `/w/${slug}/${item.href}`;
          const isActive = pathname?.startsWith(fullHref);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={fullHref}
              title={item.label}
              className={`relative flex h-8 w-8 items-center justify-center rounded-[6px] transition-colors ${
                isActive
                  ? "bg-[#1C1C1C] text-[#F0F0F0]"
                  : "text-[#555555] hover:bg-[#1C1C1C] hover:text-[#888888]"
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-[#F0F0F0]" />
              )}
              <Icon size={18} weight={isActive ? "fill" : "regular"} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function TopBar() {
  return (
    <header className="flex h-[52px] items-center justify-between border-b border-[#222222] bg-[#090909] px-4">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-[15px] font-medium text-[#F0F0F0]">
          Unimble
        </Link>
        <span className="text-[#333333]">/</span>
        <WorkspaceSwitcher />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          title="Search"
          className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[#555555] transition-colors hover:bg-[#1C1C1C] hover:text-[#888888]"
        >
          <MagnifyingGlass size={18} />
        </button>
        <button
          type="button"
          title="Notifications"
          className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[#555555] transition-colors hover:bg-[#1C1C1C] hover:text-[#888888]"
        >
          <Bell size={18} />
        </button>
        <UserButton userProfileMode="navigation" userProfileUrl="/settings/profile" />
      </div>
    </header>
  );
}

function WorkspaceGuard({ children }: { children: ReactNode }) {
  const { workspace, isLoading } = useWorkspaceContext();

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#090909] text-[#555555]">
        <div className="text-[13px]">Loading workspace…</div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#090909]">
        <div className="space-y-2 text-center">
          <div className="text-[15px] font-medium text-[#F0F0F0]">Workspace not found</div>
          <div className="text-[12px] text-[#888888]">
            This workspace doesn&apos;t exist or you don&apos;t have access.
          </div>
          <Link
            href="/dashboard"
            className="mt-3 inline-block rounded-[10px] border border-[#2A2A2A] bg-[#1C1C1C] px-4 py-2 text-[13px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222]"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider>
      <div className="flex h-screen flex-col bg-[#090909] text-[#F0F0F0]">
        <TopBar />
        <div className="flex flex-1 overflow-hidden">
          <SidebarNav />
          <main className="flex-1 overflow-y-auto">
            <WorkspaceGuard>
              <div className="mx-auto w-full max-w-6xl p-6">{children}</div>
            </WorkspaceGuard>
          </main>
        </div>
      </div>
    </WorkspaceProvider>
  );
}
