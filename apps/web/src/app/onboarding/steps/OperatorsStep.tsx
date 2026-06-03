"use client";

import { Robot } from "@phosphor-icons/react";
import { MultiSelectCard } from "../components";
import type { OnboardingData, OperatorTemplate } from "../types";
import { OPERATOR_TEMPLATES } from "../types";

interface OperatorsStepProps {
  data: Pick<OnboardingData, "operatorTemplates">;
  onChange: (data: Pick<OnboardingData, "operatorTemplates">) => void;
}

export function OperatorsStep({ data, onChange }: OperatorsStepProps) {
  const toggleOperator = (template: OperatorTemplate) => {
    const exists = data.operatorTemplates.includes(template);
    if (exists) {
      onChange({
        operatorTemplates: data.operatorTemplates.filter((t) => t !== template),
      });
    } else if (data.operatorTemplates.length < 3) {
      onChange({
        operatorTemplates: [...data.operatorTemplates, template],
      });
    }
  };

  const selectedCount = data.operatorTemplates.length;

  return (
    <div className="space-y-4">
      {OPERATOR_TEMPLATES.map((op) => {
        const selected = data.operatorTemplates.includes(op.value);
        return (
          <MultiSelectCard
            key={op.value}
            selected={selected}
            onToggle={() => toggleOperator(op.value)}
            icon={<Robot size={24} />}
            title={op.label}
            description={op.description}
          />
        );
      })}

      <p className="text-[12px] text-[#888888]">
        {selectedCount} of 3 selected
        {selectedCount === 0 && (
          <span className="ml-1 text-[#EF4444]">Select at least 1 operator</span>
        )}
      </p>
    </div>
  );
}
