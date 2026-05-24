"use client";

import { useState } from "react";
import {
  TrendUp,
  Brain,
  Star,
  Lightbulb,
  CalendarBlank,
  Gear,
  Export,
  ArrowRight,
  CheckCircle,
  Clock,
  CaretRight,
  Plus,
  Play,
  PauseCircle,
  Fire,
  Buildings,
  Question,
  ChartLineUp,
} from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Mock data — TODO: replace with Convex queries
// ---------------------------------------------------------------------------

const MOCK_TRENDS = [
  { topic: "AI search optimization", change: "+45%", type: "hot" },
  { topic: "RevenueCat v5 migration", change: "+32%", type: "hot" },
  { topic: "Privacy-first monetization", change: "emerging", type: "emerging" },
  { topic: "Flutter subscriptions", change: "steady", type: "neutral" },
];

const MOCK_COMPETITOR_ACTIVITY = [
  { name: "Competitor A", action: "Launched new webhook feature" },
  { name: "Competitor B", action: "Published 3 tutorials on paywalls" },
  { name: "Competitor C", action: "Active on Reddit (15 posts this week)" },
];

const MOCK_COMMUNITY_QUESTIONS = [
  { question: "How to handle subscription upgrades?", count: 12 },
  { question: "Best practices for trial periods?", count: 8 },
  { question: "RevenueCat vs StoreKit 2?", count: 6 },
];

const MOCK_OPPORTUNITIES = [
  {
    id: "opp1",
    title: "Complete Guide to AI Search Optimization for DevTools",
    reason: "Trending topic, no comprehensive guide exists",
    impact: "High",
  },
  {
    id: "opp2",
    title: "RevenueCat v5 Migration Checklist",
    reason: "High search volume, community questions",
    impact: "High",
  },
  {
    id: "opp3",
    title: "Subscription Upgrades: A Developer's Guide",
    reason: "12 unanswered community questions",
    impact: "Medium",
  },
];

const MOCK_APPLIED_LEARNINGS = [
  {
    id: "l1",
    insight: "Code examples in Swift perform 2x better than Kotlin",
    applied: "March 28, 2026",
    evidence: "20 posts analyzed, p-value < 0.05",
    impact: "+35% engagement on Swift content",
    scope: "This workspace",
  },
  {
    id: "l2",
    insight: "Tuesday 10am EST is optimal posting time",
    applied: "March 25, 2026",
    evidence: "4-week A/B test, 32% higher engagement",
    impact: "+22% average reach",
    scope: "This workspace",
  },
];

const MOCK_PENDING_LEARNINGS = [
  {
    id: "p1",
    insight: 'Add "Common Mistakes" section to all tutorials',
    confidence: 87,
    evidence: "Tutorials with this section get +25% shares",
    sampleSize: 35,
    proposedAction: "Update content template",
  },
  {
    id: "p2",
    insight: "Reduce article length to under 1500 words",
    confidence: 72,
    evidence: "Completion rate 78% vs 45% for longer articles",
    sampleSize: 28,
    proposedAction: "Adjust word count targets",
  },
];

const MOCK_SKILLS = {
  technicalAccuracy: [
    { label: "Review score improved", value: "7.8 → 8.2 (+0.4)" },
    { label: "Fewer revision requests", value: "2.1 → 1.4 per article" },
    { label: "Code example accuracy", value: "94% → 98%" },
  ],
  knowledgeUpdates: [
    "Ingested RevenueCat SDK v5 documentation",
    "Learned new React Native 0.73 patterns",
    "Updated competitor pricing information",
    "Indexed 15 new community discussions",
  ],
  styleImprovements: [
    "Better at matching brand voice (feedback score +12%)",
    "Reduced passive voice usage by 40%",
    "Improved code comment quality",
  ],
  communityEngagement: [
    "Reddit tone calibration improved",
    "Discord response helpfulness +18%",
    "GitHub issue triage accuracy 95%",
  ],
};

const MOCK_SKILL_PROGRESS = [
  { label: "Technical Writing Quality", jan: 72, feb: 78, mar: 82, max: 100 },
  { label: "First-Draft Approval Rate", jan: 45, feb: 58, mar: 72, max: 100 },
  { label: "Community Engagement Score", jan: 31, feb: 38, mar: 42, max: 50 },
];

const MOCK_SUGGESTIONS = {
  contentStrategy: [
    {
      id: "s1",
      suggestion: "Consider A/B testing video vs text tutorials",
      reason: "Video content trending +30% in your niche",
      action: "Create Experiment",
    },
    {
      id: "s2",
      suggestion: "Community wants more React Native content",
      reason: "8 unanswered questions, competitor gap",
      action: "Add to Content Calendar",
    },
    {
      id: "s3",
      suggestion: "Competitor gap: No one covering webhooks well",
      reason: "High search volume, low competition",
      action: "Create Content Brief",
    },
  ],
  workflowOptimization: [
    {
      id: "w1",
      suggestion: "Enable parallel reviews to reduce turnaround",
      impact: "-30% time to publish",
      action: "Enable",
    },
    {
      id: "w2",
      suggestion: "Add automated SEO checks before publish",
      impact: "+15% organic traffic",
      action: "Enable",
    },
  ],
  integrationImprovements: [
    {
      id: "i1",
      suggestion: "Twitter API rate limits causing delays",
      fix: "Spread posts across day",
      action: "Apply Fix",
    },
  ],
};

const MOCK_SCHEDULED_REPORTS = [
  {
    id: "r1",
    name: "Weekly Trends Report",
    schedule: "Every Monday at 9:00 AM",
    recipients: ["admin@company.com", "team@company.com"],
    channels: "Email, Slack #unimble-reports",
    active: true,
  },
  {
    id: "r2",
    name: "Weekly Skills Report",
    schedule: "Every Monday at 9:00 AM",
    recipients: ["admin@company.com"],
    channels: "Email",
    active: true,
  },
];

const MOCK_REPORT_HISTORY = [
  { date: "Mar 31", report: "Weekly Trends", status: "Delivered" },
  { date: "Mar 31", report: "Weekly Skills", status: "Delivered" },
  { date: "Mar 24", report: "Weekly Trends", status: "Delivered" },
  { date: "Mar 24", report: "Weekly Skills", status: "Delivered" },
];

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function ImpactBadge({ impact }: { impact: string }) {
  const color =
    impact === "High"
      ? "bg-[rgba(34,197,94,0.1)] text-[#22C55E]"
      : impact === "Medium"
        ? "bg-[rgba(245,158,11,0.12)] text-[#F59E0B]"
        : "bg-[rgba(160,160,160,0.08)] text-[#A0A0A0]";
  return (
    <span className={cn("rounded-[6px] px-2 py-0.5 text-[11px] font-medium", color)}>
      {impact} impact
    </span>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#1A1A1A]">
      <div className="h-full rounded-full bg-[#6366F1]" style={{ width: `${pct}%` }} />
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 text-[13px] font-medium text-[#F0F0F0]">
      <Icon size={14} className="text-[#888888]" />
      {title}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab content components
// ---------------------------------------------------------------------------

function TrendsTab() {
  return (
    <div className="space-y-5">
      {/* Industry trends */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="flex items-center justify-between">
          <SectionTitle icon={Fire} title="Industry Trends (Week of March 31)" />
          <button
            type="button"
            className="flex items-center gap-1 text-[11px] text-[#555555] transition-colors hover:text-[#F0F0F0]"
          >
            View Full Report <ArrowRight size={11} />
          </button>
        </div>

        <div className="mt-4 space-y-5">
          {/* Trending topics */}
          <div>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#555555]">
              Trending Topics in Your Niche
            </div>
            <div className="space-y-2">
              {MOCK_TRENDS.map((t) => (
                <div
                  key={t.topic}
                  className="flex items-center justify-between rounded-[10px] border border-[#1A1A1A] bg-[#111111] px-3 py-2"
                >
                  <span className="text-[13px] text-[#F0F0F0]">{t.topic}</span>
                  <span
                    className={cn(
                      "rounded-[6px] px-2 py-0.5 text-[11px] font-medium",
                      t.type === "hot"
                        ? "bg-[rgba(239,68,68,0.12)] text-[#EF4444]"
                        : t.type === "emerging"
                          ? "bg-[rgba(245,158,11,0.12)] text-[#F59E0B]"
                          : "bg-[rgba(160,160,160,0.08)] text-[#A0A0A0]"
                    )}
                  >
                    {t.change}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Competitor activity */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[#555555]">
              <Buildings size={12} />
              Competitor Activity
            </div>
            <div className="space-y-1.5">
              {MOCK_COMPETITOR_ACTIVITY.map((c) => (
                <div key={c.name} className="flex items-start gap-2 text-[12px]">
                  <CaretRight size={12} className="mt-0.5 shrink-0 text-[#555555]" />
                  <span>
                    <span className="font-medium text-[#888888]">{c.name}:</span>{" "}
                    <span className="text-[#888888]">{c.action}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Community questions */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[#555555]">
              <Question size={12} />
              Community Questions (Unanswered Opportunities)
            </div>
            <div className="space-y-1.5">
              {MOCK_COMMUNITY_QUESTIONS.map((q) => (
                <div key={q.question} className="flex items-start gap-2 text-[12px]">
                  <CaretRight size={12} className="mt-0.5 shrink-0 text-[#555555]" />
                  <span className="text-[#888888]">
                    &ldquo;{q.question}&rdquo; —{" "}
                    <span className="text-[#F0F0F0]">{q.count} questions</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content opportunities */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <SectionTitle icon={Lightbulb} title="Content Opportunities" />
        <p className="mt-1.5 text-[12px] text-[#555555]">
          Based on trends and gaps, consider creating:
        </p>
        <div className="mt-4 space-y-3">
          {MOCK_OPPORTUNITIES.map((opp, i) => (
            <div
              key={opp.id}
              className="flex items-start justify-between gap-4 rounded-[10px] border border-[#1A1A1A] bg-[#111111] px-4 py-3"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-[13px] font-medium text-[#F0F0F0]">
                  {i + 1}. {opp.title}
                </div>
                <div className="text-[11px] text-[#555555]">Reason: {opp.reason}</div>
                <ImpactBadge impact={opp.impact} />
              </div>
              <button
                type="button"
                className="flex shrink-0 items-center gap-1 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[11px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222]"
              >
                Create Content <ArrowRight size={11} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LearningsTab() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const pendingVisible = MOCK_PENDING_LEARNINGS.filter(
    (p) => !dismissed.has(p.id) && !applied.has(p.id)
  );

  return (
    <div className="space-y-5">
      {/* Applied learnings */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <SectionTitle icon={CheckCircle} title="Applied Learnings" />
        <div className="mt-4 space-y-3">
          {MOCK_APPLIED_LEARNINGS.map((l) => (
            <div
              key={l.id}
              className="rounded-[10px] border border-[#1A1A1A] bg-[#111111] px-4 py-3"
            >
              <div className="text-[13px] font-medium text-[#F0F0F0]">{l.insight}</div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-[#555555] sm:grid-cols-4">
                <span>Applied: {l.applied}</span>
                <span>Evidence: {l.evidence}</span>
                <span className="text-[#22C55E]">Impact: {l.impact}</span>
                <span>Scope: {l.scope}</span>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1 text-[11px] text-[#888888] transition-colors hover:text-[#F0F0F0]"
                >
                  View Details
                </button>
                <button
                  type="button"
                  className="rounded-[6px] border border-[rgba(239,68,68,0.3)] px-3 py-1 text-[11px] text-[#EF4444] transition-colors hover:bg-[rgba(239,68,68,0.08)]"
                >
                  Rollback
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pending learnings */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-[#888888]" />
          <div className="text-[13px] font-medium text-[#F0F0F0]">Pending Approval</div>
          {pendingVisible.length > 0 && (
            <span className="rounded-full bg-[rgba(245,158,11,0.12)] px-2 py-0.5 text-[11px] font-medium text-[#F59E0B]">
              {pendingVisible.length}
            </span>
          )}
        </div>

        {pendingVisible.length === 0 ? (
          <div className="mt-6 text-center text-[12px] text-[#555555]">
            No pending learnings — all caught up.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {pendingVisible.map((p) => (
              <div
                key={p.id}
                className="rounded-[10px] border border-[#1A1A1A] bg-[#111111] px-4 py-3"
              >
                <div className="text-[13px] font-medium text-[#F0F0F0]">{p.insight}</div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-[#555555] sm:grid-cols-3">
                  <span>Confidence: {p.confidence}%</span>
                  <span>Evidence: {p.evidence}</span>
                  <span>Sample: {p.sampleSize}</span>
                </div>
                <div className="mt-1.5 text-[11px] text-[#555555]">
                  Proposed: {p.proposedAction}
                </div>
                {/* Confidence bar */}
                <div className="mt-3">
                  <ProgressBar value={p.confidence} max={100} />
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setApplied((s) => new Set(s).add(p.id))}
                    className="rounded-[6px] bg-[rgba(34,197,94,0.1)] px-3 py-1 text-[11px] font-medium text-[#22C55E] transition-colors hover:bg-[rgba(34,197,94,0.18)]"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => setDismissed((s) => new Set(s).add(p.id))}
                    className="rounded-[6px] border border-[#2A2A2A] px-3 py-1 text-[11px] text-[#888888] transition-colors hover:text-[#F0F0F0]"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    className="rounded-[6px] border border-[#2A2A2A] px-3 py-1 text-[11px] text-[#888888] transition-colors hover:text-[#F0F0F0]"
                  >
                    View Evidence
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SkillsTab() {
  return (
    <div className="space-y-5">
      {/* New skills this week */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <SectionTitle icon={Star} title="Skills Acquired (Week of March 31)" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {/* Technical accuracy */}
          <div className="space-y-2 rounded-[10px] border border-[#1A1A1A] bg-[#111111] p-3">
            <div className="text-[12px] font-medium text-[#888888]">Technical Accuracy</div>
            {MOCK_SKILLS.technicalAccuracy.map((s) => (
              <div key={s.label} className="flex items-start gap-1.5 text-[12px]">
                <CaretRight size={12} className="mt-0.5 shrink-0 text-[#555555]" />
                <span className="text-[#888888]">
                  {s.label}: <span className="font-medium text-[#F0F0F0]">{s.value}</span>
                </span>
              </div>
            ))}
          </div>

          {/* Knowledge updates */}
          <div className="space-y-2 rounded-[10px] border border-[#1A1A1A] bg-[#111111] p-3">
            <div className="text-[12px] font-medium text-[#888888]">Knowledge Updates</div>
            {MOCK_SKILLS.knowledgeUpdates.map((s) => (
              <div key={s} className="flex items-start gap-1.5 text-[12px]">
                <CheckCircle size={12} className="mt-0.5 shrink-0 text-[#22C55E]" weight="fill" />
                <span className="text-[#888888]">{s}</span>
              </div>
            ))}
          </div>

          {/* Style improvements */}
          <div className="space-y-2 rounded-[10px] border border-[#1A1A1A] bg-[#111111] p-3">
            <div className="text-[12px] font-medium text-[#888888]">Style Improvements</div>
            {MOCK_SKILLS.styleImprovements.map((s) => (
              <div key={s} className="flex items-start gap-1.5 text-[12px]">
                <CaretRight size={12} className="mt-0.5 shrink-0 text-[#555555]" />
                <span className="text-[#888888]">{s}</span>
              </div>
            ))}
          </div>

          {/* Community engagement */}
          <div className="space-y-2 rounded-[10px] border border-[#1A1A1A] bg-[#111111] p-3">
            <div className="text-[12px] font-medium text-[#888888]">Community Engagement</div>
            {MOCK_SKILLS.communityEngagement.map((s) => (
              <div key={s} className="flex items-start gap-1.5 text-[12px]">
                <CaretRight size={12} className="mt-0.5 shrink-0 text-[#555555]" />
                <span className="text-[#888888]">{s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Skill progress over time */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <SectionTitle icon={ChartLineUp} title="Skill Progress (Last 90 Days)" />
        <div className="mt-4 space-y-5">
          {MOCK_SKILL_PROGRESS.map((skill) => (
            <div key={skill.label} className="space-y-2">
              <div className="text-[12px] font-medium text-[#888888]">{skill.label}</div>
              {[
                { month: "Jan", val: skill.jan },
                { month: "Feb", val: skill.feb },
                { month: "Mar", val: skill.mar },
              ].map((row) => (
                <div key={row.month} className="flex items-center gap-3">
                  <span className="w-6 shrink-0 text-[11px] text-[#555555]">{row.month}</span>
                  <div className="flex-1">
                    <ProgressBar value={row.val} max={skill.max} />
                  </div>
                  <span className="w-8 text-right font-mono text-[11px] text-[#888888]">
                    {row.val}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SuggestionsTab() {
  return (
    <div className="space-y-5">
      {/* Content strategy */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <SectionTitle icon={Lightbulb} title="Content Strategy" />
        <div className="mt-4 space-y-3">
          {MOCK_SUGGESTIONS.contentStrategy.map((s) => (
            <div
              key={s.id}
              className="flex items-start justify-between gap-4 rounded-[10px] border border-[#1A1A1A] bg-[#111111] px-4 py-3"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-[13px] font-medium text-[#F0F0F0]">{s.suggestion}</div>
                <div className="text-[11px] text-[#555555]">Reason: {s.reason}</div>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[11px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222]"
              >
                {s.action}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Workflow optimization */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <SectionTitle icon={TrendUp} title="Workflow Optimization" />
        <div className="mt-4 space-y-3">
          {MOCK_SUGGESTIONS.workflowOptimization.map((s) => (
            <div
              key={s.id}
              className="flex items-start justify-between gap-4 rounded-[10px] border border-[#1A1A1A] bg-[#111111] px-4 py-3"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-[13px] font-medium text-[#F0F0F0]">{s.suggestion}</div>
                <div className="text-[11px] text-[#22C55E]">Potential impact: {s.impact}</div>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-[6px] bg-[rgba(34,197,94,0.1)] px-3 py-1.5 text-[11px] font-medium text-[#22C55E] transition-colors hover:bg-[rgba(34,197,94,0.18)]"
              >
                {s.action}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Integration improvements */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616] p-5">
        <SectionTitle icon={Buildings} title="Integration Improvements" />
        <div className="mt-4 space-y-3">
          {MOCK_SUGGESTIONS.integrationImprovements.map((s) => (
            <div
              key={s.id}
              className="flex items-start justify-between gap-4 rounded-[10px] border border-[#1A1A1A] bg-[#111111] px-4 py-3"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-[13px] font-medium text-[#F0F0F0]">{s.suggestion}</div>
                <div className="text-[11px] text-[#555555]">Suggestion: {s.fix}</div>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-[6px] border border-[rgba(245,158,11,0.3)] px-3 py-1.5 text-[11px] font-medium text-[#F59E0B] transition-colors hover:bg-[rgba(245,158,11,0.08)]"
              >
                {s.action}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReportsTab() {
  return (
    <div className="space-y-5">
      {/* Scheduled reports */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616]">
        <div className="flex items-center justify-between border-b border-[#222222] px-5 py-3">
          <SectionTitle icon={CalendarBlank} title="Scheduled Reports" />
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[12px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222]"
          >
            <Plus size={13} />
            Create New Report
          </button>
        </div>
        <div className="divide-y divide-[#1A1A1A]">
          {MOCK_SCHEDULED_REPORTS.map((r) => (
            <div key={r.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-[13px] font-medium text-[#F0F0F0]">{r.name}</div>
                  <div className="text-[11px] text-[#555555]">Delivery: {r.schedule}</div>
                  <div className="text-[11px] text-[#555555]">
                    Recipients: {r.recipients.join(", ")}
                  </div>
                  <div className="text-[11px] text-[#555555]">Channels: {r.channels}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    className="rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-2.5 py-1 text-[11px] text-[#888888] transition-colors hover:text-[#F0F0F0]"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-2.5 py-1 text-[11px] text-[#888888] transition-colors hover:text-[#F0F0F0]"
                  >
                    <PauseCircle size={12} />
                    Pause
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-[6px] bg-[rgba(99,102,241,0.12)] px-2.5 py-1 text-[11px] font-medium text-[#6366F1] transition-colors hover:bg-[rgba(99,102,241,0.2)]"
                  >
                    <Play size={12} weight="fill" />
                    Send Now
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Report history */}
      <div className="rounded-[14px] border border-[#222222] bg-[#161616]">
        <div className="border-b border-[#222222] px-5 py-3">
          <SectionTitle icon={CalendarBlank} title="Report History" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#1A1A1A]">
                {["Date", "Report", "Status", ""].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-[#555555]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A1A1A]">
              {MOCK_REPORT_HISTORY.map((row, i) => (
                <tr key={i} className="transition-colors hover:bg-[#1C1C1C]">
                  <td className="px-5 py-3 text-[12px] text-[#888888]">{row.date}</td>
                  <td className="px-5 py-3 text-[13px] text-[#F0F0F0]">{row.report}</td>
                  <td className="px-5 py-3">
                    <span className="rounded-[6px] bg-[rgba(34,197,94,0.1)] px-2 py-0.5 text-[11px] font-medium text-[#22C55E]">
                      {row.status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <button
                      type="button"
                      className="text-[11px] text-[#555555] transition-colors hover:text-[#F0F0F0]"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

type Tab = "trends" | "learnings" | "skills" | "suggestions" | "reports";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "trends", label: "Trends", icon: TrendUp },
  { id: "learnings", label: "Learnings", icon: Brain },
  { id: "skills", label: "Skills", icon: Star },
  { id: "suggestions", label: "Suggestions", icon: Lightbulb },
  { id: "reports", label: "Reports", icon: CalendarBlank },
];

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function LearningPage() {
  const [activeTab, setActiveTab] = useState<Tab>("trends");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-medium text-[#F0F0F0]">Learning &amp; Insights</h1>
          <p className="mt-0.5 text-[12px] text-[#888888]">
            What Unimble has learned and discovered
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[12px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222]"
          >
            <Gear size={13} />
            Customize Report
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-[6px] border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-[12px] font-medium text-[#F0F0F0] transition-colors hover:bg-[#222222]"
          >
            <Export size={13} />
            Export Report
          </button>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex items-center gap-1 border-b border-[#222222]">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 pb-2 pt-1 text-[13px] font-medium transition-colors",
                isActive
                  ? "border-[#F0F0F0] text-[#F0F0F0]"
                  : "border-transparent text-[#555555] hover:text-[#888888]"
              )}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "trends" && <TrendsTab />}
      {activeTab === "learnings" && <LearningsTab />}
      {activeTab === "skills" && <SkillsTab />}
      {activeTab === "suggestions" && <SuggestionsTab />}
      {activeTab === "reports" && <ReportsTab />}
    </div>
  );
}
