import Link from "next/link";

export default function Page() {
  return (
    <div className="flex flex-1 items-center justify-center bg-[#090909] p-6 text-[#F0F0F0]">
      <div className="w-full max-w-md rounded-xl border border-[#222222] bg-[#161616] p-6">
        <h1 className="text-lg font-medium">Unauthorized</h1>
        <p className="mt-2 text-sm text-[#888888]">You don’t have access to this page.</p>
        <div className="mt-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-md border border-[#222222] bg-[#0f0f0f] px-3 py-2 text-sm text-[#F0F0F0]"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
