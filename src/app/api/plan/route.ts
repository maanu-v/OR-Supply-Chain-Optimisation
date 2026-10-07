import { NextResponse } from "next/server";
import { z } from "zod";
import { planSingleOrder } from "@/lib/combined";

export const runtime = "nodejs";

const plannerInput = z.object({
  productId: z.string().min(1),
  customer: z.string().min(1),
  serviceLevel: z.enum(["DTD", "DTP", "CRF"]),
  quantity: z.number().positive().max(1e7),
  weight: z.number().positive().max(1e6),
  objective: z.enum(["cost", "time", "weighted"]),
  dayValue: z.number().min(0).max(1e6).default(0),
  scope: z.enum(["new", "combined"]).default("new"),
});

export async function POST(request: Request) {
  try {
    const { scope, ...input } = plannerInput.parse(await request.json());
    return NextResponse.json(await planSingleOrder(input, scope));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to plan this order.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
