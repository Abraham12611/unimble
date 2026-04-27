"use client";

import { useState, useCallback, useEffect } from "react";
import {
  X,
  CheckCircle,
  Eye,
  EyeSlash,
  Plugs,
  ArrowSquareOut,
  CircleNotch,
  Key,
  ShieldCheck,
} from "@phosphor-icons/react";
import { useWorkspaceContext } from "@/lib/workspace-context";
import {
  useIntegrationMeta,
  useInitiateToolkitAuth,
  useConnectWithApiKey,
} from "@/lib/integrationHooks";

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function ConnectIntegrationModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const { workspace, slug: wsSlug } = useWorkspaceContext();
  const meta = useIntegrationMeta(slug);
  const initiateAuth = useInitiateToolkitAuth();
  const connectApiKey = useConnectWithApiKey();

  const [step, setStep] = useState<"info" | "api_key" | "connecting" | "success" | "error">("info");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleOAuthConnect = useCallback(async () => {
    if (!workspace || !wsSlug) return;
    setStep("connecting");
    setError("");

    try {
      const result = await initiateAuth({
        workspaceId: workspace._id,
        toolkitSlug: slug,
        workspaceSlug: wsSlug,
      });

      // Redirect to the OAuth provider
      if (result?.redirectUrl) {
        window.location.href = result.redirectUrl;
      } else {
        setError("No redirect URL returned");
        setStep("error");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      setStep("error");
    }
  }, [workspace, wsSlug, slug, initiateAuth]);

  const handleApiKeyConnect = useCallback(async () => {
    if (!workspace || !apiKey.trim()) return;
    setStep("connecting");
    setError("");

    try {
      const result = await connectApiKey({
        workspaceId: workspace._id,
        toolkitSlug: slug,
        apiKey: apiKey.trim(),
      });

      if (result?.ok) {
        setStep("success");
      } else {
        setError(result?.message ?? "Connection failed");
        setStep("error");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      setStep("error");
    }
  }, [workspace, slug, apiKey, connectApiKey]);

  if (!meta) {
    return null;
  }

  const isOAuth = meta.authType === "oauth";
  const isApiKey = meta.authType === "api_key";
  const isBotToken = meta.authType === "bot_token";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={() => {}}
      role="dialog"
      aria-modal="true"
      aria-label={`Connect ${meta.name}`}
    >
      <div className="w-full max-w-md rounded-[14px] border border-[#222222] bg-[#161616] shadow-[0_8px_32px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.06)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#222222] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-[#1A1A1A] text-[#888888]">
              <Plugs size={16} />
            </div>
            <h2 className="text-[15px] font-medium text-[#F0F0F0]">
              {step === "success" ? `${meta.name} Connected!` : `Connect ${meta.name}`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#555555] transition-colors hover:bg-[#1C1C1C] hover:text-[#888888]"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {step === "info" && (
            <InfoStep
              meta={meta}
              isOAuth={isOAuth}
              isApiKey={isApiKey || isBotToken}
              onOAuthConnect={handleOAuthConnect}
              onApiKeyStep={() => setStep("api_key")}
            />
          )}

          {step === "api_key" && (
            <ApiKeyStep
              meta={meta}
              apiKey={apiKey}
              showKey={showKey}
              onApiKeyChange={setApiKey}
              onToggleShow={() => setShowKey(!showKey)}
              onConnect={handleApiKeyConnect}
              onBack={() => setStep("info")}
            />
          )}

          {step === "connecting" && <ConnectingStep />}

          {step === "success" && <SuccessStep meta={meta} onDone={onClose} />}

          {step === "error" && (
            <ErrorStep error={error} onRetry={() => setStep("info")} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

function InfoStep({
  meta,
  isOAuth,
  isApiKey,
  onOAuthConnect,
  onApiKeyStep,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meta: any;
  isOAuth: boolean;
  isApiKey: boolean;
  onOAuthConnect: () => void;
  onApiKeyStep: () => void;
}) {
  return (
    <div className="space-y-5">
      {/* Permissions */}
      <div>
        <p className="mb-2 text-[12px] font-medium text-[#888888]">Unimble will be able to:</p>
        <ul className="space-y-1.5">
          {meta.permissions?.map((perm: string) => (
            <li key={perm} className="flex items-center gap-2 text-[13px] text-[#F0F0F0]">
              <ShieldCheck size={14} className="shrink-0 text-[#22C55E]" />
              {perm}
            </li>
          ))}
        </ul>
      </div>

      {/* Auth type badge */}
      <div className="flex items-center gap-2">
        <span className="rounded-[6px] bg-[rgba(59,130,246,0.12)] px-2 py-0.5 text-[11px] font-medium text-[#3B82F6]">
          {isOAuth ? "OAuth 2.0" : "API Key"}
        </span>
        <span className="text-[11px] text-[#555555]">
          {isOAuth ? "Secure redirect-based authentication" : "Enter your API key to connect"}
        </span>
      </div>

      {/* Action button */}
      {isOAuth ? (
        <button
          type="button"
          onClick={onOAuthConnect}
          className="flex w-full items-center justify-center gap-2 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-4 py-2.5 text-[13px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222]"
        >
          <ArrowSquareOut size={14} />
          Connect with {meta.name}
        </button>
      ) : isApiKey ? (
        <button
          type="button"
          onClick={onApiKeyStep}
          className="flex w-full items-center justify-center gap-2 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-4 py-2.5 text-[13px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222]"
        >
          <Key size={14} />
          Enter API Key
        </button>
      ) : null}

      <p className="text-center text-[11px] text-[#555555]">
        By connecting, you agree to our Terms of Service and Privacy Policy.
      </p>
    </div>
  );
}

function ApiKeyStep({
  meta,
  apiKey,
  showKey,
  onApiKeyChange,
  onToggleShow,
  onConnect,
  onBack,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meta: any;
  apiKey: string;
  showKey: boolean;
  onApiKeyChange: (v: string) => void;
  onToggleShow: () => void;
  onConnect: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-[#888888]">Enter your {meta.name} API key to connect.</p>

      <div>
        <label htmlFor="api-key-input" className="mb-1.5 block text-[12px] text-[#666666]">
          API Key
        </label>
        <div className="relative">
          <input
            id="api-key-input"
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder="Enter your API key"
            className="w-full rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] py-2 pl-3 pr-10 font-mono text-[12px] text-[#F0F0F0] placeholder-[#555555] outline-none transition-colors focus:border-[#3A3A3A]"
          />
          <button
            type="button"
            onClick={onToggleShow}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#555555] hover:text-[#888888]"
          >
            {showKey ? <EyeSlash size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-[6px] border border-[#2A2A2A] bg-transparent px-3 py-2 text-[13px] font-medium text-[#888888] transition-colors hover:bg-[#1C1C1C] hover:text-[#F0F0F0]"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onConnect}
          disabled={!apiKey.trim()}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-2 text-[13px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Connect
        </button>
      </div>
    </div>
  );
}

function ConnectingStep() {
  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <CircleNotch size={24} className="animate-spin text-[#888888]" />
      <p className="text-[13px] text-[#888888]">Connecting…</p>
    </div>
  );
}

function SuccessStep({
  meta,
  onDone,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  meta: any;
  onDone: () => void;
}) {
  return (
    <div className="space-y-4 text-center">
      <CheckCircle size={32} weight="fill" className="mx-auto text-[#22C55E]" />
      <p className="text-[13px] text-[#F0F0F0]">Successfully connected to {meta.name}</p>
      <button
        type="button"
        onClick={onDone}
        className="w-full rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-4 py-2 text-[13px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222]"
      >
        Done
      </button>
    </div>
  );
}

function ErrorStep({
  error,
  onRetry,
  onClose,
}: {
  error: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-[10px] border border-[#222222] bg-[rgba(239,68,68,0.12)] px-4 py-3">
        <p className="text-[13px] text-[#EF4444]">{error}</p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-[6px] border border-[#2A2A2A] bg-transparent px-3 py-2 text-[13px] font-medium text-[#888888] transition-colors hover:bg-[#1C1C1C]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onRetry}
          className="flex-1 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-2 text-[13px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222]"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
