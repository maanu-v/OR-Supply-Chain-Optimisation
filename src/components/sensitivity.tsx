"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { axisStyle, Caption, ChartBox, colours, money, num, pct, postJson, SlackTable } from "@/components/common";
import { DataTable, type DataColumn } from "@/components/data-table";
import { parameterScenarios, type GoalInput, type ProblemId, type SensitivityRow, type SensitivityScenario } from "@/lib/scenarios";

interface Props {
  problem: ProblemId;
  goal?: GoalInput;
  /** Extra scenarios after the parameter perturbations (Problem 2 uses the transit-target sweep). */
  extra?: SensitivityScenario[];
  section: string;
  firstFigure: number;
  firstTable: number;
}

function costChange(row: SensitivityRow, baseline?: SensitivityRow) {
  if (!baseline?.totalCost || row.totalCost === null) return null;
  return ((row.totalCost - baseline.totalCost) / baseline.totalCost) * 100;
}

type ParameterScenario = (typeof parameterScenarios)[number];

function parameterColumns(rows: Record<string, SensitivityRow>, baseline?: SensitivityRow): DataColumn<ParameterScenario>[] {
  const changeOf = (scenario: ParameterScenario) => (scenario.id === "baseline" ? null : costChange(rows[scenario.id], baseline));
  return [
    { id: "group", header: "Parameter", value: (scenario) => scenario.group },
    { id: "label", header: "Scenario", value: (scenario) => scenario.label },
    { id: "horizon", header: "Horizon", numeric: true, value: (scenario) => rows[scenario.id].horizonDays, cell: (scenario) => `${rows[scenario.id].horizonDays ?? "-"} d` },
    { id: "totalCost", header: "Total cost", numeric: true, value: (scenario) => rows[scenario.id].totalCost, cell: (scenario) => (rows[scenario.id].totalCost === null ? rows[scenario.id].status : money(rows[scenario.id].totalCost)) },
    {
      id: "change", header: "Change", numeric: true, value: changeOf,
      cell: (scenario) => { const change = changeOf(scenario); return change === null ? "-" : pct(change); },
      className: (scenario) => { const change = changeOf(scenario); return change !== null && change >= 0.005 ? "up" : change !== null && change <= -0.005 ? "down" : undefined; },
    },
    { id: "warehouseCost", header: "Warehouse cost", numeric: true, value: (scenario) => rows[scenario.id].warehouseCost, cell: (scenario) => money(rows[scenario.id].warehouseCost) },
    { id: "freightCost", header: "Freight cost", numeric: true, value: (scenario) => rows[scenario.id].freightCost, cell: (scenario) => money(rows[scenario.id].freightCost) },
    { id: "transit", header: "Avg transit", numeric: true, value: (scenario) => rows[scenario.id].averageTransitDays, cell: (scenario) => rows[scenario.id].averageTransitDays?.toFixed(2) ?? "-" },
    { id: "routesChanged", header: "Orders re-routed", numeric: true, value: (scenario) => rows[scenario.id].routesChanged, cell: (scenario) => (rows[scenario.id].routesChanged === null ? "-" : num(rows[scenario.id].routesChanged!)) },
    { id: "plantsChanged", header: "Warehouse changed", numeric: true, value: (scenario) => rows[scenario.id].plantsChanged, cell: (scenario) => (rows[scenario.id].plantsChanged === null ? "-" : num(rows[scenario.id].plantsChanged!)) },
  ];
}

export function Sensitivity({ problem, goal, extra = [], section, firstFigure, firstTable }: Props) {
  const scenarios = [...parameterScenarios, ...extra];
  const [rows, setRows] = useState<Record<string, SensitivityRow>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const done = Object.keys(rows).length;

  async function runAll() {
    setError(undefined);
    setRows({});
    try {
      // one request per scenario so we can show progress; the server caches every solve
      for (const scenario of scenarios) {
        setRunning(scenario.label);
        const row = await postJson<SensitivityRow>("/api/sensitivity", { problem, goal, scenarioId: scenario.id });
        setRows((previous) => ({ ...previous, [scenario.id]: row }));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sensitivity run failed");
    } finally {
      setRunning(null);
    }
  }

  const baseline = rows.baseline;
  const parameterRows = parameterScenarios.filter((scenario) => rows[scenario.id]);
  const chartData = parameterRows
    .filter((scenario) => scenario.id !== "baseline")
    .map((scenario) => ({ label: scenario.label, change: costChange(rows[scenario.id], baseline) ?? 0 }));
  const extraRows = extra.filter((scenario) => rows[scenario.id]);
  const finished = done === scenarios.length && !running;

  return (
    <>
      <p>
        <button className="run" disabled={running !== null} onClick={runAll}>
          {running ? `Solving: ${running} ...` : done > 0 ? "Run sensitivity analysis again" : `Run sensitivity analysis (${scenarios.length} re-solves)`}
        </button>
      </p>
      {(running || (done > 0 && !finished)) && (
        <div className="progress"><span style={{ width: `${(done / scenarios.length) * 100}%` }} /></div>
      )}
      {running && <p className="note">{done} of {scenarios.length} scenarios done. Each re-solve takes a few seconds.</p>}
      {error && <p className="error">{error}</p>}

      {parameterRows.length > 0 && (
        <>
          <h3>{section}.1 Parameter perturbations</h3>
          <DataTable
            columns={parameterColumns(rows, baseline)}
            rows={parameterRows}
            rowKey={(scenario) => scenario.id}
            rowClass={(scenario) => (scenario.id === "baseline" ? "base" : undefined)}
            unit="scenarios"
          />
          <Caption>Table {firstTable}: Re-optimised plans under each parameter change (re-routed = warehouse, port, carrier or mode differs from the baseline plan)</Caption>

          {chartData.length > 0 && (
            <figure>
              <ChartBox height={320}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 24, bottom: 4, left: 40 }}>
                  <CartesianGrid stroke="#e3e3e3" horizontal={false} />
                  <XAxis type="number" tick={axisStyle} tickFormatter={(value) => `${value}%`} />
                  <YAxis type="category" dataKey="label" tick={axisStyle} width={130} />
                  <Tooltip formatter={(value) => pct(Number(value))} />
                  <ReferenceLine x={0} stroke="#333" />
                  <Bar dataKey="change" name="Change in total cost">
                    {chartData.map((row) => <Cell key={row.label} fill={row.change > 0 ? colours.red : colours.green} />)}
                  </Bar>
                </BarChart>
              </ChartBox>
              <Caption>Figure {firstFigure}: Percentage change in total logistics cost compared with the baseline plan</Caption>
            </figure>
          )}
        </>
      )}

      {finished && baseline && (
        <>
          <h3>{section}.2 Binding capacity constraints (baseline)</h3>
          <SlackTable result={baseline} table={`Table ${firstTable + 1}`} />
        </>
      )}

      {extraRows.length > 0 && (
        <>
          <h3>{section}.3 Cost vs delivery-time trade-off</h3>
          <div className="two-col">
            <figure>
              <ChartBox height={280}>
                <LineChart data={extraRows.map((scenario) => ({ transit: Number(rows[scenario.id].averageTransitDays?.toFixed(3)), cost: rows[scenario.id].totalCost }))} margin={{ top: 8, right: 16, bottom: 16, left: 16 }}>
                  <CartesianGrid stroke="#e3e3e3" />
                  <XAxis dataKey="transit" type="number" domain={[0, "auto"]} tick={axisStyle} label={{ value: "achieved average transit (days)", position: "insideBottom", offset: -8, fontSize: 12 }} />
                  <YAxis tick={axisStyle} domain={["auto", "auto"]} tickFormatter={(value) => `${(Number(value) / 1e6).toFixed(2)}M`} />
                  <Tooltip formatter={(value) => money(Number(value))} labelFormatter={(value) => `${value} days`} />
                  <Line type="linear" dataKey="cost" name="Total cost" stroke={colours.blue} strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ChartBox>
              <Caption>Figure {firstFigure + 1}: Total cost against achieved average transit time</Caption>
            </figure>
            <div>
              <table className="data">
                <thead><tr><th className="num">Target (days)</th><th className="num">Achieved</th><th className="num">Total cost</th><th className="num">Cost over target</th><th>Status</th></tr></thead>
                <tbody>
                  {extraRows.map((scenario) => {
                    const row = rows[scenario.id];
                    return (
                      <tr key={scenario.id}>
                        <td className="num">{scenario.transitTarget}</td>
                        <td className="num">{row.averageTransitDays?.toFixed(2) ?? "-"}</td>
                        <td className="num">{money(row.totalCost)}</td>
                        <td className="num">{row.goal ? money(row.goal.costOver) : "-"}</td>
                        <td>{row.status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Caption>Table {firstTable + 2}: Goal programme re-solved for different delivery-time targets</Caption>
            </div>
          </div>
        </>
      )}
    </>
  );
}
