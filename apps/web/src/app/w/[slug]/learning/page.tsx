"use client";

import { PageHeader } from "@/components/layout";

export default function LearningPage() {
  return (
    <div>
      <PageHeader
        title="Learning"
        description="Trends, insights, and skills learned by your operators."
      />
      <div className="mt-12 flex flex-col items-center justify-center text-center">
        <div className="text-[15px] font-medium text-[var(--text-primary)]">Coming soon</div>
        <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
          This section is under development.
        </p>
      </div>
    </div>
  );
}
