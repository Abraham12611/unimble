/**
 * Agent Runtime — Agent Communication Protocol
 *
 * Defines the message protocol for inter-agent communication:
 * - Typed messages (review requests, delegation, escalation, responses)
 * - Message routing between agents
 * - Response handling with timeouts
 * - Message history tracking
 *
 * This module is pure (no DB access). Agents exchange messages
 * through the Lead Agent's orchestration loop — there is no
 * separate message bus. The protocol defines the shape of
 * messages that flow between agents during multi-agent execution.
 *
 * Phase 7.6.3 — Agent Communication
 */

// ---------------------------------------------------------------------------
// Message Types
// ---------------------------------------------------------------------------

/** Priority levels for inter-agent messages. */
export type MessagePriority = "low" | "normal" | "high" | "urgent";

/** Types of messages agents can exchange. */
export type MessageType =
  | "task_delegation"
  | "review_request"
  | "review_response"
  | "escalation"
  | "status_update"
  | "feedback"
  | "information_request"
  | "information_response";

/**
 * A message sent between agents.
 */
export interface AgentCommunicationMessage {
  /** Unique message ID */
  id: string;
  /** Sender agent ID */
  from: string;
  /** Recipient agent ID */
  to: string;
  /** Message type */
  type: MessageType;
  /** Priority level */
  priority: MessagePriority;
  /** Message payload (type-specific) */
  payload: MessagePayload;
  /** ID of the message this is replying to (if any) */
  inReplyTo?: string;
  /** Timestamp when the message was created */
  timestamp: number;
  /** Deadline for response (optional) */
  deadline?: number;
  /** Metadata for tracing/logging */
  metadata?: Record<string, unknown>;
}

/** Union of all possible message payloads. */
export type MessagePayload =
  | TaskDelegationPayload
  | ReviewRequestPayload
  | ReviewResponsePayload
  | EscalationPayload
  | StatusUpdatePayload
  | FeedbackPayload
  | InformationRequestPayload
  | InformationResponsePayload;

// ---------------------------------------------------------------------------
// Payload Types
// ---------------------------------------------------------------------------

/** Payload for delegating a task to another agent. */
export interface TaskDelegationPayload {
  kind: "task_delegation";
  /** Description of the task to perform */
  task: string;
  /** Expected output format */
  expectedOutput?: string;
  /** Context/input data for the task */
  context?: Record<string, unknown>;
  /** Constraints or requirements */
  constraints?: string[];
}

/** Payload for requesting a review of content. */
export interface ReviewRequestPayload {
  kind: "review_request";
  /** The content to review */
  content: string;
  /** Type of content (blog_post, code, documentation, etc.) */
  contentType: string;
  /** What aspects to focus the review on */
  reviewFocus?: string[];
  /** Target audience for the content */
  targetAudience?: string;
  /** Word count target (if applicable) */
  wordCountTarget?: number;
  /** Keywords to check for (if applicable) */
  keywords?: string[];
}

/** Payload for a review response. */
export interface ReviewResponsePayload {
  kind: "review_response";
  /** Overall verdict */
  verdict: "approve" | "revise" | "reject";
  /** Overall score (0-10) */
  overallScore: number;
  /** Scores by category */
  scores: Record<string, number>;
  /** Issues found */
  issues: ReviewIssue[];
  /** Revision instructions (if verdict is "revise") */
  revisionInstructions?: string;
}

/** A single issue found during review. */
export interface ReviewIssue {
  /** Severity of the issue */
  severity: "must_fix" | "should_fix" | "consider";
  /** Category (technical, editorial, factual, seo) */
  category: string;
  /** Description of the issue */
  description: string;
  /** Suggested fix */
  suggestion?: string;
  /** Location in the content (if applicable) */
  location?: string;
}

/** Payload for escalating an issue to the Lead Agent or human. */
export interface EscalationPayload {
  kind: "escalation";
  /** Reason for escalation */
  reason: string;
  /** Context about what was being attempted */
  context: string;
  /** Options for resolution (if any) */
  options?: string[];
  /** Whether human input is required */
  requiresHuman: boolean;
}

/** Payload for status updates between agents. */
export interface StatusUpdatePayload {
  kind: "status_update";
  /** Current status */
  status: "started" | "in_progress" | "blocked" | "completed" | "failed";
  /** Progress percentage (0-100) */
  progress?: number;
  /** Description of current state */
  description: string;
  /** Partial output (if available) */
  partialOutput?: string;
}

/** Payload for providing feedback on completed work. */
export interface FeedbackPayload {
  kind: "feedback";
  /** What the feedback is about */
  subject: string;
  /** The feedback content */
  content: string;
  /** Rating (1-5) */
  rating?: number;
  /** Whether this should be stored in memory */
  storeInMemory?: boolean;
}

/** Payload for requesting information from another agent. */
export interface InformationRequestPayload {
  kind: "information_request";
  /** What information is needed */
  question: string;
  /** Context for the question */
  context?: string;
  /** Preferred format for the response */
  preferredFormat?: "text" | "json" | "list";
}

/** Payload for responding to an information request. */
export interface InformationResponsePayload {
  kind: "information_response";
  /** The answer */
  answer: string;
  /** Confidence level (0-1) */
  confidence?: number;
  /** Sources used */
  sources?: string[];
}

// ---------------------------------------------------------------------------
// Message Router
// ---------------------------------------------------------------------------

/**
 * Routes messages between agents during multi-agent execution.
 *
 * The router maintains a message history and provides utilities
 * for sending, receiving, and tracking messages. It does NOT
 * handle actual agent execution — that's the Lead Agent's job.
 */
export class MessageRouter {
  private messages: AgentCommunicationMessage[] = [];
  private messageCounter = 0;

  /**
   * Creates a new message and adds it to the history.
   */
  send(
    from: string,
    to: string,
    type: MessageType,
    payload: MessagePayload,
    options?: {
      priority?: MessagePriority;
      inReplyTo?: string;
      deadline?: number;
      metadata?: Record<string, unknown>;
    }
  ): AgentCommunicationMessage {
    const message: AgentCommunicationMessage = {
      id: `msg_${++this.messageCounter}_${Date.now()}`,
      from,
      to,
      type,
      priority: options?.priority ?? "normal",
      payload,
      inReplyTo: options?.inReplyTo,
      timestamp: Date.now(),
      deadline: options?.deadline,
      metadata: options?.metadata,
    };

    this.messages.push(message);
    return message;
  }

  /**
   * Gets all messages sent to a specific agent.
   */
  getMessagesFor(agentId: string): AgentCommunicationMessage[] {
    return this.messages.filter((m) => m.to === agentId);
  }

  /**
   * Gets all messages sent by a specific agent.
   */
  getMessagesFrom(agentId: string): AgentCommunicationMessage[] {
    return this.messages.filter((m) => m.from === agentId);
  }

  /**
   * Gets the response to a specific message (if any).
   */
  getResponse(messageId: string): AgentCommunicationMessage | undefined {
    return this.messages.find((m) => m.inReplyTo === messageId);
  }

  /**
   * Gets all messages in the conversation thread starting from a message.
   */
  getThread(messageId: string): AgentCommunicationMessage[] {
    const thread: AgentCommunicationMessage[] = [];
    const root = this.messages.find((m) => m.id === messageId);
    if (!root) return thread;

    thread.push(root);

    // Find all replies in the chain
    let currentId = messageId;
    let reply = this.getResponse(currentId);
    while (reply) {
      thread.push(reply);
      currentId = reply.id;
      reply = this.getResponse(currentId);
    }

    return thread;
  }

  /**
   * Gets messages that have exceeded their deadline without a response.
   */
  getTimedOutMessages(now: number = Date.now()): AgentCommunicationMessage[] {
    return this.messages.filter((m) => {
      if (!m.deadline) return false;
      if (m.deadline > now) return false;
      // Check if there's a response
      return !this.getResponse(m.id);
    });
  }

  /**
   * Gets pending messages (no response yet, not timed out).
   */
  getPendingMessages(agentId?: string): AgentCommunicationMessage[] {
    const now = Date.now();
    return this.messages.filter((m) => {
      if (agentId && m.to !== agentId) return false;
      if (this.getResponse(m.id)) return false;
      if (m.deadline && m.deadline < now) return false;
      // Only messages that expect a response
      return (
        m.type === "task_delegation" ||
        m.type === "review_request" ||
        m.type === "information_request" ||
        m.type === "escalation"
      );
    });
  }

  /**
   * Returns the full message history.
   */
  getHistory(): AgentCommunicationMessage[] {
    return [...this.messages];
  }

  /**
   * Returns message count for a specific agent (sent + received).
   */
  getMessageCount(agentId: string): { sent: number; received: number } {
    return {
      sent: this.messages.filter((m) => m.from === agentId).length,
      received: this.messages.filter((m) => m.to === agentId).length,
    };
  }

  /**
   * Clears all messages (for testing or reset).
   */
  clear(): void {
    this.messages = [];
    this.messageCounter = 0;
  }
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Creates a task delegation message payload.
 */
export function createTaskDelegation(
  task: string,
  options?: {
    expectedOutput?: string;
    context?: Record<string, unknown>;
    constraints?: string[];
  }
): TaskDelegationPayload {
  return {
    kind: "task_delegation",
    task,
    expectedOutput: options?.expectedOutput,
    context: options?.context,
    constraints: options?.constraints,
  };
}

/**
 * Creates a review request message payload.
 */
export function createReviewRequest(
  content: string,
  contentType: string,
  options?: {
    reviewFocus?: string[];
    targetAudience?: string;
    wordCountTarget?: number;
    keywords?: string[];
  }
): ReviewRequestPayload {
  return {
    kind: "review_request",
    content,
    contentType,
    reviewFocus: options?.reviewFocus,
    targetAudience: options?.targetAudience,
    wordCountTarget: options?.wordCountTarget,
    keywords: options?.keywords,
  };
}

/**
 * Creates a review response message payload.
 */
export function createReviewResponse(
  verdict: "approve" | "revise" | "reject",
  overallScore: number,
  scores: Record<string, number>,
  issues: ReviewIssue[],
  revisionInstructions?: string
): ReviewResponsePayload {
  return {
    kind: "review_response",
    verdict,
    overallScore,
    scores,
    issues,
    revisionInstructions,
  };
}

/**
 * Creates an escalation message payload.
 */
export function createEscalation(
  reason: string,
  context: string,
  options?: { options?: string[]; requiresHuman?: boolean }
): EscalationPayload {
  return {
    kind: "escalation",
    reason,
    context,
    options: options?.options,
    requiresHuman: options?.requiresHuman ?? false,
  };
}

/**
 * Formats a message for inclusion in an agent's prompt context.
 * Converts the structured message into a readable string.
 */
export function formatMessageForPrompt(message: AgentCommunicationMessage): string {
  const header = `[${message.type}] From: ${message.from} | Priority: ${message.priority}`;
  const payload = message.payload;

  switch (payload.kind) {
    case "task_delegation":
      return `${header}\nTask: ${payload.task}${payload.constraints ? "\nConstraints: " + payload.constraints.join(", ") : ""}`;
    case "review_request":
      return `${header}\nContent Type: ${payload.contentType}\nContent:\n${payload.content.slice(0, 500)}${payload.content.length > 500 ? "..." : ""}`;
    case "review_response":
      return `${header}\nVerdict: ${payload.verdict} (Score: ${payload.overallScore}/10)\nIssues: ${payload.issues.length}${payload.revisionInstructions ? "\nInstructions: " + payload.revisionInstructions : ""}`;
    case "escalation":
      return `${header}\nReason: ${payload.reason}\nContext: ${payload.context}${payload.requiresHuman ? "\n⚠️ Requires human input" : ""}`;
    case "status_update":
      return `${header}\nStatus: ${payload.status}${payload.progress !== undefined ? ` (${payload.progress}%)` : ""}\n${payload.description}`;
    case "feedback":
      return `${header}\nSubject: ${payload.subject}\n${payload.content}`;
    case "information_request":
      return `${header}\nQuestion: ${payload.question}`;
    case "information_response":
      return `${header}\nAnswer: ${payload.answer}${payload.confidence !== undefined ? ` (confidence: ${(payload.confidence * 100).toFixed(0)}%)` : ""}`;
  }
}
