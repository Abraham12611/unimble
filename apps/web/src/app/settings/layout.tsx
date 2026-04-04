import type { ReactNode } from "react";

export default function Layout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="flex-1 p-6 bg-[#090909] text-[#F0F0F0]">
      <div className="mx-auto w-full max-w-5xl">{children}</div>
    </div>
  );
}
