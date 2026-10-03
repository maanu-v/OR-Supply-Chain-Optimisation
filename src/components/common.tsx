"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SolveSummary } from "@/lib/scenarios";
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
        <tr><th>Planning horizon</th><td>{result.horizonDays} days (shortest horizon in which all 9,215 orders fit the warehouse capacities)</td></tr>
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

export function SlackTable({ result, table }: { result: SolveSummary; table: string }) {
  const rows = result.constraints.filter((row) => row.rhs > 0);
  return (
    <>
      <div className="scroll">
        <table className="data">
          <thead>
            <tr><th>Warehouse</th><th className="num">Orders used</th><th className="num">Capacity (RHS)</th><th className="num">Slack</th><th className="num">Slack %</th><th>Constraint</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.plant}>
                <td>{row.plant}</td>
                <td className="num">{num(row.used)}</td>
                <td className="num">{num(row.rhs)}</td>
                <td className="num">{num(row.slack)}</td>
                <td className="num">{row.slackPercent.toFixed(1)}%</td>
                <td>{row.slack === 0 ? <b>binding</b> : "non-binding"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Caption>{table}: Capacity constraints of the solved plan. A binding constraint has zero slack; capacity can fall by the slack amount without making the current plan infeasible.</Caption>
    </>
  );
}

export function AssignmentTable({ assignments, table }: { assignments: Assignment[]; table: string }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const rows = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return assignments;
    return assignments.filter((row) => [row.orderId, row.plant, row.originPort, row.carrier ?? "", row.mode ?? ""].some((value) => value.toLowerCase().includes(text)));
  }, [assignments, query]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const shown = rows.slice(page * pageSize, (page + 1) * pageSize);
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <input className="search" value={query} placeholder="Search order ID, plant, port, carrier..." onChange={(event) => { setQuery(event.target.value); setPage(0); }} />
        <div className="pager">
          <span>{num(rows.length)} orders · page {page + 1} of {pages}</span>
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</button>
          <button disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </div>
      <p style={{ fontSize: 13, color: "#5c5c5c", margin: "10px 0 4px" }}>
        <span className="legend-swatch" />Highlighted columns are the decisions made by the optimisation solver (warehouse, origin port,
        carrier and mode). For CRF orders the customer arranges freight, so only the warehouse and port are decided by us.
      </p>
      <div className="scroll">
        <table className="data">
          <thead>
            <tr><th>Order ID</th><th className="solver">Warehouse</th><th className="solver">Origin port</th><th className="solver">Carrier</th><th className="solver">Mode</th><th>Service</th><th className="num">Transit (days)</th><th className="num">Warehouse cost</th><th className="num">Freight cost</th><th className="num">Total</th></tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.orderId}>
                <td>{row.orderId}</td>
                <td className="solver">{row.plant}</td>
                <td className="solver">{row.originPort}</td>
                <td className={row.carrier ? "solver" : undefined}>{row.carrier ?? "customer"}</td>
                <td className={row.mode ? "solver" : undefined}>{row.mode ?? "-"}</td>
                <td>{row.routeServiceLevel ?? "CRF"}</td>
                <td className="num">{row.transitDays ?? "-"}</td>
                <td className="num">{num(row.warehouseCost, 2)}</td>
                <td className="num">{num(row.freightCost, 2)}</td>
                <td className="num">{num(row.totalCost, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Caption>{table}: Order-level routing plan chosen by the solver</Caption>
    </>
  );
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? `Request to ${url} failed`);
  return data as T;
}
