"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { anyApi } from "convex/server";
import { useMutation } from "convex/react";
import { useWorkspaceContext } from "@/lib/workspace-context";
import {
  Robot,
  Check,
  ArrowLeft,
  ArrowRight,
  Rocket,
  Gear,
  Plugs,
  Calendar,
  ListChecks,
  Brain,
} from "@phosphor-icons/react";

// ─── Operator templates ──────────────────────────────────────────────────────

const TEMPLATES = [
  {
    type: "content_growth",
    name: "Content Growth",
    description: "Generates and publishes SEO-optimised blog posts, newsletters, and social threads.",
    icon: Brain,
    color: "text-[#6366F1] bg-[rgba(99,102,241,0.12)]",
  },
  {
    type: "community_engagement",
    name: "Community Engagement",
    description: "Monitors community channels, responds to questions, and surfaces trending discussions.",
    icon: Robot,
    color: "text-[#22C55E] bg-[rgba(34,197,94,0.1)]",
  },
  {
    type: "feedback_loop",
    name: "Feedback Loop",
    description: "Collects product feedback, categorises it, and distils actionable insights.",
    icon: ListChecks,
    color: "text-[#F59E0B] bg-[rgba(245,158,11,0.1)]",
  },
  {
    type: "documentation_agent",
    name: "Documentation Agent",
    description: "Keeps docs up-to-date by syncing changelogs, updating API references, and filling gaps.",
    icon: Gear,
    color: "text-[#3B82F6] bg-[rgba(59,130,246,0.1)]",
  },
  {
    type: "cross_platform_publishing",
    name: "Cross-Platform Publishing",
    description: "Repurposes long-form content into platform-specific formats across all channels.",
    icon: Plugs,
    color: "text-[#A855F7] bg-[rgba(168,85,247,0.1)]",
  },
] as const;

const SCHEDULES = [
  { value: "manual", label: "Manual", description: "Run on demand only" },
  { value: "hourly", label: "Hourly", description: "Runs every hour" },
  { value: "daily", label: "Daily", description: "Runs once per day" },
  { value: "weekly", label: "Weekly", description: "Runs every Monday" },
] as const;

const STEPS = [
  { id: "template", label: "Template", icon: Robot },
  { id: "identity", label: "Identity", icon: Gear },
  { id: "integrations", label: "Integrations", icon: Plugs },
  { id: "schedule", label: "Schedule", icon: Calendar },
  { id: "review", label: "Review", icon: ListChecks },
] as const;

type StepId = (typeof STEPS)[number]["id"];

// ─── Component ───────────────────────────────────────────────────────────────

export default function DeployOperatorPage() {
  const router = useRouter();
  const { workspace } = useWorkspaceContext();
  const slug = workspace?.slug;
  const deployOperator = useMutation(anyApi.operators.deployOperator);

  const [step, setStep] = useState<StepId>("template");
  const [selectedType, setSelectedType] = useState<string>("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [schedule, setSchedule] = useState("daily");
  const [requireApproval, setRequireApproval] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentIdx = STEPS.findIndex((s) => s.id === step);
  const template = TEMPLATES.find((t) => t.type === selectedType);

  function canAdvance(): boolean {
    if (step === "template") return Boolean(selectedType);
    if (step === "identity") return name.trim().length > 0;
    return true;
  }

  function advance() {
    if (!canAdvance()) return;
    const next = STEPS[currentIdx + 1];
    if (next) setStep(next.id);
  }

  function back() {
    const prev = STEPS[currentIdx - 1];
    if (prev) setStep(prev.id);
    else router.push(`/w/${slug}/operators`);
  }

  async function handleDeploy() {
    if (!workspace?._id || !selectedType || !name.trim()) return;
    setDeploying(true);
    setError(null);
    try {
      await deployOperator({
        workspaceId: workspace._id,
        operatorType: selectedType,
        name: name.trim(),
        description: description.trim() || undefined,
        settings: { schedule, requireApproval },
      });
      router.push(`/w/${slug}/operators`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeploying(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.push(`/w/${slug}/operators`)}
          className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[#555555] transition-colors hover:bg-[#1C1C1C] hover:text-[#888888]">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-[18px] font-medium leading-snug">Deploy Operator</h1>
          <p className="mt-0.5 text-[12px] text-[#888888]">Configure and deploy a new AI content operator</p>
        </div>
      </div>

      {/* Step progress */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => {
          const done = i < currentIdx;
          const active = s.id === step;
          const Icon = s.icon;
          return (
            <div key={s.id} className="flex items-center">
              <div className={`flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[12px] font-medium ${active ? "text-[#F0F0F0]" : done ? "text-[#22C55E]" : "text-[#555555]"}`}>
                <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${active ? "bg-[#F0F0F0] text-[#090909]" : done ? "bg-[rgba(34,197,94,0.15)] text-[#22C55E]" : "bg-[#222222] text-[#555555]"}`}>
                  {done ? <Check size={10} weight="bold" /> : <Icon size={10} />}
                </div>
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-px w-4 sm:w-8 ${i < currentIdx ? "bg-[#22C55E]" : "bg-[#222222]"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-6">

        {/* Step 1: Template */}
        {step === "template" && (
          <div className="space-y-4">
            <div className="text-[15px] font-medium">Choose a template</div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {TEMPLATES.map((t) => {
                const Icon = t.icon;
                const selected = selectedType === t.type;
                return (
                  <button key={t.type} type="button" onClick={() => setSelectedType(t.type)}
                    className={`rounded-[12px] border p-4 text-left transition-colors ${selected ? "border-[#6366F1] bg-[rgba(99,102,241,0.06)]" : "border-[#222222] bg-[#111111] hover:border-[#2A2A2A]"}`}>
                    <div className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-[8px] ${t.color}`}>
                      <Icon size={18} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-[13px] font-medium">{t.name}</div>
                      {selected && <Check size={14} className="text-[#6366F1]" />}
                    </div>
                    <p className="mt-1 text-[11px] text-[#888888] leading-relaxed">{t.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Identity */}
        {step === "identity" && (
          <div className="space-y-4 max-w-lg">
            <div className="text-[15px] font-medium">Configure identity</div>
            <div className="space-y-1">
              <label className="text-[12px] text-[#666666]">Operator Name *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder={template?.name ?? "My Operator"}
                className="w-full rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] outline-none placeholder:text-[#555555] focus:border-[#3A3A3A]" />
            </div>
            <div className="space-y-1">
              <label className="text-[12px] text-[#666666]">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="What will this operator do for your workspace?"
                rows={3}
                className="w-full resize-none rounded-[6px] border border-[#2A2A2A] bg-[#1A1A1A] px-3 py-2 text-[13px] outline-none placeholder:text-[#555555] focus:border-[#3A3A3A]" />
            </div>
          </div>
        )}

        {/* Step 3: Integrations */}
        {step === "integrations" && (
          <div className="space-y-4">
            <div className="text-[15px] font-medium">Connect integrations</div>
            <p className="text-[13px] text-[#888888]">Connect the platforms this operator will publish to and read from.</p>
            <div className="rounded-[10px] border border-[#222222] bg-[#111111] p-4 text-[13px] text-[#555555]">
              Integrations will be sourced from your workspace. You can connect more in the{" "}
              <a href={`/w/${slug}/integrations`} className="text-[#6366F1] hover:underline">Integrations</a> page.
            </div>
          </div>
        )}

        {/* Step 4: Schedule */}
        {step === "schedule" && (
          <div className="space-y-4">
            <div className="text-[15px] font-medium">Set schedule</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {SCHEDULES.map((s) => (
                <button key={s.value} type="button" onClick={() => setSchedule(s.value)}
                  className={`rounded-[10px] border p-3 text-left transition-colors ${schedule === s.value ? "border-[#6366F1] bg-[rgba(99,102,241,0.06)]" : "border-[#222222] bg-[#111111] hover:border-[#2A2A2A]"}`}>
                  <div className="flex items-center justify-between">
                    <div className="text-[13px] font-medium">{s.label}</div>
                    {schedule === s.value && <Check size={13} className="text-[#6366F1]" />}
                  </div>
                  <div className="text-[11px] text-[#555555]">{s.description}</div>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-[10px] border border-[#222222] bg-[#111111] p-3">
              <div>
                <div className="text-[13px] font-medium">Require approval before publishing</div>
                <div className="text-[11px] text-[#555555]">Content will wait for human review before going live</div>
              </div>
              <button type="button" onClick={() => setRequireApproval((v) => !v)}
                className={`relative h-5 w-9 rounded-full transition-colors ${requireApproval ? "bg-[#6366F1]" : "bg-[#2A2A2A]"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-[#F0F0F0] shadow transition-transform ${requireApproval ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Review */}
        {step === "review" && (
          <div className="space-y-4">
            <div className="text-[15px] font-medium">Review & deploy</div>
            {error && (
              <div className="rounded-[10px] border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] p-3 text-[12px] text-[#EF4444]">{error}</div>
            )}
            <div className="rounded-[10px] border border-[#222222] bg-[#111111] divide-y divide-[#1C1C1C]">
              {[
                { label: "Template", value: template?.name ?? "—" },
                { label: "Name", value: name || "—" },
                { label: "Description", value: description || "(none)" },
                { label: "Schedule", value: schedule },
                { label: "Requires approval", value: requireApproval ? "Yes" : "No" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-[12px] text-[#555555]">{row.label}</span>
                  <span className="text-[13px] capitalize">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between">
        <button type="button" onClick={back}
          className="flex items-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-2 text-[13px] hover:bg-[#222222]">
          <ArrowLeft size={14} /> {currentIdx === 0 ? "Cancel" : "Back"}
        </button>

        {step === "review" ? (
          <button type="button" onClick={handleDeploy} disabled={deploying}
            className="flex items-center gap-1.5 rounded-[6px] bg-[#6366F1] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#5153CC] disabled:opacity-50">
            <Rocket size={14} /> {deploying ? "Deploying…" : "Deploy Operator"}
          </button>
        ) : (
          <button type="button" onClick={advance} disabled={!canAdvance()}
            className="flex items-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-2 text-[13px] font-medium hover:bg-[#222222] disabled:cursor-not-allowed disabled:text-[#555555]">
            Continue <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
