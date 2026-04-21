"use client";

import { Shield } from "@phosphor-icons/react";

const BUILT_IN_ROLES = [
  {
    name: "Owner",
    description: "Full control over the workspace. Can delete workspace and manage billing.",
    permissions: [
      "View all resources",
      "Run operators",
      "Configure operators",
      "Deploy operators",
      "Manage integrations",
      "Approve content",
      "Manage team",
      "Manage billing",
      "Delete workspace",
    ],
    color: "text-[#6366F1] bg-[rgba(99,102,241,0.12)]",
  },
  {
    name: "Admin",
    description: "Can manage operators, integrations, and team members. Cannot delete workspace.",
    permissions: [
      "View all resources",
      "Run operators",
      "Configure operators",
      "Deploy operators",
      "Manage integrations",
      "Approve content",
      "Manage team",
    ],
    color: "text-[#F59E0B] bg-[rgba(245,158,11,0.12)]",
  },
  {
    name: "Member",
    description: "Can view and run operators, approve content. Cannot manage team or integrations.",
    permissions: ["View all resources", "Run operators", "Configure operators", "Approve content"],
    color: "text-[#22C55E] bg-[rgba(34,197,94,0.1)]",
  },
  {
    name: "Viewer",
    description: "Read-only access to workspace resources.",
    permissions: ["View all resources"],
    color: "text-[#A0A0A0] bg-[rgba(160,160,160,0.08)]",
  },
] as const;

export default function RolesPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-[#888888]" />
          <div className="text-[15px] font-medium text-[#F0F0F0]">Workspace Roles</div>
        </div>
        <p className="mt-1 text-[12px] text-[#888888]">
          Built-in roles define what members can do within this workspace. Custom roles will be
          available in a future update.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {BUILT_IN_ROLES.map((role) => (
          <div key={role.name} className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
            <div className="flex items-center gap-2">
              <span className={`rounded-[6px] px-2 py-0.5 text-[12px] font-medium ${role.color}`}>
                {role.name}
              </span>
            </div>
            <p className="mt-2 text-[12px] text-[#888888]">{role.description}</p>
            <div className="mt-3 space-y-1">
              <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#555555]">
                Permissions
              </div>
              <ul className="space-y-0.5">
                {role.permissions.map((perm) => (
                  <li key={perm} className="text-[12px] text-[#A0A0A0]">
                    • {perm}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
