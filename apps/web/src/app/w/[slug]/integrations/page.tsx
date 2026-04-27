"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  Plugs,
  MagnifyingGlass,
  CheckCircle,
  Warning,
  ArrowClockwise,
  Plus,
} from "@phosphor-icons/react";
import { useWorkspaceContext } from "@/lib/workspace-context";
import {
  useIntegrationCatalog,
  useIntegrationCategories,
  useWorkspaceIntegrations,
} from "@/lib/integrationHooks";
import { ConnectIntegrationModal } from "./connect-modal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CatalogItem = {
  slug: string;
  name: string;
  description: string;
  category: string;
  authType: string;
  permissions: string[];
  iconSlug: string;
  status: string;
};

type ConnectedIntegration = {
  _id: string;
  provider: string;
  name: string;
  status?: string;
  lastUsedAt?: number;
  createdAt: number;
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function IntegrationsPage() {
  const { workspace, slug: wsSlug } = useWorkspaceContext();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [connectSlug, setConnectSlug] = useState<string | null>(null);

  // Show success/error toast from OAuth callback
  const connectedToolkit = searchParams.get("connected");
  const callbackStatus = searchParams.get("status");
  const callbackError = searchParams.get("error");
  const pathname = usePathname();

  // Clear OAuth callback params from URL after displaying the toast
  useEffect(() => {
    if (!callbackStatus) return;
    const timer = setTimeout(() => {
      router.replace(pathname, { scroll: false });
    }, 5000);
    return () => clearTimeout(timer);
  }, [callbackStatus, pathname, router]);

  // Queries — strip the virtual "__connected__" category before
  // sending to the backend (it's a frontend-only filter)
  const catalogCategory =
    activeCategory && activeCategory !== "__connected__" ? activeCategory : undefined;
  const catalog = useIntegrationCatalog({
    category: catalogCategory,
    search: search || undefined,
  });
  const categories = useIntegrationCategories();
  const connected = useWorkspaceIntegrations(workspace?._id) as ConnectedIntegration[] | undefined;

  // Build a set of connected provider slugs for quick lookup
  const connectedMap = useMemo(() => {
    if (!connected) return new Map<string, ConnectedIntegration>();
    const map = new Map<string, ConnectedIntegration>();
    for (const c of connected) {
      if (c.status === "active") map.set(c.provider, c);
    }
    return map;
  }, [connected]);

  const connectedCount = connectedMap.size;
  const totalCount = catalog?.length ?? 0;

  const handleConnect = useCallback((slug: string) => {
    setConnectSlug(slug);
  }, []);

  const handleManage = useCallback(
    (connectionId: string) => {
      router.push(`/w/${wsSlug}/integrations/${connectionId}`);
    },
    [router, wsSlug]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-medium leading-snug">Integrations</h1>
          <p className="mt-1 text-[12px] text-[#888888]">
            {connectedCount} connected, {totalCount} available
          </p>
        </div>
      </div>

      {/* OAuth callback toast */}
      {callbackStatus === "success" && connectedToolkit && (
        <div className="flex items-center gap-2 rounded-[10px] border border-[#222222] bg-[rgba(34,197,94,0.1)] px-4 py-3">
          <CheckCircle size={16} className="text-[#22C55E]" />
          <span className="text-[13px] text-[#22C55E]">
            Successfully connected {connectedToolkit}
          </span>
        </div>
      )}
      {callbackStatus === "error" && (
        <div className="flex items-center gap-2 rounded-[10px] border border-[#222222] bg-[rgba(239,68,68,0.12)] px-4 py-3">
          <Warning size={16} className="text-[#EF4444]" />
          <span className="text-[13px] text-[#EF4444]">
            Connection failed
            {callbackError ? `: ${callbackError}` : ""}
          </span>
        </div>
      )}

      {/* Search + Category Tabs */}
      <div className="space-y-3">
        <div className="relative">
          <MagnifyingGlass
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555555]"
          />
          <input
            type="text"
            placeholder="Search integrations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] py-2 pl-9 pr-3 text-[13px] text-[#F0F0F0] placeholder-[#555555] outline-none transition-colors focus:border-[#3A3A3A]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className={`rounded-[6px] px-3 py-1 text-[12px] font-medium transition-colors ${
              !activeCategory
                ? "bg-[#1C1C1C] text-[#F0F0F0]"
                : "text-[#555555] hover:text-[#888888]"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory("__connected__")}
            className={`rounded-[6px] px-3 py-1 text-[12px] font-medium transition-colors ${
              activeCategory === "__connected__"
                ? "bg-[#1C1C1C] text-[#F0F0F0]"
                : "text-[#555555] hover:text-[#888888]"
            }`}
          >
            Connected
          </button>
          {categories?.map((cat: { key: string; label: string }) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => setActiveCategory(cat.key)}
              className={`rounded-[6px] px-3 py-1 text-[12px] font-medium transition-colors ${
                activeCategory === cat.key
                  ? "bg-[#1C1C1C] text-[#F0F0F0]"
                  : "text-[#555555] hover:text-[#888888]"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Integration Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {catalog === undefined
          ? // Loading skeleton
            Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-[140px] animate-pulse rounded-[14px] border border-[#222222] bg-[#161616]"
              />
            ))
          : activeCategory === "__connected__"
            ? // Show only connected integrations
              catalog
                .filter((item: CatalogItem) => connectedMap.has(item.slug))
                .map((item: CatalogItem) => (
                  <IntegrationCard
                    key={item.slug}
                    item={item}
                    connection={connectedMap.get(item.slug)}
                    onConnect={handleConnect}
                    onManage={handleManage}
                  />
                ))
            : catalog.map((item: CatalogItem) => (
                <IntegrationCard
                  key={item.slug}
                  item={item}
                  connection={connectedMap.get(item.slug)}
                  onConnect={handleConnect}
                  onManage={handleManage}
                />
              ))}
      </div>

      {catalog && catalog.length === 0 && (
        <div className="py-12 text-center">
          <Plugs size={32} className="mx-auto mb-3 text-[#555555]" />
          <p className="text-[13px] text-[#888888]">No integrations found</p>
        </div>
      )}

      {/* Connect Modal */}
      {connectSlug && (
        <ConnectIntegrationModal slug={connectSlug} onClose={() => setConnectSlug(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Integration Card
// ---------------------------------------------------------------------------

function IntegrationCard({
  item,
  connection,
  onConnect,
  onManage,
}: {
  item: CatalogItem;
  connection?: ConnectedIntegration;
  onConnect: (slug: string) => void;
  onManage: (connectionId: string) => void;
}) {
  const isConnected = Boolean(connection);
  const isComingSoon = item.status === "coming_soon";

  return (
    <div
      className={`flex flex-col justify-between rounded-[14px] border border-[#222222] bg-[#161616] p-5 transition-colors ${
        isComingSoon ? "opacity-60" : "hover:border-[#2A2A2A] hover:bg-[#1C1C1C]"
      }`}
    >
      <div>
        {/* Header: icon + status */}
        <div className="flex items-start justify-between">
          <div className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-[#1A1A1A] text-[#888888]">
            <Plugs size={18} />
          </div>
          {isConnected && (
            <span className="flex items-center gap-1 rounded-[6px] bg-[rgba(34,197,94,0.1)] px-2 py-0.5 text-[11px] font-medium text-[#22C55E]">
              <CheckCircle size={12} weight="fill" />
              Active
            </span>
          )}
          {isComingSoon && (
            <span className="rounded-[6px] bg-[rgba(160,160,160,0.08)] px-2 py-0.5 text-[11px] font-medium text-[#A0A0A0]">
              Coming soon
            </span>
          )}
        </div>

        {/* Name + description */}
        <h3 className="mt-3 text-[13px] font-medium text-[#F0F0F0]">{item.name}</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-[#888888]">{item.description}</p>
      </div>

      {/* Action */}
      <div className="mt-4">
        {isConnected ? (
          <button
            type="button"
            onClick={() => onManage(connection!._id)}
            className="flex w-full items-center justify-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-1.5 text-[12px] font-medium text-[#888888] transition-colors hover:bg-[#222222] hover:text-[#F0F0F0]"
          >
            <ArrowClockwise size={12} />
            Manage
          </button>
        ) : isComingSoon ? (
          <button
            type="button"
            disabled
            className="flex w-full items-center justify-center gap-1.5 rounded-[6px] border border-[#222222] bg-[#111111] px-3 py-1.5 text-[12px] font-medium text-[#3A3A3A]"
          >
            Coming soon
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onConnect(item.slug)}
            className="flex w-full items-center justify-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[12px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222]"
          >
            <Plus size={12} />
            Connect
          </button>
        )}
      </div>
    </div>
  );
}
