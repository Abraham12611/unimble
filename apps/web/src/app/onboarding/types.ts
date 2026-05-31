export type CompanySize = "1-10" | "11-50" | "51-200" | "201-500" | "500+";

export type UseCase = "DevRel" | "Content" | "GTM" | "Community" | "Other";

export type OnboardingRole = "founder" | "marketing" | "content" | "engineering";

export type IntegrationService = "slack" | "discord" | "notion" | "github" | "x" | "linkedin";

export type OperatorTemplate =
  | "content_writer"
  | "community_moderator"
  | "growth_experiment_runner"
  | "documentation_agent"
  | "social_media_scheduler"
  | "launch_coordinator";

export type IntegrationConnection = {
  service: IntegrationService;
  connected: boolean;
  connectedAccountId?: string;
  connecting?: boolean;
};

export type StepKey =
  | "profile"
  | "company"
  | "useCase"
  | "integrations"
  | "operators"
  | "workspace"
  | "invite";

export type OnboardingData = {
  fullName: string;
  avatarUrl: string;
  role: OnboardingRole | "";
  companyName: string;
  companySize: CompanySize;
  useCase: UseCase;
  workspaceName: string;
  integrations: IntegrationConnection[];
  operatorTemplates: OperatorTemplate[];
  inviteEmails: string;
};

export type StepDef = {
  key: StepKey;
  title: string;
  optional: boolean;
};

export const ONBOARDING_STEPS: StepDef[] = [
  { key: "profile", title: "Profile", optional: false },
  { key: "company", title: "Company", optional: false },
  { key: "useCase", title: "Use case", optional: false },
  { key: "integrations", title: "Integrations", optional: true },
  { key: "operators", title: "Operators", optional: false },
  { key: "workspace", title: "Workspace", optional: false },
  { key: "invite", title: "Invite team", optional: true },
];

export const ROLE_OPTIONS: {
  value: OnboardingRole;
  icon: string;
  label: string;
  description: string;
}[] = [
  {
    value: "founder",
    icon: "Crown",
    label: "Founder",
    description: "You're building the company",
  },
  {
    value: "marketing",
    icon: "ChartBar",
    label: "Marketing / GTM",
    description: "Growth, campaigns, launches",
  },
  {
    value: "content",
    icon: "PenNib",
    label: "Content / DevRel",
    description: "Docs, blog, community",
  },
  {
    value: "engineering",
    icon: "Code",
    label: "Engineering",
    description: "Building products and infra",
  },
];

export const USE_CASE_OPTIONS: {
  value: UseCase;
  icon: string;
  label: string;
  description: string;
}[] = [
  {
    value: "DevRel",
    icon: "GlobeHemisphereWest",
    label: "DevRel",
    description: "Community, docs, advocacy, developer education.",
  },
  {
    value: "Content",
    icon: "Article",
    label: "Content",
    description: "Blog posts, newsletters, social, SEO.",
  },
  {
    value: "GTM",
    icon: "RocketLaunch",
    label: "GTM",
    description: "Launches, campaigns, growth experiments.",
  },
  {
    value: "Community",
    icon: "UsersThree",
    label: "Community",
    description: "Events, forums, moderation and engagement.",
  },
  {
    value: "Other",
    icon: "DotsThree",
    label: "Other",
    description: "We'll still tailor defaults based on your inputs.",
  },
];

export const OPERATOR_TEMPLATES: {
  value: OperatorTemplate;
  label: string;
  description: string;
  useCases: UseCase[];
}[] = [
  {
    value: "content_writer",
    label: "Content Writer",
    description: "Auto-generates blog posts, threads, and newsletters.",
    useCases: ["Content", "Other"],
  },
  {
    value: "community_moderator",
    label: "Community Moderator",
    description: "Monitors Discord/Slack and auto-responds to common questions.",
    useCases: ["Community", "DevRel"],
  },
  {
    value: "growth_experiment_runner",
    label: "Growth Experiment Runner",
    description: "Sets up A/B tests, tracks metrics, and generates launch copy.",
    useCases: ["GTM"],
  },
  {
    value: "documentation_agent",
    label: "Documentation Agent",
    description: "Updates docs from PRs and answers developer questions.",
    useCases: ["DevRel"],
  },
  {
    value: "social_media_scheduler",
    label: "Social Media Scheduler",
    description: "Plans and posts across platforms with optimal timing.",
    useCases: ["Content", "GTM"],
  },
  {
    value: "launch_coordinator",
    label: "Launch Coordinator",
    description: "Manages launch checklists and cross-team communications.",
    useCases: ["GTM", "DevRel"],
  },
];

export const INTEGRATION_SERVICES: {
  value: IntegrationService;
  label: string;
  icon: string;
}[] = [
  { value: "slack", label: "Slack", icon: "ChatTeardropText" },
  { value: "discord", label: "Discord", icon: "DiscordLogo" },
  { value: "notion", label: "Notion", icon: "Notepad" },
  { value: "github", label: "GitHub", icon: "GithubLogo" },
  { value: "x", label: "X / Twitter", icon: "XLogo" },
  { value: "linkedin", label: "LinkedIn", icon: "LinkedinLogo" },
];

export function getDefaultUseCase(role: OnboardingRole | ""): UseCase {
  switch (role) {
    case "engineering":
      return "DevRel";
    case "marketing":
      return "GTM";
    case "content":
      return "Content";
    case "founder":
      return "GTM";
    default:
      return "Other";
  }
}

export function getDefaultOperators(useCase: UseCase): OperatorTemplate[] {
  const map: Record<UseCase, OperatorTemplate[]> = {
    DevRel: ["documentation_agent", "community_moderator"],
    Content: ["content_writer", "social_media_scheduler"],
    GTM: ["growth_experiment_runner", "launch_coordinator"],
    Community: ["community_moderator"],
    Other: ["content_writer"],
  };
  return map[useCase] || ["content_writer"];
}
