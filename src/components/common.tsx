"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ExistingComparison, PlanScope } from "@/lib/combined";
import type { SolveSummary } from "@/lib/scenarios";
import { DataTable, type DataColumn } from "@/components/data-table";
import type { Assignment } from "@/lib/types";

// matplotlib "tab10" colours, same as the notebook plots
export const colours = { blue: "#1f77b4", orange: "#ff7f0e", green: "#2ca02c", red: "#d62728", purple: "#9467bd", grey: "#7f7f7f" };

export const num = (value: number, digits = 0) => value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const money = (value: number | null) => (value === null ? "-" : `$${num(value)}`);
export const pct = (value: number, digits = 2) => (Math.abs(value) < 0.5 * 10 ** -digits ? `${(0).toFixed(digits)}%` : `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`);

export function Caption({ children }: { children: React.ReactNode }) {
  return <p className="caption">{children}</p>;
}

export function ChartBox({ height = 280, children }: { height?: number; children: React.ReactElement }) {
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={height}>{children}</ResponsiveContainer>
    </div>
  );
}

export const axisStyle = { fontSize: 12, fill: "#444" };

/** Status / horizon / cost summary of one solved plan. */
export function ResultTable({ result }: { result: SolveSummary }) {
  if (result.status === "infeasible" || result.status === "error") {
    return <p className="error">Solver status: {result.status}. {result.message}</p>;
  }
  return (
    <table className="data">
      <tbody>
        <tr><th>Solver status</th><td>{result.status} (HiGHS branch-and-bound, 0.1% optimality gap, solved in {result.solveSeconds.toFixed(1)} s)</td></tr>
        <tr><th>Planning horizon</th><td>{result.horizonDays} {result.horizonDays === 1 ? "day" : "days"} (shortest horizon in which all {num(result.plantLoads.reduce((sum, row) => sum + row.orders, 0))} orders fit the warehouse capacities)</td></tr>
        <tr><th>Total logistics cost</th><td>{money(result.totalCost)}</td></tr>
        <tr><th>Warehouse cost</th><td>{money(result.warehouseCost)}</td></tr>
        <tr><th>Transportation cost</th><td>{money(result.freightCost)}</td></tr>
        <tr><th>Average transit time</th><td>{result.averageTransitDays === null ? "-" : `${result.averageTransitDays.toFixed(2)} days`} (over DTD/DTP orders; CRF freight is arranged by the customer)</td></tr>
        <tr><th>Transport mode split</th><td>{result.modeSplit.map((row) => `${row.mode}: ${num(row.orders)}`).join(", ")}</td></tr>
      </tbody>
    </table>
  );
}

export function PlantLoadChart({ result, figure }: { result: SolveSummary; figure: string }) {
  const data = result.plantLoads.filter((row) => row.capacity > 0 || row.orders > 0);
  return (
    <figure>
      <ChartBox height={300}>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="#e3e3e3" vertical={false} />
          <XAxis dataKey="plant" tick={axisStyle} interval={0} angle={-40} textAnchor="end" height={50} />
          <YAxis tick={axisStyle} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Bar dataKey="capacity" name={`Capacity over ${result.horizonDays} days`} fill="#c7c7c7" />
          <Bar dataKey="orders" name="Orders assigned" fill={colours.blue} />
        </BarChart>
      </ChartBox>
      <Caption>{figure}: Orders assigned to each warehouse against its capacity for the planning horizon</Caption>
    </figure>
  );
}

type ConstraintRow = SolveSummary["constraints"][number];

const slackColumns: DataColumn<ConstraintRow>[] = [
  { id: "plant", header: "Warehouse", value: (row) => row.plant },
  { id: "used", header: "Orders used", value: (row) => row.used, numeric: true, cell: (row) => num(row.used) },
  { id: "rhs", header: "Capacity (RHS)", value: (row) => row.rhs, numeric: true, cell: (row) => num(row.rhs) },
  { id: "slack", header: "Slack", value: (row) => row.slack, numeric: true, cell: (row) => num(row.slack) },
  { id: "slackPercent", header: "Slack %", value: (row) => row.slackPercent, numeric: true, cell: (row) => `${row.slackPercent.toFixed(1)}%` },
  { id: "binding", header: "Constraint", value: (row) => (row.slack === 0 ? "binding" : "non-binding"), cell: (row) => (row.slack === 0 ? <b>binding</b> : "non-binding") },
];

export function SlackTable({ result, table }: { result: SolveSummary; table: string }) {
  const rows = result.constraints.filter((row) => row.rhs > 0);
  return (
    <>
      <DataTable columns={slackColumns} rows={rows} rowKey={(row) => row.plant} unit="warehouses" />
      <Caption>{table}: Capacity constraints of the solved plan. A binding constraint has zero slack; capacity can fall by the slack amount without making the current plan infeasible.</Caption>
    </>
  );
}

const assignmentColumns: DataColumn<Assignment>[] = [
  { id: "orderId", header: "Order ID", value: (row) => row.orderId },
  { id: "plant", header: "Warehouse", value: (row) => row.plant, solver: true },
  { id: "originPort", header: "Origin port", value: (row) => row.originPort, solver: true },
  { id: "carrier", header: "Carrier", value: (row) => row.carrier ?? "customer", solver: true, className: (row) => (row.carrier ? "solver" : undefined) },
  { id: "mode", header: "Mode", value: (row) => row.mode ?? "-", solver: true, className: (row) => (row.mode ? "solver" : undefined) },
  { id: "service", header: "Service", value: (row) => row.routeServiceLevel ?? "CRF" },
  { id: "transit", header: "Transit (days)", value: (row) => row.transitDays, numeric: true, cell: (row) => row.transitDays ?? "-" },
  { id: "warehouseCost", header: "Warehouse cost", value: (row) => row.warehouseCost, numeric: true, cell: (row) => num(row.warehouseCost, 2) },
  { id: "freightCost", header: "Freight cost", value: (row) => row.freightCost, numeric: true, cell: (row) => num(row.freightCost, 2) },
  { id: "totalCost", header: "Total", value: (row) => row.totalCost, numeric: true, cell: (row) => num(row.totalCost, 2) },
];

export function AssignmentTable({ assignments, table }: { assignments: Assignment[]; table: string }) {
  return (
    <>
      <p style={{ fontSize: 13, color: "#5c5c5c", margin: "10px 0 4px" }}>
        <span className="legend-swatch" />Highlighted columns are the decisions made by the optimisation solver (warehouse, origin port,
        carrier and mode). For CRF orders the customer arranges freight, so only the warehouse and port are decided by us.
        Click a column header to sort; use the boxes under the headers to filter.
      </p>
      <DataTable columns={assignmentColumns} rows={assignments} rowKey={(row) => row.orderId} unit="orders" pageSize={25} searchPlaceholder="Search order ID, plant, port, carrier..." />
      <Caption>{table}: Order-level routing plan chosen by the solver</Caption>
    </>
  );
}

const scopes: { id: PlanScope; label: string }[] = [
  { id: "new", label: "New orders only (empty network, full warehouse capacity)" },
  { id: "combined", label: "Together with the existing dataset orders (re-solve all orders)" },
];

/** Radio choice between planning new orders alone or re-planning them with the dataset orders. */
export function ScopeChoice({ name, value, onChange }: { name: string; value: PlanScope; onChange: (scope: PlanScope) => void }) {
  return (
    <div className="controls" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
      {scopes.map((item) => (
        <label key={item.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, color: "#222", fontSize: 14 }}>
          <input type="radio" name={name} checked={value === item.id} onChange={() => onChange(item.id)} style={{ width: "auto" }} />
          {item.label}
        </label>
      ))}
    </div>
  );
}

/** Rows comparing the combined plan with the Problem 1 plan of the dataset orders. */
export function ComparisonTable({ comparison, added }: { comparison: ExistingComparison; added: string }) {
  return (
    <table className="data" style={{ maxWidth: 620 }}>
      <tbody>
        <tr><th>Existing orders re-planned</th><td>{num(comparison.existingOrders)}</td></tr>
        <tr><th>Cost of existing plan</th><td>{money(comparison.baselineCost)}</td></tr>
        <tr><th>Cost with {added}</th><td>{money(comparison.combinedCost)}</td></tr>
        <tr><th>Added cost</th><td><b>{money(comparison.addedCost)}</b></td></tr>
        <tr><th>Cost of the new routes alone</th><td>{money(comparison.newOrdersCost)}</td></tr>
        <tr><th>Planning horizon</th><td>{comparison.baselineHorizon} → {comparison.combinedHorizon} days</td></tr>
        <tr><th>Existing orders re-routed</th><td>{num(comparison.existingRerouted)} ({num(comparison.existingPlantChanged)} to another warehouse)</td></tr>
      </tbody>
    </table>
  );
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? `Request to ${url} failed`);
  return data as T;
}
