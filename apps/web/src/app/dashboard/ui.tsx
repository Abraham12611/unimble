"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

export function DashboardClient() {
  return (
    <div className="flex-1 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Dashboard</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/settings/sessions"
            className="rounded-md border border-[#222222] bg-[#0f0f0f] px-3 py-2 text-sm text-[#F0F0F0]"
          >
            Sessions
          </Link>
          <UserButton userProfileMode="navigation" userProfileUrl="/settings/profile" />
        </div>
      </div>
    </div>
  );
}
