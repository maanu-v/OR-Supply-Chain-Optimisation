"use client";

import { useState } from "react";
import { Caption, money, num, pct, postJson } from "@/components/common";
import { MultiSearchSelect } from "@/components/search-select";
import type { CustomParameter, CustomSensitivityInput, CustomSensitivityResult, GoalInput, ProblemId } from "@/lib/scenarios";

const parameters: { id: CustomParameter; label: string; scope?: "plant" | "carrier"; problem2Only?: boolean }[] = [
  { id: "capacity", label: "Warehouse capacity", scope: "plant" },
  { id: "warehouseCost", label: "Warehouse cost per unit", scope: "plant" },
  { id: "freight", label: "Freight rates", scope: "carrier" },
  { id: "demand", label: "Demand volume (quantity and weight)" },
  { id: "transitTarget", label: "Delivery-time target (days)", problem2Only: true },
  { id: "costBudget", label: "Cost budget (% over Problem 1)", problem2Only: true },
];

function change(before: number | null, after: number | null) {
  if (before === null || after === null || before === 0) return "-";
  return pct(((after - before) / before) * 100);
}

function trend(before: number | null, after: number | null) {
  if (before === null || after === null) return "";
  if (after > before + 1e-6) return "up";
  if (after < before - 1e-6) return "down";
  return "";
}

export function CustomSensitivity({ problem, goal, plants, carriers, firstTable }: { problem: ProblemId; goal?: GoalInput; plants: string[]; carriers: string[]; firstTable: number }) {
  const options = parameters.filter((item) => !item.problem2Only || problem === "cost-time");
  const [parameter, setParameter] = useState<CustomParameter>("capacity");
  const [changePercent, setChangePercent] = useState(-15);
  const [value, setValue] = useState(goal?.transitTarget ?? 1);
  const [targets, setTargets] = useState<string[]>([]);
  const [result, setResult] = useState<CustomSensitivityResult>();
  const [history, setHistory] = useState<CustomSensitivityResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const selected = options.find((item) => item.id === parameter)!;
  const isGoal = selected.problem2Only === true;

  function pick(next: CustomParameter) {
    setParameter(next);
    setTargets([]);
    if (next === "transitTarget") setValue(goal?.transitTarget ?? 1);
    if (next === "costBudget") setValue(goal?.costBudgetPercent ?? 5);
  }

  async function run() {
    setBusy(true);
    setError(undefined);
    try {
      const custom: CustomSensitivityInput = {
        parameter,
        changePercent: isGoal ? 0 : changePercent,
        value: isGoal ? value : undefined,
        targets: selected.scope && targets.length > 0 ? targets : undefined,
      };
      const response = await postJson<CustomSensitivityResult>("/api/sensitivity", { problem, goal, custom });
      setResult(response);
      setHistory((previous) => [response, ...previous.filter((row) => row.label !== response.label)].slice(0, 10));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Custom run failed");
    } finally {
      setBusy(false);
    }
  }

  const rows: { name: string; before: number | null; after: number | null; format: (value: number | null) => string }[] = result
    ? [
      { name: "Planning horizon (days)", before: result.baseline.horizonDays, after: result.scenario.horizonDays, format: (value) => (value === null ? "-" : String(value)) },
      { name: "Total logistics cost", before: result.baseline.totalCost, after: result.scenario.totalCost, format: money },
      { name: "Warehouse cost", before: result.baseline.warehouseCost, after: result.scenario.warehouseCost, format: money },
      { name: "Transportation cost", before: result.baseline.freightCost, after: result.scenario.freightCost, format: money },
      { name: "Average transit (days)", before: result.baseline.averageTransitDays, after: result.scenario.averageTransitDays, format: (value) => (value === null ? "-" : value.toFixed(2)) },
    ]
    : [];

  return (
    <>
      <div className="controls">
        <label>
          Parameter
          <select value={parameter} onChange={(event) => pick(event.target.value as CustomParameter)} style={{ marginTop: 2, padding: 4, width: 240 }}>
            {options.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        {isGoal ? (
          <label>
            New value ({parameter === "transitTarget" ? "days" : "%"})
            <input type="number" step={parameter === "transitTarget" ? 0.25 : 0.5} min={parameter === "transitTarget" ? 0.1 : 0} max={parameter === "transitTarget" ? 14 : 50} value={value} onChange={(event) => setValue(Number(event.target.value))} />
          </label>
        ) : (
          <label>
            Change by (%)
            <input type="number" step={5} min={-90} max={200} value={changePercent} onChange={(event) => setChangePercent(Number(event.target.value))} />
          </label>
        )}
        {selected.scope && (
          <div className="field">
            Apply to {selected.scope === "plant" ? "warehouses" : "carriers"} (tick one or more)
            <MultiSearchSelect label={selected.scope === "plant" ? "Warehouse" : "Carrier"} values={targets} options={selected.scope === "plant" ? plants : carriers} onChange={setTargets} />
          </div>
        )}
        <button className="run" disabled={busy} onClick={run}>{busy ? "Re-solving..." : "Run custom scenario"}</button>
      </div>
      {error && <p className="error">{error}</p>}

      {result && (
        <>
          <h4 style={{ margin: "18px 0 6px", fontFamily: "Georgia, serif", fontWeight: "normal", fontSize: 17 }}>Result: {result.label}</h4>
          {result.scenario.totalCost === null && <p className="error">Solver status: {result.scenario.status}. {result.scenario.message}</p>}
          <table className="data">
            <thead><tr><th>Measure</th><th className="num">Baseline</th><th className="num">Custom scenario</th><th className="num">Change</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td className="num">{row.format(row.before)}</td>
                  <td className="num">{row.format(row.after)}</td>
                  <td className={`num ${trend(row.before, row.after)}`}>{change(row.before, row.after)}</td>
                </tr>
              ))}
              <tr><td>Orders re-routed</td><td className="num">-</td><td className="num">{result.routesChanged === null ? "-" : num(result.routesChanged)}</td><td className="num">-</td></tr>
            </tbody>
          </table>
          <Caption>Table {firstTable}: Baseline plan against the custom scenario</Caption>

          {(result.plantChanges.length > 0 || result.carrierChanges.length > 0) && (
            <div className="two-col">
              <div>
                {result.plantChanges.length > 0 ? (
                  <>
                <table className="data">
                  <thead><tr><th>Warehouse</th><th className="num">Orders before</th><th className="num">Orders after</th><th className="num">Daily capacity before</th><th className="num">Daily capacity after</th></tr></thead>
                  <tbody>
                    {result.plantChanges.map((row) => (
                      <tr key={row.plant}>
                        <td>{row.plant}</td>
                        <td className="num">{num(row.ordersBefore)}</td>
                        <td className="num solver">{num(row.ordersAfter)}</td>
                        <td className="num">{num(row.capacityBefore)}</td>
                        <td className="num">{num(row.capacityAfter)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Caption>Table {firstTable + 1}: Warehouses whose load or capacity changed</Caption>
                  </>
                ) : <p className="note">No warehouse gains or loses orders (orders may swap between warehouses with equal totals).</p>}
              </div>
              <div>
                {result.carrierChanges.length > 0 ? (
                  <>
                    <table className="data">
                      <thead><tr><th>Carrier</th><th className="num">Orders before</th><th className="num">Orders after</th></tr></thead>
                      <tbody>
                        {result.carrierChanges.map((row) => (
                          <tr key={row.carrier}><td>{row.carrier}</td><td className="num">{num(row.ordersBefore)}</td><td className="num solver">{num(row.ordersAfter)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                    <Caption>Table {firstTable + 2}: Carriers whose order count changed</Caption>
                  </>
                ) : <p className="note">No carrier gains or loses orders.</p>}
              </div>
            </div>
          )}

          {result.examples.length > 0 && (
            <>
              <div className="scroll">
                <table className="data">
                  <thead><tr><th>Order ID</th><th>Baseline route</th><th className="solver">New route</th><th className="num">Cost before</th><th className="num">Cost after</th></tr></thead>
                  <tbody>
                    {result.examples.map((row) => (
                      <tr key={row.orderId}>
                        <td>{row.orderId}</td>
                        <td>{row.before}</td>
                        <td className="solver">{row.after}</td>
                        <td className="num">{num(row.costBefore, 2)}</td>
                        <td className="num">{num(row.costAfter, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Caption>Table {firstTable + 3}: Examples of re-routed orders (first {result.examples.length} of {num(result.routesChanged ?? 0)}; route = warehouse → port → carrier)</Caption>
            </>
          )}
        </>
      )}

      {history.length > 1 && (
        <>
          <h4 style={{ margin: "18px 0 6px", fontFamily: "Georgia, serif", fontWeight: "normal", fontSize: 17 }}>Custom scenarios run so far</h4>
          <table className="data">
            <thead><tr><th>Scenario</th><th className="num">Horizon</th><th className="num">Total cost</th><th className="num">Change</th><th className="num">Avg transit</th><th className="num">Orders re-routed</th></tr></thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td className="num">{row.scenario.horizonDays ?? "-"} d</td>
                  <td className="num">{row.scenario.totalCost === null ? row.scenario.status : money(row.scenario.totalCost)}</td>
                  <td className={`num ${trend(row.baseline.totalCost, row.scenario.totalCost)}`}>{change(row.baseline.totalCost, row.scenario.totalCost)}</td>
                  <td className="num">{row.scenario.averageTransitDays?.toFixed(2) ?? "-"}</td>
                  <td className="num">{row.routesChanged === null ? "-" : num(row.routesChanged)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Caption>Table {firstTable + 4}: Comparison of all custom scenarios in this session</Caption>
        </>
      )}
    </>
  );
}
