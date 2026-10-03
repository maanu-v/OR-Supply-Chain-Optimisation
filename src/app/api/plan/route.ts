import { NextResponse } from "next/server";
import { z } from "zod";
import { planOrder } from "@/lib/analysis";

export const runtime = "nodejs";

const plannerInput = z.object({
  productId: z.string().min(1),
  customer: z.string().min(1),
  serviceLevel: z.enum(["DTD", "DTP", "CRF"]),
  quantity: z.number().positive().max(1e7),
  weight: z.number().positive().max(1e6),
  objective: z.enum(["cost", "time", "weighted"]),
  dayValue: z.number().min(0).max(1e6).default(0),
});

export async function POST(request: Request) {
  try {
    return NextResponse.json(planOrder(plannerInput.parse(await request.json())));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to plan this order.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
