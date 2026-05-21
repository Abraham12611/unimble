"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Robot, Check, ArrowRight, ArrowLeft, Clock, Lightning } from "@phosphor-icons/react";
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
  const router = useRouter();
  const { workspace } = useWorkspaceContext();
  const slug = workspace?.slug ?? "";

  const [currentStep, setCurrentStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [operatorName, setOperatorName] = useState("");
  const [description, setDescription] = useState("");
  const [persona, setPersona] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [frequency, setFrequency] = useState("daily");
  const [timezone, setTimezone] = useState("UTC");

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
    router.push(`/w/${slug}/operators`);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <PageHeader
        title="Deploy Operator"
        description="Set up and deploy a new operator for your workspace."
      />

      {/* Step Indicator */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0px",
          padding: "16px 0",
        }}
      >
        {steps.map((step, index) => (
          <div key={step} style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}
            >
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "13px",
                  fontWeight: 600,
                  background:
                    index < currentStep
                      ? "var(--chart-primary)"
                      : index === currentStep
                        ? "var(--chart-primary)"
                        : "var(--bg-input)",
                  color: index <= currentStep ? "#fff" : "var(--text-muted)",
                  border: index <= currentStep ? "none" : "1px solid var(--border-default)",
                }}
              >
                {index < currentStep ? <Check size={14} weight="bold" /> : index + 1}
              </div>
              <span
                style={{
                  fontSize: "12px",
                  color: index === currentStep ? "var(--text-primary)" : "var(--text-muted)",
                  fontWeight: index === currentStep ? 500 : 400,
                  whiteSpace: "nowrap",
                }}
              >
                {step}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                style={{
                  width: "48px",
                  height: "2px",
                  background: index < currentStep ? "var(--chart-primary)" : "var(--border-subtle)",
                  margin: "0 8px",
                  marginBottom: "22px",
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div style={{ minHeight: "360px" }}>
        {/* Step 1: Choose Template */}
        {currentStep === 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "12px",
            }}
          >
            {templates.map((template) => (
              <div
                key={template.id}
                onClick={() => handleTemplateSelect(template.id)}
                style={{
                  background: "var(--bg-card)",
                  border:
                    selectedTemplate === template.id
                      ? "2px solid var(--chart-primary)"
                      : "1px solid var(--border-subtle)",
                  borderRadius: "14px",
                  padding: "20px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  transition: "border-color 0.15s ease",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
                >
                  <Robot size={24} weight="duotone" style={{ color: "var(--chart-primary)" }} />
                  {template.popular && <Badge>Popular</Badge>}
                </div>
                <span
                  style={{
                    fontSize: "15px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  {template.name}
                </span>
                <span
                  style={{
                    fontSize: "13px",
                    color: "var(--text-secondary)",
                    lineHeight: "1.4",
                  }}
                >
                  {template.description}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Step 2: Configure */}
        {currentStep === 1 && (
          <Card
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "14px",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                }}
              >
                Operator Name
              </label>
              <Input
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                placeholder="Enter operator name"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-default)",
                  fontSize: "13px",
                }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                }}
              >
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this operator do?"
                rows={3}
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "8px",
                  padding: "10px 12px",
                  fontSize: "13px",
                  color: "var(--text-primary)",
                  resize: "vertical",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                }}
              >
                Persona{" "}
                <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional)</span>
              </label>
              <textarea
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                placeholder="Describe a custom AI personality for this operator..."
                rows={3}
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "8px",
                  padding: "10px 12px",
                  fontSize: "13px",
                  color: "var(--text-primary)",
                  resize: "vertical",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
            </div>
          </Card>
        )}

        {/* Step 3: Schedule */}
        {currentStep === 2 && (
          <Card
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "14px",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Clock size={20} style={{ color: "var(--text-secondary)" }} />
                <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>
                  Enable scheduled runs
                </span>
              </div>
              <button
                onClick={() => setScheduleEnabled(!scheduleEnabled)}
                style={{
                  width: "40px",
                  height: "22px",
                  borderRadius: "11px",
                  border: "none",
                  cursor: "pointer",
                  background: scheduleEnabled ? "var(--chart-primary)" : "var(--border-default)",
                  position: "relative",
                  transition: "background 0.2s ease",
                }}
              >
                <div
                  style={{
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    background: "#fff",
                    position: "absolute",
                    top: "3px",
                    left: scheduleEnabled ? "21px" : "3px",
                    transition: "left 0.2s ease",
                  }}
                />
              </button>
            </div>

            {scheduleEnabled ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                    }}
                  >
                    Frequency
                  </label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value)}
                    style={{
                      background: "var(--bg-input)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "8px",
                      padding: "10px 12px",
                      fontSize: "13px",
                      color: "var(--text-primary)",
                      outline: "none",
                      cursor: "pointer",
                    }}
                  >
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label
                    style={{
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                    }}
                  >
                    Timezone
                  </label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    style={{
                      background: "var(--bg-input)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "8px",
                      padding: "10px 12px",
                      fontSize: "13px",
                      color: "var(--text-primary)",
                      outline: "none",
                      cursor: "pointer",
                    }}
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
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px 16px",
                  background: "var(--bg-input)",
                  borderRadius: "8px",
                }}
              >
                <Lightning size={16} style={{ color: "var(--text-muted)" }} />
                <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                  Operator will only run when triggered manually.
                </span>
              </div>
            )}
          </Card>
        )}

        {/* Step 4: Review & Deploy */}
        {currentStep === 3 && (
          <Card
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "14px",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <h3
              style={{ fontSize: "18px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}
            >
              Review your operator
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 500 }}>
                  Template
                </span>
                <span style={{ fontSize: "13px", color: "var(--text-primary)" }}>
                  {selectedTemplateData?.name ?? "—"}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 500 }}>
                  Name
                </span>
                <span style={{ fontSize: "13px", color: "var(--text-primary)" }}>
                  {operatorName || "—"}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 500 }}>
                  Description
                </span>
                <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                  {description || "—"}
                </span>
              </div>

              {persona && (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 500 }}>
                    Persona
                  </span>
                  <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                    {persona}
                  </span>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 500 }}>
                  Schedule
                </span>
                <span style={{ fontSize: "13px", color: "var(--text-primary)" }}>
                  {scheduleEnabled
                    ? `${frequency.charAt(0).toUpperCase() + frequency.slice(1)} — ${timezone}`
                    : "Manual trigger only"}
                </span>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Navigation */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: "8px",
        }}
      >
        <Link
          href={`/w/${slug}/operators`}
          style={{
            fontSize: "13px",
            color: "var(--text-muted)",
            textDecoration: "none",
          }}
        >
          Cancel
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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
            <Button onClick={handleDeploy}>Deploy Operator</Button>
          )}
        </div>
      </div>
    </div>
  );
}
