"use client";

import { useState, useCallback } from "react";
import { OnboardingStepLayout } from "./components/OnboardingStepLayout";
import {
  WelcomeStep,
  ProfileStep,
  CompanyStep,
  UseCaseStep,
  IntegrationsStep,
  OperatorsStep,
  WorkspaceStep,
  InviteStep,
  CompletionStep,
} from "./steps";
import type { OnboardingData } from "./types";
import { ONBOARDING_STEPS, getDefaultUseCase, getDefaultOperators } from "./types";

export function OnboardingClient() {
  const [uiState, setUiState] = useState(0); // 0=welcome, 1-7=data steps, 8=completion

  const [data, setData] = useState<OnboardingData>({
    fullName: "",
    avatarUrl: "",
    role: "",
    companyName: "",
    companySize: "1-10",
    useCase: "Other",
    workspaceName: "",
    integrations: [
      { service: "slack", connected: false },
      { service: "discord", connected: false },
      { service: "notion", connected: false },
      { service: "github", connected: false },
      { service: "x", connected: false },
      { service: "linkedin", connected: false },
    ],
    operatorTemplates: [],
    inviteEmails: "",
  });

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dataStepIndex = uiState - 1; // 0-6 for the 7 data steps
  const step = ONBOARDING_STEPS[dataStepIndex];

  const isWelcome = uiState === 0;
  const isCompletion = uiState === 8;

  const isStepComplete = useCallback(
    (key: string) => {
      if (key === "profile") return data.fullName.trim().length > 0 && data.role !== "";
      if (key === "company") return data.companyName.trim().length > 0;
      if (key === "useCase") return true;
      if (key === "integrations") return true;
      if (key === "operators") return data.operatorTemplates.length > 0;
      if (key === "workspace") return data.workspaceName.trim().length > 0;
      if (key === "invite") return true;
      return false;
    },
    [data]
  );

  const maxReachableIndex = (() => {
    for (let i = 0; i < ONBOARDING_STEPS.length; i += 1) {
      if (!isStepComplete(ONBOARDING_STEPS[i].key)) return i;
    }
    return ONBOARDING_STEPS.length - 1;
  })();

  const canContinue = step ? isStepComplete(step.key) && !saving : true;

  const persistAndFinish = async () => {
    setSaving(true);
    setSaveError(null);

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        setSaving(false);
        setSaveError("We couldn't save your onboarding details. Please try again.");
        return;
      }

      setUiState(8); // go to completion
    } catch {
      setSaving(false);
      setSaveError("We couldn't save your onboarding details. Please try again.");
    }
  };

  const goNext = async () => {
    if (isCompletion) return;

    if (uiState === 7) {
      // Last data step (invite) → persist and finish
      await persistAndFinish();
      return;
    }

    setUiState((s) => s + 1);
  };

  const goBack = () => {
    if (isWelcome) return;
    setUiState((s) => Math.max(0, s - 1));
  };

  const skipStep = () => {
    if (!step?.optional) return;
    goNext();
  };

  const handleStepClick = (index: number) => {
    if (index > maxReachableIndex) return;
    setUiState(index + 1);
  };

  const updateData = (partial: Partial<OnboardingData>) => {
    setData((prev) => {
      const next = { ...prev, ...partial };
      // Smart defaults: when role changes, update useCase
      if (partial.role && partial.role !== prev.role) {
        next.useCase = getDefaultUseCase(partial.role);
      }
      // Smart defaults: when useCase changes, update operators
      if (partial.useCase && partial.useCase !== prev.useCase) {
        next.operatorTemplates = getDefaultOperators(partial.useCase);
      }
      return next;
    });
  };

  // Welcome screen
  if (isWelcome) {
    return <WelcomeStep onStart={() => setUiState(1)} />;
  }

  // Completion screen
  if (isCompletion) {
    return <CompletionStep data={data} />;
  }

  // Data steps
  const stepDescriptions: Record<string, string> = {
    profile: "Tell us how you want to appear in Unimble.",
    company: "This helps us tailor defaults and templates.",
    useCase: "Pick your primary workflow focus.",
    integrations: "Link the platforms your operators will use. Skip any you don't need right now.",
    operators: "Pick 1–3 operators to pre-configure in your workspace.",
    workspace: "Create your first workspace. You can add more later.",
    invite: "Invite teammates now, or skip and do it later.",
  };

  return (
    <OnboardingStepLayout
      stepIndex={dataStepIndex}
      totalSteps={ONBOARDING_STEPS.length}
      stepTitle={step.title}
      stepDescription={stepDescriptions[step.key]}
      onBack={goBack}
      onContinue={goNext}
      onSkip={step.optional ? skipStep : undefined}
      canContinue={canContinue}
      continueLabel={dataStepIndex === ONBOARDING_STEPS.length - 1 ? "Finish" : undefined}
      isFirst={dataStepIndex === 0}
      isLast={dataStepIndex === ONBOARDING_STEPS.length - 1}
      saving={saving}
      saveError={saveError}
      steps={ONBOARDING_STEPS}
      onStepClick={handleStepClick}
      maxReachableIndex={maxReachableIndex}
    >
      {step.key === "profile" && (
        <ProfileStep
          data={{ fullName: data.fullName, avatarUrl: data.avatarUrl, role: data.role }}
          onChange={(partial) => updateData(partial)}
        />
      )}
      {step.key === "company" && (
        <CompanyStep
          data={{ companyName: data.companyName, companySize: data.companySize }}
          onChange={(partial) => updateData(partial)}
        />
      )}
      {step.key === "useCase" && (
        <UseCaseStep data={{ useCase: data.useCase }} onChange={(partial) => updateData(partial)} />
      )}
      {step.key === "integrations" && (
        <IntegrationsStep
          data={{ integrations: data.integrations }}
          onChange={(partial) => updateData(partial)}
        />
      )}
      {step.key === "operators" && (
        <OperatorsStep
          data={{ operatorTemplates: data.operatorTemplates }}
          onChange={(partial) => updateData(partial)}
        />
      )}
      {step.key === "workspace" && (
        <WorkspaceStep
          data={{ workspaceName: data.workspaceName }}
          onChange={(partial) => updateData(partial)}
        />
      )}
      {step.key === "invite" && (
        <InviteStep
          data={{ inviteEmails: data.inviteEmails, workspaceName: data.workspaceName }}
          onChange={(partial) => updateData(partial)}
        />
      )}
    </OnboardingStepLayout>
  );
}
