"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Gear, Warning, Shield, Bell, CreditCard, Key } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useWorkspaceContext } from "@/lib/workspace-context";

const SETTINGS_TABS = [
  { href: "team", icon: Users, label: "Team" },
  { href: "roles", icon: Shield, label: "Roles" },
  { href: "general", icon: Gear, label: "General" },
  { href: "notifications", icon: Bell, label: "Notifications" },
  { href: "billing", icon: CreditCard, label: "Billing" },
  { href: "api-keys", icon: Key, label: "API Keys" },
  { href: "danger", icon: Warning, label: "Danger Zone" },
] as const;

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { slug } = useWorkspaceContext();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[18px] font-medium leading-snug">Settings</h1>
        <p className="mt-1 text-[12px] text-[#888888]">Manage your workspace</p>
      </div>

      <div className="flex items-center gap-1 border-b border-[#222222]">
        {SETTINGS_TABS.map((tab) => {
          const fullHref = `/w/${slug}/settings/${tab.href}`;
          const isActive = pathname === fullHref || pathname?.startsWith(`${fullHref}/`);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={fullHref}
              className={`flex items-center gap-1.5 border-b-2 px-3 pb-2 pt-1 text-[13px] font-medium transition-colors ${
                isActive
                  ? "border-[#F0F0F0] text-[#F0F0F0]"
                  : "border-transparent text-[#555555] hover:text-[#888888]"
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
