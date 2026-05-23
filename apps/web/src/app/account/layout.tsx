"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Shield, Bell, SlidersHorizontal } from "@phosphor-icons/react";
import type { ReactNode } from "react";

const ACCOUNT_TABS = [
  { href: "/account/profile", icon: User, label: "Profile" },
  { href: "/account/security", icon: Shield, label: "Security" },
  { href: "/account/notifications", icon: Bell, label: "Notifications" },
  { href: "/account/preferences", icon: SlidersHorizontal, label: "Preferences" },
] as const;

export default function AccountLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-[18px] font-medium leading-snug text-[#F0F0F0]">Account Settings</h1>
        <p className="mt-1 text-[12px] text-[#888888]">Manage your profile and preferences</p>
      </div>

      <div className="flex items-center gap-1 border-b border-[#222222]">
        {ACCOUNT_TABS.map((tab) => {
          const isActive = pathname === tab.href || pathname?.startsWith(`${tab.href}/`);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
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
