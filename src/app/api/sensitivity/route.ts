import { NextResponse } from "next/server";
import { z } from "zod";
import { solveCustomSensitivity, solveSensitivity } from "@/lib/analysis";
import { customSensitivitySchema, goalSchema, problemSchema } from "@/lib/schemas";

export const runtime = "nodejs";

// either a predefined scenario id or a user-defined custom change
const sensitivityInput = z.union([
  z.object({ problem: problemSchema, goal: goalSchema.optional(), scenarioId: z.string() }),
  z.object({ problem: problemSchema, goal: goalSchema.optional(), custom: customSensitivitySchema }),
]);

export async function POST(request: Request) {
  try {
    const input = sensitivityInput.parse(await request.json());
    if ("custom" in input) return NextResponse.json(await solveCustomSensitivity(input.problem, input.goal, input.custom));
    return NextResponse.json(await solveSensitivity(input.problem, input.goal, input.scenarioId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run the sensitivity scenario.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
