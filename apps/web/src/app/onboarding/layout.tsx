export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-[#090909] text-[#F0F0F0]">
      <div className="w-full max-w-2xl rounded-[14px] border border-[#222222] bg-[#161616] px-6 py-5 shadow-[0_1px_2px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.04)]">
        {children}
      </div>
    </div>
  );
}
