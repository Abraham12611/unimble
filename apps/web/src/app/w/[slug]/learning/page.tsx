"use client";

import {
  Brain,
  ArrowRight,
  BookOpen,
  Video,
  Code,
  Lightning,
  CheckCircle,
  Lock,
} from "@phosphor-icons/react";

type Module = {
  id: string;
  title: string;
  description: string;
  duration: string;
  type: "article" | "video" | "interactive";
  difficulty: "beginner" | "intermediate" | "advanced";
  completed?: boolean;
  locked?: boolean;
};

const MODULES: Module[] = [
  { id: "intro", title: "What is Unimble?", description: "Learn how AI-powered content operators work and how they fit into your workflow.", duration: "5 min", type: "article", difficulty: "beginner", completed: false },
  { id: "first-operator", title: "Deploying your first operator", description: "Step-by-step guide to setting up and running your first content growth operator.", duration: "10 min", type: "interactive", difficulty: "beginner" },
  { id: "workflows", title: "Understanding workflows", description: "How triggers, steps, and conditions chain together to automate complex publishing tasks.", duration: "12 min", type: "article", difficulty: "beginner" },
  { id: "integrations-101", title: "Connecting your platforms", description: "Link Twitter, Substack, LinkedIn, and other platforms to let operators publish on your behalf.", duration: "8 min", type: "video", difficulty: "beginner" },
  { id: "approvals", title: "Content approvals & quality gates", description: "Set up human-in-the-loop reviews to keep quality high while automating at scale.", duration: "7 min", type: "article", difficulty: "intermediate" },
  { id: "analytics-guide", title: "Reading your analytics", description: "Make sense of execution metrics, success rates, and content performance data.", duration: "10 min", type: "article", difficulty: "intermediate" },
  { id: "advanced-scheduling", title: "Advanced scheduling & triggers", description: "Use cron schedules, webhooks, and event-based triggers for sophisticated automation.", duration: "15 min", type: "interactive", difficulty: "advanced", locked: true },
  { id: "multi-operator", title: "Multi-operator orchestration", description: "Chain multiple operators together to build end-to-end content production pipelines.", duration: "20 min", type: "article", difficulty: "advanced", locked: true },
];

const RESOURCES = [
  { title: "API Reference", description: "Full REST and webhook API documentation.", href: "#", icon: Code },
  { title: "Changelog", description: "What's new in the latest releases.", href: "#", icon: Lightning },
  { title: "Community forum", description: "Ask questions and share tips with other Unimble users.", href: "#", icon: Brain },
];

function typeIcon(type: Module["type"]) {
  switch (type) {
    case "video": return <Video size={13} />;
    case "interactive": return <Code size={13} />;
    default: return <BookOpen size={13} />;
  }
}

function difficultyColor(d: Module["difficulty"]) {
  switch (d) {
    case "beginner": return "text-[#22C55E] bg-[rgba(34,197,94,0.08)]";
    case "intermediate": return "text-[#F59E0B] bg-[rgba(245,158,11,0.08)]";
    case "advanced": return "text-[#6366F1] bg-[rgba(99,102,241,0.08)]";
  }
}

export default function LearningPage() {
  const completed = MODULES.filter((m) => m.completed).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[18px] font-medium leading-snug">Learning Center</h1>
        <p className="mt-1 text-[12px] text-[#888888]">Guides, tutorials, and reference docs to help you get the most out of Unimble</p>
      </div>

      {/* Progress bar */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="flex items-center justify-between">
          <div className="text-[14px] font-medium">Your progress</div>
          <div className="text-[12px] text-[#555555]">{completed} / {MODULES.length} modules</div>
        </div>
        <div className="mt-3 h-1.5 w-full rounded-full bg-[#222222]">
          <div className="h-1.5 rounded-full bg-[#6366F1] transition-all" style={{ width: `${(completed / MODULES.length) * 100}%` }} />
        </div>
        {completed === 0 && (
          <div className="mt-2 text-[11px] text-[#555555]">Start with &quot;What is Unimble?&quot; to begin your learning path.</div>
        )}
      </div>

      {/* Module list */}
      <div>
        <div className="mb-3 text-[13px] font-medium text-[#888888]">All modules</div>
        <div className="space-y-2">
          {MODULES.map((mod) => (
            <div key={mod.id}
              className={`flex items-center gap-4 rounded-[12px] border bg-[#161616] p-4 transition-colors ${mod.locked ? "cursor-not-allowed opacity-50 border-[#1C1C1C]" : "border-[#222222] hover:border-[#2A2A2A] cursor-pointer"}`}>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[rgba(99,102,241,0.1)] text-[#6366F1]">
                {mod.locked ? <Lock size={15} /> : typeIcon(mod.type)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium">{mod.title}</span>
                  {mod.completed && <CheckCircle size={13} weight="fill" className="shrink-0 text-[#22C55E]" />}
                </div>
                <div className="mt-0.5 text-[11px] text-[#555555] truncate">{mod.description}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${difficultyColor(mod.difficulty)}`}>
                  {mod.difficulty}
                </span>
                <span className="text-[11px] text-[#555555]">{mod.duration}</span>
                {!mod.locked && <ArrowRight size={13} className="text-[#3A3A3A]" />}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Resources */}
      <div>
        <div className="mb-3 text-[13px] font-medium text-[#888888]">Resources</div>
        <div className="grid gap-3 sm:grid-cols-3">
          {RESOURCES.map((r) => {
            const Icon = r.icon;
            return (
              <a key={r.title} href={r.href}
                className="flex items-center gap-3 rounded-[12px] border border-[#222222] bg-[#161616] p-4 transition-colors hover:border-[#2A2A2A]">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#1C1C1C]">
                  <Icon size={16} className="text-[#888888]" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">{r.title}</div>
                  <div className="text-[11px] text-[#555555] truncate">{r.description}</div>
                </div>
                <ArrowRight size={12} className="ml-auto shrink-0 text-[#3A3A3A]" />
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
