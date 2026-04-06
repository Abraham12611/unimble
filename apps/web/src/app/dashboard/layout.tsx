import type { ReactNode } from "react";
import { requireAuth } from "@/lib/requireAuth";

export default async function Layout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  await requireAuth();

  return (
    <div className="flex-1 bg-[#090909] p-6 text-[#F0F0F0]">
      <div className="mx-auto w-full max-w-5xl">{children}</div>
    </div>
  );
}
