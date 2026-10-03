import { z } from "zod";

export const goalSchema = z.object({
  costBudgetPercent: z.number().min(0).max(50),
  transitTarget: z.number().min(0.1).max(14),
  costWeight: z.number().min(0).max(100),
  timeWeight: z.number().min(0).max(100),
});

export const problemSchema = z.enum(["minimum-cost", "cost-time"]);

export const customSensitivitySchema = z.object({
  parameter: z.enum(["capacity", "warehouseCost", "freight", "demand", "transitTarget", "costBudget"]),
  changePercent: z.number().min(-90).max(200),
  value: z.number().min(0).max(50).optional(),
  targets: z.array(z.string().min(1)).max(30).optional(),
});
