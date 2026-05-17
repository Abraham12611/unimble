/**
 * Agent Runtime — Agent Personas
 *
 * Provides persona configuration for agents:
 * - Voice, tone, and style settings
 * - Expertise areas and personality traits
 * - Persona-aware prompt building
 * - Persona memory integration
 *
 * A persona gives an agent a consistent identity across interactions.
 * The Lead Agent and Writer Agents use personas to maintain voice
 * consistency. Reviewer Agents may use personas for review style.
 *
 * This module is pure (no DB access). Persona definitions are stored
 * in Convex and loaded into agent context at execution time.
 *
 * Phase 7.6.4 — Agent Personas
 */

import { renderPrompt } from "./promptManager";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Persona identity — who the agent "is". */
export interface PersonaIdentity {
  /** Display name */
  name: string;
  /** Short tagline */
  tagline?: string;
  /** Bio/background description */
  bio?: string;
  /** Avatar URL (optional) */
  avatar?: string;
}

/** Voice and tone configuration. */
export interface PersonaVoice {
  /** Overall tone (e.g., "Technical but approachable") */
  tone: string;
  /** Formality level */
  formality: "casual" | "casual_professional" | "professional" | "formal";
  /** Humor style (e.g., "Occasional dry wit", "None") */
  humor?: string;
  /** Perspective (e.g., "First person", "Second person for tutorials") */
  perspective?: string;
}

/** Writing style preferences. */
export interface PersonaStyle {
  /** Preferred sentence length */
  sentenceLength?: "short" | "varied" | "long";
  /** Max paragraph length (sentences) */
  maxParagraphSentences?: number;
  /** Whether to include code examples */
  codeExamples?: "always" | "when_relevant" | "rarely" | "never";
  /** Whether to use analogies */
  analogies?: boolean;
  /** Content structure pattern */
  structurePattern?: string;
  /** Additional style notes */
  notes?: string[];
}

/** Expertise configuration. */
export interface PersonaExpertise {
  /** Primary expertise areas */
  primary: string[];
  /** Secondary expertise areas */
  secondary?: string[];
  /** Areas currently learning */
  learning?: string[];
}

/** Personality traits. */
export interface PersonaPersonality {
  /** Core personality traits */
  traits: string[];
  /** Things the persona dislikes */
  petPeeves?: string[];
  /** Core values */
  values?: string[];
}

/**
 * Full persona definition.
 */
export interface Persona {
  /** Unique persona ID */
  id: string;
  /** Identity information */
  identity: PersonaIdentity;
  /** Voice and tone */
  voice: PersonaVoice;
  /** Writing style */
  style: PersonaStyle;
  /** Expertise areas */
  expertise: PersonaExpertise;
  /** Personality traits */
  personality: PersonaPersonality;
  /** Version for tracking changes */
  version: string;
  /** When this persona was created */
  createdAt?: number;
  /** When this persona was last updated */
  updatedAt?: number;
}

/** Persona memory — learned preferences and history. */
export interface PersonaMemory {
  /** Persona ID this memory belongs to */
  personaId: string;
  /** Learned style preferences */
  learnedPreferences: string[];
  /** Audience feedback (positive) */
  positiveFeedback: string[];
  /** Audience feedback (negative) */
  negativeFeedback: string[];
  /** Style refinements made over time */
  styleRefinements: string[];
}

// ---------------------------------------------------------------------------
// Persona Prompt Builder
// ---------------------------------------------------------------------------

/**
 * Builds a system prompt section from a persona definition.
 * This is injected into the agent's system prompt to give it
 * a consistent voice and identity.
 */
export function buildPersonaPrompt(persona: Persona): string {
  const sections: string[] = [];

  // Identity
  sections.push(`## Your Identity
You are ${persona.identity.name}${persona.identity.tagline ? `, ${persona.identity.tagline}` : ""}.`);

  if (persona.identity.bio) {
    sections.push(persona.identity.bio);
  }

  // Voice
  sections.push(`## Voice & Tone
- Tone: ${persona.voice.tone}
- Formality: ${formatFormality(persona.voice.formality)}${persona.voice.humor ? `\n- Humor: ${persona.voice.humor}` : ""}${persona.voice.perspective ? `\n- Perspective: ${persona.voice.perspective}` : ""}`);

  // Style
  if (persona.style) {
    const styleLines: string[] = [];
    if (persona.style.sentenceLength) {
      styleLines.push(`- Sentence length: ${persona.style.sentenceLength}`);
    }
    if (persona.style.maxParagraphSentences) {
      styleLines.push(`- Max paragraph length: ${persona.style.maxParagraphSentences} sentences`);
    }
    if (persona.style.codeExamples) {
      styleLines.push(`- Code examples: ${persona.style.codeExamples}`);
    }
    if (persona.style.analogies !== undefined) {
      styleLines.push(
        `- Analogies: ${persona.style.analogies ? "Use real-world comparisons" : "Avoid analogies"}`
      );
    }
    if (persona.style.structurePattern) {
      styleLines.push(`- Structure: ${persona.style.structurePattern}`);
    }
    if (persona.style.notes && persona.style.notes.length > 0) {
      for (const note of persona.style.notes) {
        styleLines.push(`- ${note}`);
      }
    }
    if (styleLines.length > 0) {
      sections.push(`## Writing Style\n${styleLines.join("\n")}`);
    }
  }

  // Expertise
  sections.push(
    `## Expertise\n- Primary: ${persona.expertise.primary.join(", ")}${persona.expertise.secondary ? `\n- Secondary: ${persona.expertise.secondary.join(", ")}` : ""}${persona.expertise.learning ? `\n- Currently learning: ${persona.expertise.learning.join(", ")}` : ""}`
  );

  // Personality
  if (persona.personality.traits.length > 0) {
    let personalitySection = `## Personality\n- Traits: ${persona.personality.traits.join(", ")}`;
    if (persona.personality.petPeeves && persona.personality.petPeeves.length > 0) {
      personalitySection += `\n- Dislikes: ${persona.personality.petPeeves.join(", ")}`;
    }
    if (persona.personality.values && persona.personality.values.length > 0) {
      personalitySection += `\n- Values: ${persona.personality.values.join(", ")}`;
    }
    sections.push(personalitySection);
  }

  return sections.join("\n\n");
}

/**
 * Builds a system prompt that combines a base prompt template
 * with persona information and optional memory context.
 */
export function buildPersonaAwarePrompt(
  basePromptTemplate: string,
  persona: Persona,
  variables?: Record<string, unknown>,
  memory?: PersonaMemory
): string {
  // Render the base template with variables
  const rendered = renderPrompt(basePromptTemplate, {
    ...variables,
    personaName: persona.identity.name,
    personaTagline: persona.identity.tagline,
    personaTone: persona.voice.tone,
    personaExpertise: persona.expertise.primary.join(", "),
  });

  // Build the full prompt
  const parts: string[] = [];

  // Base prompt
  parts.push(rendered.text);

  // Persona section
  parts.push(buildPersonaPrompt(persona));

  // Memory section (learned preferences)
  if (memory) {
    const memoryLines: string[] = [];

    if (memory.learnedPreferences.length > 0) {
      memoryLines.push("## Learned Preferences");
      for (const pref of memory.learnedPreferences) {
        memoryLines.push(`- ${pref}`);
      }
    }

    if (memory.styleRefinements.length > 0) {
      memoryLines.push("\n## Style Refinements");
      for (const ref of memory.styleRefinements) {
        memoryLines.push(`- ${ref}`);
      }
    }

    if (memory.positiveFeedback.length > 0) {
      memoryLines.push("\n## What Works Well (audience feedback)");
      for (const fb of memory.positiveFeedback.slice(0, 5)) {
        memoryLines.push(`- ${fb}`);
      }
    }

    if (memory.negativeFeedback.length > 0) {
      memoryLines.push("\n## Areas to Improve (audience feedback)");
      for (const fb of memory.negativeFeedback.slice(0, 5)) {
        memoryLines.push(`- ${fb}`);
      }
    }

    if (memoryLines.length > 0) {
      parts.push(memoryLines.join("\n"));
    }
  }

  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Persona Validation
// ---------------------------------------------------------------------------

/** Validation error for persona definitions. */
export interface PersonaValidationError {
  field: string;
  message: string;
}

/**
 * Validates a persona definition for completeness and correctness.
 */
export function validatePersona(persona: Partial<Persona>): PersonaValidationError[] {
  const errors: PersonaValidationError[] = [];

  if (!persona.id || persona.id.trim().length === 0) {
    errors.push({ field: "id", message: "Persona ID is required" });
  }

  if (!persona.identity?.name || persona.identity.name.trim().length === 0) {
    errors.push({ field: "identity.name", message: "Persona name is required" });
  }

  if (!persona.voice?.tone || persona.voice.tone.trim().length === 0) {
    errors.push({ field: "voice.tone", message: "Voice tone is required" });
  }

  if (!persona.voice?.formality) {
    errors.push({ field: "voice.formality", message: "Formality level is required" });
  }

  if (!persona.expertise?.primary || persona.expertise.primary.length === 0) {
    errors.push({
      field: "expertise.primary",
      message: "At least one primary expertise area is required",
    });
  }

  if (!persona.personality?.traits || persona.personality.traits.length === 0) {
    errors.push({
      field: "personality.traits",
      message: "At least one personality trait is required",
    });
  }

  if (!persona.version) {
    errors.push({ field: "version", message: "Version is required" });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Pre-built Personas
// ---------------------------------------------------------------------------

/**
 * Default personas for common agent roles.
 * These can be customized per workspace.
 */
export const DEFAULT_PERSONAS: Record<string, Persona> = {
  "technical-writer": {
    id: "persona_technical_writer",
    identity: {
      name: "Alex",
      tagline: "Technical content specialist",
      bio: "Alex is a developer advocate with deep experience in mobile development and subscription monetization. They believe in practical, code-first tutorials that respect developers' time.",
    },
    voice: {
      tone: "Technical but approachable",
      formality: "casual_professional",
      humor: "Occasional dry wit",
      perspective: "First person when sharing experience, second person for tutorials",
    },
    style: {
      sentenceLength: "varied",
      maxParagraphSentences: 4,
      codeExamples: "always",
      analogies: true,
      structurePattern: "Problem → Solution → Implementation → Gotchas",
      notes: ["Lead with working examples", "Avoid jargon without explanation"],
    },
    expertise: {
      primary: ["mobile development", "subscription monetization", "developer education"],
      secondary: ["React Native", "Flutter", "mobile analytics"],
      learning: ["AI/ML in mobile", "privacy-first monetization"],
    },
    personality: {
      traits: ["Pragmatic", "Detail-oriented", "Empathetic to beginners"],
      petPeeves: ["Unnecessary complexity", "Outdated documentation"],
      values: ["Developer experience", "Working code over theory"],
    },
    version: "1.0.0",
  },

  "growth-marketer": {
    id: "persona_growth_marketer",
    identity: {
      name: "Sam",
      tagline: "Data-driven growth specialist",
      bio: "Sam is a growth marketer who lives and breathes metrics. They design experiments with clear hypotheses and measure everything.",
    },
    voice: {
      tone: "Confident and data-driven",
      formality: "casual_professional",
      humor: "Witty observations about marketing trends",
      perspective: "First person plural (we) for team context",
    },
    style: {
      sentenceLength: "short",
      maxParagraphSentences: 3,
      codeExamples: "when_relevant",
      analogies: true,
      structurePattern: "Hypothesis → Experiment → Results → Learnings",
    },
    expertise: {
      primary: ["growth marketing", "A/B testing", "developer marketing"],
      secondary: ["SEO", "content distribution", "community growth"],
      learning: ["AI-powered marketing", "programmatic SEO"],
    },
    personality: {
      traits: ["Analytical", "Experimental", "Results-oriented"],
      petPeeves: ["Vanity metrics", "Untested assumptions"],
      values: ["Data over opinions", "High-impact low-effort"],
    },
    version: "1.0.0",
  },

  "community-manager": {
    id: "persona_community_manager",
    identity: {
      name: "Jordan",
      tagline: "Developer community advocate",
      bio: "Jordan genuinely cares about developers and their success. They build relationships, not just engagement metrics.",
    },
    voice: {
      tone: "Warm, helpful, and knowledgeable",
      formality: "casual",
      humor: "Friendly and relatable",
      perspective: "First person, conversational",
    },
    style: {
      sentenceLength: "short",
      maxParagraphSentences: 3,
      codeExamples: "when_relevant",
      analogies: false,
      structurePattern: "Acknowledge → Help → Follow-up",
    },
    expertise: {
      primary: ["community management", "developer support", "technical communication"],
      secondary: ["Discord moderation", "GitHub triage", "social media"],
    },
    personality: {
      traits: ["Empathetic", "Patient", "Proactive"],
      petPeeves: ["Dismissive responses", "Ignoring feedback"],
      values: ["Every question matters", "Build trust through consistency"],
    },
    version: "1.0.0",
  },
};

/**
 * Gets a default persona by role key.
 */
export function getDefaultPersona(role: string): Persona | undefined {
  return DEFAULT_PERSONAS[role];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFormality(level: PersonaVoice["formality"]): string {
  switch (level) {
    case "casual":
      return "Casual";
    case "casual_professional":
      return "Casual professional";
    case "professional":
      return "Professional";
    case "formal":
      return "Formal";
  }
}
