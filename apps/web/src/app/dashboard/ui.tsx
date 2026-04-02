"use client";

import { UserButton } from "@clerk/nextjs";

export function DashboardClient() {
  return (
    <div className="flex-1 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">Dashboard</h1>
        <UserButton />
      </div>
    </div>
  );
}
