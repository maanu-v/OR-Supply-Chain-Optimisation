import { z } from "zod";

export const goalSchema = z.object({
  costBudgetPercent: z.number().min(0).max(50),
  transitTarget: z.number().min(0.1).max(14),
  costWeight: z.number().min(0).max(100),
  timeWeight: z.number().min(0).max(100),
});

export const problemSchema = z.enum(["minimum-cost", "cost-time"]);
