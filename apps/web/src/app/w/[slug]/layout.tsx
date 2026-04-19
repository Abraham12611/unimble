import type { ReactNode } from "react";
import { requireAuth } from "@/lib/requireAuth";
import { WorkspaceShell } from "./workspace-shell";

export default async function WorkspaceLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  await requireAuth();

  return <WorkspaceShell>{children}</WorkspaceShell>;
}
