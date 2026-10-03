import { NextResponse } from "next/server";
import { z } from "zod";
import { solveSensitivity } from "@/lib/analysis";
import { goalSchema, problemSchema } from "@/lib/schemas";

export const runtime = "nodejs";

const sensitivityInput = z.object({
  problem: problemSchema,
  scenarioId: z.string(),
  goal: goalSchema.optional(),
});

export async function POST(request: Request) {
  try {
    const input = sensitivityInput.parse(await request.json());
    return NextResponse.json(await solveSensitivity(input.problem, input.goal, input.scenarioId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run the sensitivity scenario.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
