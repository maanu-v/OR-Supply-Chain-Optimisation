"use client";

import { useState } from "react";
import { AssignmentTable, Caption, ComparisonTable, num, PlantLoadChart, ResultTable, ScopeChoice } from "@/components/common";
import type { BulkResult } from "@/lib/bulk";
import { bulkColumns } from "@/lib/bulk-format";
import type { PlanScope } from "@/lib/combined";

const planColumns = ["Order ID", "Product ID", "Customer", "Service Level", "Unit quantity", "Weight", "Warehouse", "Origin port", "Carrier", "Mode", "Transit days", "Warehouse cost", "Freight cost", "Total cost"];

function planCsv(result: BulkResult) {
  const rows = result.assignments.map((row) => [
    row.orderId, row.productId, row.customer, row.serviceLevel, row.quantity, row.weight, row.plant, row.originPort,
    row.carrier ?? "customer", row.mode ?? "", row.transitDays ?? "", row.warehouseCost.toFixed(2), row.freightCost.toFixed(2), row.totalCost.toFixed(2),
  ]);
  return [planColumns, ...rows].map((row) => row.join(",")).join("\n");
}

export function BulkTab() {
  const [file, setFile] = useState<File>();
  const [scope, setScope] = useState<PlanScope>("new");
  const [result, setResult] = useState<BulkResult>();
  const [solvedFile, setSolvedFile] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function plan() {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("scope", scope);
      const response = await fetch("/api/bulk", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Upload failed");
      setResult(data as BulkResult);
      setSolvedFile(file.name);
    } catch (cause) {
      setResult(undefined);
      setError(cause instanceof Error ? cause.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!result) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([planCsv(result)], { type: "text/csv" }));
    link.download = "bulk-order-plan.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // tables after the batch summary shift by one when the comparison table is shown
  const first = result?.comparison ? 4 : 3;

  return (
    <>
      <h2>1. Upload Orders</h2>
      <table className="data" style={{ maxWidth: 720 }}>
        <thead><tr><th>Column</th><th>Required</th><th>Example</th><th>Rule</th></tr></thead>
        <tbody>
          {bulkColumns.map((column) => (
            <tr key={column.name}><td><code>{column.name}</code></td><td>{column.required ? "yes" : "no"}</td><td>{column.example}</td><td>{column.note}</td></tr>
          ))}
        </tbody>
      </table>
      <Caption>Table 1: Columns of the upload file (CSV or Excel, first sheet, one order per row)</Caption>
      <div className="controls">
        <label>
          Order file (.csv, .xlsx)
          <input type="file" accept=".csv,.xlsx,.xls" style={{ width: 300 }} onChange={(event) => setFile(event.target.files?.[0])} />
        </label>
        <button className="run" disabled={busy || !file} onClick={plan}>{busy ? "Solving..." : "Plan uploaded orders"}</button>
        <a className="run secondary" href="/api/bulk" download>Download sample file</a>
      </div>
      <h3>Planning scope</h3>
      <ScopeChoice name="bulk-scope" value={scope} onChange={setScope} />
      {error && <p className="error">{error}</p>}

      {result && (
        <>
          <h2>2. Batch Summary</h2>
          <table className="data" style={{ maxWidth: 560 }}>
            <tbody>
              <tr><th>File</th><td>{solvedFile}</td></tr>
              <tr><th>Rows read</th><td>{num(result.rowsRead)}</td></tr>
              <tr><th>Orders planned</th><td>{num(result.planned)}</td></tr>
              <tr><th>Rows rejected</th><td>{num(result.rejected.length)}</td></tr>
            </tbody>
          </table>
          <Caption>Table 2: Rows of the uploaded file</Caption>
          {result.comparison && (
            <>
              <ComparisonTable comparison={result.comparison} added="the uploaded batch" />
              <Caption>Table 3: Effect of the uploaded batch on the plan of the existing orders</Caption>
            </>
          )}
          <ResultTable result={result} />
          {result.totalCost !== null && (
            <>
              <Caption>Table {first}: {result.comparison ? "Minimum-cost plan for the existing orders and the uploaded batch together (Problem 1 model)" : "Minimum-cost plan for the uploaded batch (Problem 1 model, full warehouse capacity)"}</Caption>
              <PlantLoadChart result={result} figure="Figure 1" />

              <h2>3. Order-Level Plan of the Uploaded Orders</h2>
              <p><button className="run secondary" onClick={download}>Download plan (CSV)</button></p>
              <AssignmentTable assignments={result.assignments} table={`Table ${first + 1}`} />
            </>
          )}

          {result.rejected.length > 0 && (
            <>
              <h2>{result.totalCost !== null ? 4 : 3}. Rejected Rows</h2>
              <div className="scroll">
                <table className="data">
                  <thead><tr><th className="num">File row</th><th>Order ID</th><th>Reason</th></tr></thead>
                  <tbody>
                    {result.rejected.map((row) => <tr key={`${row.row}-${row.orderId}`}><td className="num">{row.row}</td><td>{row.orderId}</td><td>{row.reason}</td></tr>)}
                  </tbody>
                </table>
              </div>
              <Caption>Table {result.totalCost !== null ? first + 2 : first}: Rows left out of the plan and the filter that removed them</Caption>
            </>
          )}
        </>
      )}
    </>
  );
}
