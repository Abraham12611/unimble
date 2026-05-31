"use client";

import {
  GlobeHemisphereWest,
  Article,
  RocketLaunch,
  UsersThree,
  DotsThree,
} from "@phosphor-icons/react";
import { SelectableCard } from "../components";
import type { OnboardingData } from "../types";
import { USE_CASE_OPTIONS } from "../types";

interface UseCaseStepProps {
  data: Pick<OnboardingData, "useCase">;
  onChange: (data: Pick<OnboardingData, "useCase">) => void;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  GlobeHemisphereWest: <GlobeHemisphereWest size={24} />,
  Article: <Article size={24} />,
  RocketLaunch: <RocketLaunch size={24} />,
  UsersThree: <UsersThree size={24} />,
  DotsThree: <DotsThree size={24} />,
};

export function UseCaseStep({ data, onChange }: UseCaseStepProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {USE_CASE_OPTIONS.map((option, idx) => (
        <div
          key={option.value}
          className={idx === USE_CASE_OPTIONS.length - 1 ? "sm:col-span-2" : ""}
        >
          <SelectableCard
            selected={data.useCase === option.value}
            onClick={() => onChange({ useCase: option.value })}
            icon={ICON_MAP[option.icon]}
            title={option.label}
            description={option.description}
          />
        </div>
      ))}
    </div>
  );
}
