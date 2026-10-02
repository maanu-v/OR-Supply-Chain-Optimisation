import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDashboardAnalysis, solveScenario } from "@/lib/analysis";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const scenarioInput = z.object({
  problem: z.enum(["minimum-cost", "cost-time"]),
  capacityFactor: z.number().min(0.5).max(2).default(1),
  freightRateFactor: z.number().min(0.5).max(2).default(1),
  warehouseCostFactor: z.number().min(0.5).max(2).default(1),
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
        name: `Capacity ${input.capacityFactor}× / Freight ${input.freightRateFactor}×`,
        horizonDays: solved.horizonDays ?? 0,
        parameters: input,
        solve: {
          create: {
            status: solved.status,
            objectiveCost: solved.objectiveCost,
            assignedOrders: solved.assignments.length,
            minimumDays: solved.horizonDays ?? 0,
            diagnostics: { plantLoads: solved.plantLoads, message: "message" in solved ? solved.message ?? null : null },
            assignments: solved.assignments as Prisma.InputJsonValue,
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
