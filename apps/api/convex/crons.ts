/**
 * Convex Cron Jobs
 *
 * Registers periodic tasks that run on a schedule.
 * Currently: workflow scheduler that checks for due scheduled workflows.
 */

import { cronJobs } from "convex/server";
import { makeFunctionReference } from "convex/server";

const triggerScheduledWorkflowRef = makeFunctionReference<"mutation", Record<string, never>>(
  "engine/scheduler:triggerScheduledWorkflow"
);

const crons = cronJobs();

// Check for due scheduled workflows every minute
crons.interval("trigger scheduled workflows", { minutes: 1 }, triggerScheduledWorkflowRef);

export default crons;
