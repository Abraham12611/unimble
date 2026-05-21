/**
 * Shared Framer Motion animation variants for consistent animations.
 *
 * Easing curves from design system:
 * - default: cubic-bezier(0.16, 1, 0.3, 1)
 * - snap: cubic-bezier(0.4, 0, 0.2, 1)
 * - gentle: cubic-bezier(0.25, 0.46, 0.45, 0.94)
 *
 * Durations:
 * - fast: 120ms
 * - default: 200ms
 * - slow: 350ms
 * - enter: 400ms
 */

import type { Variants, Transition } from "framer-motion";

// ---------------------------------------------------------------------------
// Easing Curves
// ---------------------------------------------------------------------------

export const easing = {
  default: [0.16, 1, 0.3, 1] as const,
  snap: [0.4, 0, 0.2, 1] as const,
  gentle: [0.25, 0.46, 0.45, 0.94] as const,
};

// ---------------------------------------------------------------------------
// Durations (seconds)
// ---------------------------------------------------------------------------

export const duration = {
  fast: 0.12,
  default: 0.2,
  slow: 0.35,
  enter: 0.4,
};

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

export const transitions: Record<string, Transition> = {
  default: { duration: duration.default, ease: easing.default },
  fast: { duration: duration.fast, ease: easing.snap },
  slow: { duration: duration.slow, ease: easing.gentle },
  enter: { duration: duration.enter, ease: easing.default },
  spring: { type: "spring", stiffness: 300, damping: 30 },
};

// ---------------------------------------------------------------------------
// Fade Variants
// ---------------------------------------------------------------------------

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: transitions.default },
  exit: { opacity: 0, transition: transitions.fast },
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: transitions.enter },
  exit: { opacity: 0, y: -4, transition: transitions.fast },
};

export const fadeInDown: Variants = {
  hidden: { opacity: 0, y: -8 },
  visible: { opacity: 1, y: 0, transition: transitions.enter },
  exit: { opacity: 0, y: 4, transition: transitions.fast },
};

// ---------------------------------------------------------------------------
// Scale Variants
// ---------------------------------------------------------------------------

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: transitions.enter },
  exit: { opacity: 0, scale: 0.95, transition: transitions.fast },
};

// ---------------------------------------------------------------------------
// Slide Variants
// ---------------------------------------------------------------------------

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: transitions.enter },
  exit: { opacity: 0, x: -16, transition: transitions.fast },
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 16 },
  visible: { opacity: 1, x: 0, transition: transitions.enter },
  exit: { opacity: 0, x: 16, transition: transitions.fast },
};

// ---------------------------------------------------------------------------
// Stagger Container
// ---------------------------------------------------------------------------

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: transitions.default },
};

// ---------------------------------------------------------------------------
// Collapse / Expand
// ---------------------------------------------------------------------------

export const collapse: Variants = {
  open: { height: "auto", opacity: 1, transition: transitions.slow },
  closed: { height: 0, opacity: 0, overflow: "hidden", transition: transitions.default },
};

// ---------------------------------------------------------------------------
// Modal / Overlay
// ---------------------------------------------------------------------------

export const overlay: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: duration.default } },
  exit: { opacity: 0, transition: { duration: duration.fast } },
};

export const modal: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: transitions.enter },
  exit: { opacity: 0, scale: 0.96, y: 8, transition: transitions.fast },
};
