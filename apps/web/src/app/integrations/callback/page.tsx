"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle, XCircle } from "@phosphor-icons/react";

export default function IntegrationCallbackPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const rawStatus = searchParams.get("status");
    const connectedAccountId = searchParams.get("connected_account_id");

    setStatus(rawStatus);

    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        {
          type: "COMPOSIO_INTEGRATION_COMPLETE",
          status: rawStatus,
          connectedAccountId,
        },
        window.location.origin
      );
    }

    const t = setTimeout(() => window.close(), 1200);
    return () => clearTimeout(t);
  }, [searchParams]);

  const success = status === "success";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090909] px-6">
      <div className="text-center">
        {success ? (
          <CheckCircle size={48} weight="fill" className="mx-auto mb-4 text-[#22C55E]" />
        ) : (
          <XCircle size={48} weight="fill" className="mx-auto mb-4 text-[#EF4444]" />
        )}
        <p className="text-[18px] font-medium text-[#F0F0F0]">
          {success ? "Connected successfully" : "Connection failed"}
        </p>
        <p className="mt-2 text-[13px] text-[#888888]">This window will close automatically.</p>
      </div>
    </div>
  );
}
