import { NextResponse } from "next/server";
import { getDashboardAnalysis } from "@/lib/analysis";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(getDashboardAnalysis());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to analyse the workbook.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
