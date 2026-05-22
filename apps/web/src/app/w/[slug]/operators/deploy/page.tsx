"use client";

import { useState } from "react";
import Link from "next/link";
import { Robot, Check, ArrowRight, ArrowLeft, Clock, Lightning, Info } from "@phosphor-icons/react";
import { Button, Card, Input, Badge } from "@/components/ui";
import { PageHeader } from "@/components/layout";
import { useWorkspaceContext } from "@/lib/workspace-context";

const templates = [
  {
    id: "content",
    name: "Content",
    description: "Generate and publish content across channels automatically.",
    popular: true,
  },
  {
    id: "growth",
    name: "Growth",
    description: "Analyze metrics and suggest growth experiments.",
    popular: false,
  },
  {
    id: "community",
    name: "Community",
    description: "Monitor and engage with your community members.",
    popular: false,
  },
  {
    id: "feedback",
    name: "Feedback",
    description: "Collect, categorize, and summarize user feedback.",
    popular: false,
  },
  {
    id: "documentation",
    name: "Documentation",
    description: "Keep docs up-to-date and generate new pages from code.",
    popular: false,
  },
];

const steps = ["Choose Template", "Configure", "Schedule", "Review & Deploy"];

export default function OperatorDeployPage() {
  const { workspace, slug, isLoading } = useWorkspaceContext();

  const [currentStep, setCurrentStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [operatorName, setOperatorName] = useState("");
  const [description, setDescription] = useState("");
  const [persona, setPersona] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [frequency, setFrequency] = useState("daily");
  const [timezone, setTimezone] = useState("UTC");
  const [deployNotice, setDeployNotice] = useState(false);

  const selectedTemplateData = templates.find((t) => t.id === selectedTemplate);

  function handleTemplateSelect(id: string) {
    setSelectedTemplate(id);
    const tmpl = templates.find((t) => t.id === id);
    if (tmpl) {
      setOperatorName(`${tmpl.name} Operator`);
      setDescription(tmpl.description);
    }
  }

  function handleNext() {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  }

  function handleBack() {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  }

  function handleDeploy() {
    // TODO: Wire to Convex mutation when backend deployment API is ready
    setDeployNotice(true);
  }

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return selectedTemplate !== null;
      case 1:
        return operatorName.trim().length > 0;
      case 2:
        return true;
      case 3:
        return true;
      default:
        return false;
    }
  };

  // Guard: show loading state until workspace context resolves
  if (isLoading || !workspace || !slug) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-[13px] text-[var(--text-muted)]">Loading workspace…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Deploy Operator"
        description="Set up and deploy a new operator for your workspace."
      />

      {/* Step Indicator */}
      <div className="flex items-center justify-center py-4">
        {steps.map((step, index) => (
          <div key={step} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-semibold ${
                  index <= currentStep
                    ? "bg-[var(--chart-primary)] text-white"
                    : "border border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-muted)]"
                }`}
              >
                {index < currentStep ? <Check size={14} weight="bold" /> : index + 1}
              </div>
              <span
                className={`whitespace-nowrap text-[12px] ${
                  index === currentStep
                    ? "font-medium text-[var(--text-primary)]"
                    : "text-[var(--text-muted)]"
                }`}
              >
                {step}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`mx-2 mb-[22px] h-0.5 w-12 ${
                  index < currentStep ? "bg-[var(--chart-primary)]" : "bg-[var(--border-subtle)]"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="min-h-[360px]">
        {/* Step 1: Choose Template */}
        {currentStep === 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {templates.map((template) => (
              <div
                key={template.id}
                onClick={() => handleTemplateSelect(template.id)}
                className={`flex cursor-pointer flex-col gap-2.5 rounded-[14px] bg-[var(--bg-card)] p-5 transition-colors ${
                  selectedTemplate === template.id
                    ? "border-2 border-[var(--chart-primary)]"
                    : "border border-[var(--border-subtle)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <Robot size={24} weight="duotone" className="text-[var(--chart-primary)]" />
                  {template.popular && <Badge>Popular</Badge>}
                </div>
                <span className="text-[15px] font-semibold text-[var(--text-primary)]">
                  {template.name}
                </span>
                <span className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                  {template.description}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Step 2: Configure */}
        {currentStep === 1 && (
          <Card className="flex flex-col gap-5 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6">
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[var(--text-secondary)]">
                Operator Name
              </label>
              <Input
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                placeholder="Enter operator name"
                className="border-[var(--border-default)] bg-[var(--bg-input)] text-[13px]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[var(--text-secondary)]">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this operator do?"
                rows={3}
                className="resize-y rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2.5 font-[inherit] text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-[var(--text-secondary)]">
                Persona <span className="font-normal text-[var(--text-muted)]">(optional)</span>
              </label>
              <textarea
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                placeholder="Describe a custom AI personality for this operator..."
                rows={3}
                className="resize-y rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2.5 font-[inherit] text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
              />
            </div>
          </Card>
        )}

        {/* Step 3: Schedule */}
        {currentStep === 2 && (
          <Card className="flex flex-col gap-5 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Clock size={20} className="text-[var(--text-secondary)]" />
                <span className="text-[15px] font-semibold text-[var(--text-primary)]">
                  Enable scheduled runs
                </span>
              </div>
              <button
                onClick={() => setScheduleEnabled(!scheduleEnabled)}
                className={`relative h-[22px] w-10 cursor-pointer rounded-full border-none transition-colors duration-200 ${
                  scheduleEnabled ? "bg-[var(--chart-primary)]" : "bg-[var(--border-default)]"
                }`}
              >
                <div
                  className={`absolute top-[3px] h-4 w-4 rounded-full bg-white transition-[left] duration-200 ${
                    scheduleEnabled ? "left-[21px]" : "left-[3px]"
                  }`}
                />
              </button>
            </div>

            {scheduleEnabled ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-[var(--text-secondary)]">
                    Frequency
                  </label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value)}
                    className="cursor-pointer rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
                  >
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-[var(--text-secondary)]">
                    Timezone
                  </label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="cursor-pointer rounded-[8px] border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
                  >
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">America/New_York</option>
                    <option value="America/Los_Angeles">America/Los_Angeles</option>
                    <option value="Europe/London">Europe/London</option>
                    <option value="Asia/Tokyo">Asia/Tokyo</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-[8px] bg-[var(--bg-input)] px-4 py-3">
                <Lightning size={16} className="text-[var(--text-muted)]" />
                <span className="text-[13px] text-[var(--text-muted)]">
                  Operator will only run when triggered manually.
                </span>
              </div>
            )}
          </Card>
        )}

        {/* Step 4: Review & Deploy */}
        {currentStep === 3 && (
          <Card className="flex flex-col gap-4 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6">
            <h3 className="m-0 text-[18px] font-semibold text-[var(--text-primary)]">
              Review your operator
            </h3>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[12px] font-medium text-[var(--text-muted)]">Template</span>
                <span className="text-[13px] text-[var(--text-primary)]">
                  {selectedTemplateData?.name ?? "—"}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[12px] font-medium text-[var(--text-muted)]">Name</span>
                <span className="text-[13px] text-[var(--text-primary)]">
                  {operatorName || "—"}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[12px] font-medium text-[var(--text-muted)]">
                  Description
                </span>
                <span className="text-[13px] text-[var(--text-secondary)]">
                  {description || "—"}
                </span>
              </div>

              {persona && (
                <div className="flex flex-col gap-1">
                  <span className="text-[12px] font-medium text-[var(--text-muted)]">Persona</span>
                  <span className="text-[13px] text-[var(--text-secondary)]">{persona}</span>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <span className="text-[12px] font-medium text-[var(--text-muted)]">Schedule</span>
                <span className="text-[13px] text-[var(--text-primary)]">
                  {scheduleEnabled
                    ? `${frequency.charAt(0).toUpperCase() + frequency.slice(1)} — ${timezone}`
                    : "Manual trigger only"}
                </span>
              </div>
            </div>

            {/* Coming-soon notice (shown after clicking Deploy) */}
            {deployNotice && (
              <div className="mt-2 flex items-center gap-2 rounded-[8px] bg-[var(--semantic-info-bg)] px-4 py-3">
                <Info size={16} className="shrink-0 text-[var(--semantic-info-fg)]" />
                <span className="text-[13px] text-[var(--semantic-info-fg)]">
                  Deployment is not yet connected to the backend. This feature is coming soon.
                </span>
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <Link
          href={`/w/${slug}/operators`}
          className="text-[13px] text-[var(--text-muted)] no-underline hover:text-[var(--text-secondary)]"
        >
          Cancel
        </Link>

        <div className="flex items-center gap-2">
          {currentStep > 0 && (
            <Button onClick={handleBack} variant="secondary">
              <ArrowLeft size={14} />
              Back
            </Button>
          )}
          {currentStep < steps.length - 1 ? (
            <Button onClick={handleNext} disabled={!canProceed()}>
              Next
              <ArrowRight size={14} />
            </Button>
          ) : (
            <Button onClick={handleDeploy} disabled={deployNotice}>
              Deploy Operator
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
