import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDashboardAnalysis, solveScenario } from "@/lib/analysis";
import { prisma } from "@/lib/db";
import { goalSchema, problemSchema } from "@/lib/schemas";

export const runtime = "nodejs";

const scenarioInput = z.object({
  problem: problemSchema,
  capacityFactor: z.number().min(0.5).max(2).default(1),
  freightRateFactor: z.number().min(0.5).max(2).default(1),
  warehouseCostFactor: z.number().min(0.5).max(2).default(1),
  demandFactor: z.number().min(0.5).max(2).default(1),
  goal: goalSchema.optional(),
});

export async function POST(request: Request) {
  try {
    const input = scenarioInput.parse(await request.json());
    const solved = await solveScenario(input);
    const analysis = getDashboardAnalysis();
    const imported = await prisma.datasetImport.create({
      data: {
        sourcePath: "data/Supply chain logistics problem.xlsx",
        rowCount: analysis.source.orders,
        diagnostics: analysis.feasibility,
      },
    });
    await prisma.scenario.create({
      data: {
        importId: imported.id,
        name: input.problem === "minimum-cost" ? "Problem 1: minimum-cost assignment" : "Problem 2: cost vs delivery time",
        horizonDays: solved.horizonDays ?? 0,
        parameters: input,
        solve: {
          create: {
            status: solved.status,
            objectiveCost: solved.totalCost,
            assignedOrders: solved.assignments.length,
            minimumDays: solved.horizonDays ?? 0,
            diagnostics: { plantLoads: solved.plantLoads, goal: solved.goal ?? null, message: solved.message ?? null } as Prisma.InputJsonValue,
            assignments: solved.assignments as unknown as Prisma.InputJsonValue,
          },
        },
      },
    });
    return NextResponse.json(solved);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to solve the selected scenario.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
