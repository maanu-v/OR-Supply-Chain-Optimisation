import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { planBulkOrders } from "@/lib/bulk";

export const runtime = "nodejs";

const maxBytes = 5 * 1024 * 1024;

/** Sample batch that can be uploaded as-is to try the bulk planner. */
export async function GET() {
  const sample = await readFile(path.join(process.cwd(), "data", "sample-bulk-orders.csv"));
  return new Response(sample, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="sample-bulk-orders.csv"' },
  });
}

export async function POST(request: Request) {
  try {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a CSV or Excel file to upload.");
    if (file.size > maxBytes) throw new Error("The file is larger than 5 MB.");
    return NextResponse.json(await planBulkOrders(Buffer.from(await file.arrayBuffer())));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to plan the uploaded orders.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
