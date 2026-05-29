import { SentryTestButtons } from "./SentryTestButtons";

export default function SentryTestPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-[#090909] text-[#F0F0F0]">
      <h1 className="text-xl font-medium">Sentry Integration Test</h1>
      <p className="text-[#888888] text-sm">This page is for verifying Sentry integration.</p>
      <SentryTestButtons />
    </div>
  );
}
