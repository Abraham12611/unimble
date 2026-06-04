/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent_agentBase from "../agent/agentBase.js";
import type * as agent_agentContext from "../agent/agentContext.js";
import type * as agent_agentLogger from "../agent/agentLogger.js";
import type * as agent_builtInTools from "../agent/builtInTools.js";
import type * as agent_communication from "../agent/communication.js";
import type * as agent_leadAgent from "../agent/leadAgent.js";
import type * as agent_llmClient from "../agent/llmClient.js";
import type * as agent_memory_index from "../agent/memory/index.js";
import type * as agent_memory_longTermMemory from "../agent/memory/longTermMemory.js";
import type * as agent_memory_memoryCategories from "../agent/memory/memoryCategories.js";
import type * as agent_memory_memoryInjector from "../agent/memory/memoryInjector.js";
import type * as agent_memory_shortTermMemory from "../agent/memory/shortTermMemory.js";
import type * as agent_personas from "../agent/personas.js";
import type * as agent_planExecuteAgent from "../agent/planExecuteAgent.js";
import type * as agent_promptManager from "../agent/promptManager.js";
import type * as agent_responseParser from "../agent/responseParser.js";
import type * as agent_reviewerAgent from "../agent/reviewerAgent.js";
import type * as agent_selfCorrection from "../agent/selfCorrection.js";
import type * as agent_toolRegistry from "../agent/toolRegistry.js";
import type * as agent_tracing from "../agent/tracing.js";
import type * as agent_types from "../agent/types.js";
import type * as argValidators from "../argValidators.js";
import type * as crons from "../crons.js";
import type * as engine_circuitBreaker from "../engine/circuitBreaker.js";
import type * as engine_deadLetterQueue from "../engine/deadLetterQueue.js";
import type * as engine_eventBus from "../engine/eventBus.js";
import type * as engine_expressionEvaluator from "../engine/expressionEvaluator.js";
import type * as engine_humanLoop from "../engine/humanLoop.js";
import type * as engine_manualTrigger from "../engine/manualTrigger.js";
import type * as engine_scheduler from "../engine/scheduler.js";
import type * as engine_stateMachine from "../engine/stateMachine.js";
import type * as engine_stepHandlers from "../engine/stepHandlers.js";
import type * as engine_stepRunner from "../engine/stepRunner.js";
import type * as engine_types from "../engine/types.js";
import type * as engine_webhookTrigger from "../engine/webhookTrigger.js";
import type * as executions from "../executions.js";
import type * as http from "../http.js";
import type * as integrationActions from "../integrationActions.js";
import type * as integrations from "../integrations.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_composio from "../lib/composio.js";
import type * as lib_integrationRegistry from "../lib/integrationRegistry.js";
import type * as lib_integrations_analytics from "../lib/integrations/analytics.js";
import type * as lib_integrations_cms from "../lib/integrations/cms.js";
import type * as lib_integrations_devplatform from "../lib/integrations/devplatform.js";
import type * as lib_integrations_firecrawl from "../lib/integrations/firecrawl.js";
import type * as lib_integrations_firehose from "../lib/integrations/firehose.js";
import type * as lib_integrations_index from "../lib/integrations/index.js";
import type * as lib_integrations_llm from "../lib/integrations/llm.js";
import type * as lib_integrations_perplexity from "../lib/integrations/perplexity.js";
import type * as lib_integrations_social from "../lib/integrations/social.js";
import type * as lib_integrations_tokenManager from "../lib/integrations/tokenManager.js";
import type * as lib_integrations_types from "../lib/integrations/types.js";
import type * as lib_integrations_utils from "../lib/integrations/utils.js";
import type * as onboarding from "../onboarding.js";
import type * as operators from "../operators.js";
import type * as operators_communityOperator from "../operators/communityOperator.js";
import type * as operators_community_engagementResponse from "../operators/community/engagementResponse.js";
import type * as operators_community_githubEngagement from "../operators/community/githubEngagement.js";
import type * as operators_community_index from "../operators/community/index.js";
import type * as operators_community_socialMonitoring from "../operators/community/socialMonitoring.js";
import type * as operators_contentOperator from "../operators/contentOperator.js";
import type * as operators_content_contentAnalytics from "../operators/content/contentAnalytics.js";
import type * as operators_content_contentGeneration from "../operators/content/contentGeneration.js";
import type * as operators_content_contentPublishing from "../operators/content/contentPublishing.js";
import type * as operators_content_contentReview from "../operators/content/contentReview.js";
import type * as operators_content_index from "../operators/content/index.js";
import type * as operators_content_topicResearch from "../operators/content/topicResearch.js";
import type * as operators_deployment from "../operators/deployment.js";
import type * as operators_documentationOperator from "../operators/documentationOperator.js";
import type * as operators_documentation_docAudit from "../operators/documentation/docAudit.js";
import type * as operators_documentation_docGeneration from "../operators/documentation/docGeneration.js";
import type * as operators_documentation_index from "../operators/documentation/index.js";
import type * as operators_feedbackOperator from "../operators/feedbackOperator.js";
import type * as operators_feedback_feedbackAnalysis from "../operators/feedback/feedbackAnalysis.js";
import type * as operators_feedback_feedbackCollection from "../operators/feedback/feedbackCollection.js";
import type * as operators_feedback_feedbackSynthesis from "../operators/feedback/feedbackSynthesis.js";
import type * as operators_feedback_index from "../operators/feedback/index.js";
import type * as operators_growthOperator from "../operators/growthOperator.js";
import type * as operators_growth_experimentAnalysis from "../operators/growth/experimentAnalysis.js";
import type * as operators_growth_experimentDesign from "../operators/growth/experimentDesign.js";
import type * as operators_growth_experimentExecution from "../operators/growth/experimentExecution.js";
import type * as operators_growth_index from "../operators/growth/index.js";
import type * as operators_growth_seoOptimization from "../operators/growth/seoOptimization.js";
import type * as operators_index from "../operators/index.js";
import type * as operators_operatorBase from "../operators/operatorBase.js";
import type * as operators_registry from "../operators/registry.js";
import type * as operators_types from "../operators/types.js";
import type * as organizations from "../organizations.js";
import type * as rbac from "../rbac.js";
import type * as subscriptions_executions from "../subscriptions/executions.js";
import type * as subscriptions_index from "../subscriptions/index.js";
import type * as subscriptions_operators from "../subscriptions/operators.js";
import type * as subscriptions_workflows from "../subscriptions/workflows.js";
import type * as subscriptions_workspaces from "../subscriptions/workspaces.js";
import type * as users from "../users.js";
import type * as validators_approval from "../validators/approval.js";
import type * as validators_circuitBreaker from "../validators/circuitBreaker.js";
import type * as validators_deadLetterQueue from "../validators/deadLetterQueue.js";
import type * as validators_escalation from "../validators/escalation.js";
import type * as validators_event from "../validators/event.js";
import type * as validators_execution from "../validators/execution.js";
import type * as validators_executionStep from "../validators/executionStep.js";
import type * as validators_index from "../validators/index.js";
import type * as validators_integration from "../validators/integration.js";
import type * as validators_learning from "../validators/learning.js";
import type * as validators_memory from "../validators/memory.js";
import type * as validators_notification from "../validators/notification.js";
import type * as validators_operator from "../validators/operator.js";
import type * as validators_organization from "../validators/organization.js";
import type * as validators_workflow from "../validators/workflow.js";
import type * as validators_workflowVersion from "../validators/workflowVersion.js";
import type * as validators_workspace from "../validators/workspace.js";
import type * as validators_workspaceInvite from "../validators/workspaceInvite.js";
import type * as webhooks from "../webhooks.js";
import type * as workflows from "../workflows.js";
import type * as workspaces from "../workspaces.js";

import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";

declare const fullApi: ApiFromModules<{
  "agent/agentBase": typeof agent_agentBase;
  "agent/agentContext": typeof agent_agentContext;
  "agent/agentLogger": typeof agent_agentLogger;
  "agent/builtInTools": typeof agent_builtInTools;
  "agent/communication": typeof agent_communication;
  "agent/leadAgent": typeof agent_leadAgent;
  "agent/llmClient": typeof agent_llmClient;
  "agent/memory/index": typeof agent_memory_index;
  "agent/memory/longTermMemory": typeof agent_memory_longTermMemory;
  "agent/memory/memoryCategories": typeof agent_memory_memoryCategories;
  "agent/memory/memoryInjector": typeof agent_memory_memoryInjector;
  "agent/memory/shortTermMemory": typeof agent_memory_shortTermMemory;
  "agent/personas": typeof agent_personas;
  "agent/planExecuteAgent": typeof agent_planExecuteAgent;
  "agent/promptManager": typeof agent_promptManager;
  "agent/responseParser": typeof agent_responseParser;
  "agent/reviewerAgent": typeof agent_reviewerAgent;
  "agent/selfCorrection": typeof agent_selfCorrection;
  "agent/toolRegistry": typeof agent_toolRegistry;
  "agent/tracing": typeof agent_tracing;
  "agent/types": typeof agent_types;
  argValidators: typeof argValidators;
  crons: typeof crons;
  "engine/circuitBreaker": typeof engine_circuitBreaker;
  "engine/deadLetterQueue": typeof engine_deadLetterQueue;
  "engine/eventBus": typeof engine_eventBus;
  "engine/expressionEvaluator": typeof engine_expressionEvaluator;
  "engine/humanLoop": typeof engine_humanLoop;
  "engine/manualTrigger": typeof engine_manualTrigger;
  "engine/scheduler": typeof engine_scheduler;
  "engine/stateMachine": typeof engine_stateMachine;
  "engine/stepHandlers": typeof engine_stepHandlers;
  "engine/stepRunner": typeof engine_stepRunner;
  "engine/types": typeof engine_types;
  "engine/webhookTrigger": typeof engine_webhookTrigger;
  executions: typeof executions;
  http: typeof http;
  integrationActions: typeof integrationActions;
  integrations: typeof integrations;
  "lib/auth": typeof lib_auth;
  "lib/composio": typeof lib_composio;
  "lib/integrationRegistry": typeof lib_integrationRegistry;
  "lib/integrations/analytics": typeof lib_integrations_analytics;
  "lib/integrations/cms": typeof lib_integrations_cms;
  "lib/integrations/devplatform": typeof lib_integrations_devplatform;
  "lib/integrations/firecrawl": typeof lib_integrations_firecrawl;
  "lib/integrations/firehose": typeof lib_integrations_firehose;
  "lib/integrations/index": typeof lib_integrations_index;
  "lib/integrations/llm": typeof lib_integrations_llm;
  "lib/integrations/perplexity": typeof lib_integrations_perplexity;
  "lib/integrations/social": typeof lib_integrations_social;
  "lib/integrations/tokenManager": typeof lib_integrations_tokenManager;
  "lib/integrations/types": typeof lib_integrations_types;
  "lib/integrations/utils": typeof lib_integrations_utils;
  onboarding: typeof onboarding;
  operators: typeof operators;
  "operators/communityOperator": typeof operators_communityOperator;
  "operators/community/engagementResponse": typeof operators_community_engagementResponse;
  "operators/community/githubEngagement": typeof operators_community_githubEngagement;
  "operators/community/index": typeof operators_community_index;
  "operators/community/socialMonitoring": typeof operators_community_socialMonitoring;
  "operators/contentOperator": typeof operators_contentOperator;
  "operators/content/contentAnalytics": typeof operators_content_contentAnalytics;
  "operators/content/contentGeneration": typeof operators_content_contentGeneration;
  "operators/content/contentPublishing": typeof operators_content_contentPublishing;
  "operators/content/contentReview": typeof operators_content_contentReview;
  "operators/content/index": typeof operators_content_index;
  "operators/content/topicResearch": typeof operators_content_topicResearch;
  "operators/deployment": typeof operators_deployment;
  "operators/documentationOperator": typeof operators_documentationOperator;
  "operators/documentation/docAudit": typeof operators_documentation_docAudit;
  "operators/documentation/docGeneration": typeof operators_documentation_docGeneration;
  "operators/documentation/index": typeof operators_documentation_index;
  "operators/feedbackOperator": typeof operators_feedbackOperator;
  "operators/feedback/feedbackAnalysis": typeof operators_feedback_feedbackAnalysis;
  "operators/feedback/feedbackCollection": typeof operators_feedback_feedbackCollection;
  "operators/feedback/feedbackSynthesis": typeof operators_feedback_feedbackSynthesis;
  "operators/feedback/index": typeof operators_feedback_index;
  "operators/growthOperator": typeof operators_growthOperator;
  "operators/growth/experimentAnalysis": typeof operators_growth_experimentAnalysis;
  "operators/growth/experimentDesign": typeof operators_growth_experimentDesign;
  "operators/growth/experimentExecution": typeof operators_growth_experimentExecution;
  "operators/growth/index": typeof operators_growth_index;
  "operators/growth/seoOptimization": typeof operators_growth_seoOptimization;
  "operators/index": typeof operators_index;
  "operators/operatorBase": typeof operators_operatorBase;
  "operators/registry": typeof operators_registry;
  "operators/types": typeof operators_types;
  organizations: typeof organizations;
  rbac: typeof rbac;
  "subscriptions/executions": typeof subscriptions_executions;
  "subscriptions/index": typeof subscriptions_index;
  "subscriptions/operators": typeof subscriptions_operators;
  "subscriptions/workflows": typeof subscriptions_workflows;
  "subscriptions/workspaces": typeof subscriptions_workspaces;
  users: typeof users;
  "validators/approval": typeof validators_approval;
  "validators/circuitBreaker": typeof validators_circuitBreaker;
  "validators/deadLetterQueue": typeof validators_deadLetterQueue;
  "validators/escalation": typeof validators_escalation;
  "validators/event": typeof validators_event;
  "validators/execution": typeof validators_execution;
  "validators/executionStep": typeof validators_executionStep;
  "validators/index": typeof validators_index;
  "validators/integration": typeof validators_integration;
  "validators/learning": typeof validators_learning;
  "validators/memory": typeof validators_memory;
  "validators/notification": typeof validators_notification;
  "validators/operator": typeof validators_operator;
  "validators/organization": typeof validators_organization;
  "validators/workflow": typeof validators_workflow;
  "validators/workflowVersion": typeof validators_workflowVersion;
  "validators/workspace": typeof validators_workspace;
  "validators/workspaceInvite": typeof validators_workspaceInvite;
  webhooks: typeof webhooks;
  workflows: typeof workflows;
  workspaces: typeof workspaces;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;

export declare const components: {};
