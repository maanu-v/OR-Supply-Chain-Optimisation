"use client";

import { useState } from "react";
import { Caption, num, postJson } from "@/components/common";
import { SearchSelect } from "@/components/search-select";
import type { DashboardAnalysis } from "@/lib/analysis";
import type { PlannerInput, PlannerObjective, PlannerResult, PlannerRoute } from "@/lib/planner";

const objectives: { id: PlannerObjective; label: string; formula: string }[] = [
  { id: "cost", label: "Minimise total cost", formula: "min  q·h(p) + max(m, w·f)" },
  { id: "time", label: "Minimise delivery time", formula: "min  transit days  (ties broken by cost)" },
  { id: "weighted", label: "Weighted cost + time", formula: "min  total cost + λ · transit days" },
];

const carrierLabel = (route: PlannerRoute) => (route.carrier ? `${route.carrier} · ${route.mode} · ${route.serviceLevel}` : "Customer freight (CRF)");

const dollars = (value: number) => `$${num(value, 2)}`;

function objectiveValue(route: PlannerRoute, objective: PlannerObjective) {
  if (objective === "time") return `${route.score} days`;
  return dollars(route.score);
}

/** Layered drawing of every feasible option; the optimal path is drawn thick in blue. */
function NetworkView({ result, best }: { result: PlannerResult; best: PlannerRoute }) {
  const layers = [
    ["Order"],
    [...new Set(result.routes.map((route) => route.plant))],
    [...new Set(result.routes.map((route) => route.originPort))],
    [...new Set(result.routes.map(carrierLabel))],
    [result.destinationPort],
  ];
  const titles = ["Customer order", "Warehouse", "Origin port", "Carrier · mode · service", "Destination port"];
  const rowGap = 34;
  const height = Math.max(...layers.map((layer) => layer.length)) * rowGap + 60;
  const columnX = [70, 250, 430, 640, 850];
  const position = (layer: number, name: string) => {
    const nodes = layers[layer];
    const top = (height - 30 - nodes.length * rowGap) / 2 + 30;
    return { x: columnX[layer], y: top + nodes.indexOf(name) * rowGap + rowGap / 2 };
  };
  const edges = new Map<string, { from: [number, string]; to: [number, string]; best: boolean }>();
  const add = (from: [number, string], to: [number, string], isBest: boolean) => {
    const key = `${from.join(":")}>${to.join(":")}`;
    const existing = edges.get(key);
    edges.set(key, { from, to, best: (existing?.best ?? false) || isBest });
  };
  result.routes.forEach((route) => {
    const isBest = route === best;
    add([0, "Order"], [1, route.plant], isBest);
    add([1, route.plant], [2, route.originPort], isBest);
    add([2, route.originPort], [3, carrierLabel(route)], isBest);
    add([3, carrierLabel(route)], [4, result.destinationPort], isBest);
  });
  const onPath = new Set([`0:Order`, `1:${best.plant}`, `2:${best.originPort}`, `3:${carrierLabel(best)}`, `4:${result.destinationPort}`]);
  const ordered = [...edges.values()].sort((left, right) => Number(left.best) - Number(right.best));

  return (
    <div className="chart-box scroll" style={{ padding: 8 }}>
      <svg viewBox={`0 0 960 ${height}`} style={{ width: "100%", minWidth: 760, display: "block" }} role="img" aria-label="Feasible route network with the optimal path highlighted">
        {titles.map((title, index) => (
          <text key={title} x={columnX[index]} y={16} textAnchor="middle" fontSize={12} fill="#555">{title}</text>
        ))}
        {ordered.map((edge) => {
          const from = position(...edge.from);
          const to = position(...edge.to);
          return <line key={`${edge.from.join(":")}>${edge.to.join(":")}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={edge.best ? "#1d4f91" : "#c8c8c8"} strokeWidth={edge.best ? 3.5 : 1} />;
        })}
        {layers.flatMap((nodes, layer) => nodes.map((name) => {
          const { x, y } = position(layer, name);
          const highlighted = onPath.has(`${layer}:${name}`);
          const width = layer === 3 ? 190 : 110;
          return (
            <g key={`${layer}:${name}`}>
              <rect x={x - width / 2} y={y - 11} width={width} height={22} fill={highlighted ? "#1d4f91" : "#fff"} stroke={highlighted ? "#1d4f91" : "#999"} />
              <text x={x} y={y + 4} textAnchor="middle" fontSize={11.5} fill={highlighted ? "#fff" : "#333"}>{name}</text>
            </g>
          );
        }))}
      </svg>
    </div>
  );
}

export function PlannerTab({ analysis }: { analysis: DashboardAnalysis }) {
  const { products, customers, sample } = analysis.planner;
  const [form, setForm] = useState<PlannerInput>({
    productId: sample.productId,
    customer: sample.customer,
    serviceLevel: sample.serviceLevel as PlannerInput["serviceLevel"],
    quantity: sample.quantity,
    weight: sample.weight,
    objective: "cost",
    dayValue: 50,
  });
  const [result, setResult] = useState<PlannerResult>();
  const [solvedFor, setSolvedFor] = useState<PlannerInput>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function plan() {
    setBusy(true);
    setError(undefined);
    try {
      if (!products.includes(form.productId)) throw new Error(`Product ${form.productId} is not stocked by any warehouse in ProductsPerPlant.`);
      setResult(await postJson<PlannerResult>("/api/plan", form));
      setSolvedFor(form);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Planning failed");
    } finally {
      setBusy(false);
    }
  }

  const set = <K extends keyof PlannerInput>(key: K, value: PlannerInput[K]) => setForm({ ...form, [key]: value });
  const best = result?.routes[0];
  const objective = objectives.find((item) => item.id === (solvedFor?.objective ?? form.objective))!;

  return (
    <>
      <h2>1. Plan a Single Order</h2>
      <p>
        Enter the details of a customer order and choose what the company wants to optimise. The page builds every feasible route for this order
        using the same rules as Problems 1 and 2 (product stock, VMI restrictions, warehouse-port links, carrier lanes and weight bands), prices
        each route, and picks the best one for the chosen objective. With only one order the warehouse capacity constraint cannot bind, so the
        feasible set is searched completely and the answer is exact.
      </p>

      <div className="controls">
        <div className="field">
          Product ID
          <SearchSelect label="Product" value={form.productId} options={products} onChange={(value) => set("productId", value)} />
        </div>
        <div className="field">
          Customer
          <SearchSelect label="Customer" value={form.customer} options={customers} onChange={(value) => set("customer", value)} width={230} />
        </div>
        <label>
          Service level
          <select value={form.serviceLevel} onChange={(event) => set("serviceLevel", event.target.value as PlannerInput["serviceLevel"])} style={{ marginTop: 2, padding: 4, width: 110 }}>
            <option value="DTD">DTD</option>
            <option value="DTP">DTP</option>
            <option value="CRF">CRF</option>
          </select>
        </label>
        <label>
          Unit quantity
          <input type="number" min={1} value={form.quantity} onChange={(event) => set("quantity", Number(event.target.value))} />
        </label>
        <label>
          Weight (kg)
          <input type="number" min={0.01} step={0.1} value={form.weight} onChange={(event) => set("weight", Number(event.target.value))} />
        </label>
      </div>

      <h3>Objective function</h3>
      <div className="controls" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
        {objectives.map((item) => (
          <label key={item.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, color: "#222", fontSize: 14 }}>
            <input type="radio" name="objective" checked={form.objective === item.id} onChange={() => set("objective", item.id)} style={{ width: "auto" }} />
            {item.label} <code>{item.formula}</code>
          </label>
        ))}
        {form.objective === "weighted" && (
          <label style={{ marginLeft: 24 }}>
            λ - value of one day of delivery time ($)
            <input type="number" min={0} value={form.dayValue} onChange={(event) => set("dayValue", Number(event.target.value))} />
          </label>
        )}
        <button className="run" disabled={busy} onClick={plan} style={{ marginTop: 6 }}>{busy ? "Searching..." : "Find optimal route"}</button>
      </div>
      {error && <p className="error">{error}</p>}

      {result && solvedFor && (
        result.routes.length === 0 ? (
          <p className="error">
            No feasible route exists for this order. Check the warehouse table below: the product may not be stocked anywhere this customer is
            allowed, or no carrier lane covers a {solvedFor.weight} kg shipment.
          </p>
        ) : best && (
          <>
            <h2>2. Optimal Route</h2>
            <div className="path">
              <div><small>Order</small>{solvedFor.productId}<span>{num(solvedFor.quantity)} units · {num(solvedFor.weight, 2)} kg · {solvedFor.serviceLevel}</span></div>
              <b>→</b>
              <div><small>Warehouse</small>{best.plant}<span>{dollars(best.warehouseCost)} warehouse cost</span></div>
              <b>→</b>
              <div><small>Origin port</small>{best.originPort}</div>
              <b>→</b>
              <div><small>Carrier</small>{best.carrier ?? "Customer"}<span>{best.carrier ? `${best.mode} · ${best.serviceLevel} · ${best.transitDays} day(s)` : "freight arranged by customer"}</span></div>
              <b>→</b>
              <div><small>Destination port</small>{result.destinationPort}<span>customer {solvedFor.customer}</span></div>
            </div>
            <table className="data" style={{ maxWidth: 560 }}>
              <tbody>
                <tr><th>Objective</th><td>{objective.label}{solvedFor.objective === "weighted" ? ` (λ = $${solvedFor.dayValue}/day)` : ""}</td></tr>
                <tr><th>Objective value</th><td>{objectiveValue(best, solvedFor.objective)}</td></tr>
                <tr><th>Warehouse cost</th><td>{dollars(best.warehouseCost)} ({num(solvedFor.quantity)} units)</td></tr>
                <tr><th>Freight cost</th><td>{best.carrier ? dollars(best.freightCost) : "paid by customer"}</td></tr>
                <tr><th>Total cost</th><td><b>{dollars(best.totalCost)}</b></td></tr>
                <tr><th>Transit time</th><td>{best.transitDays === null ? "decided by customer" : `${best.transitDays} day(s)`}</td></tr>
                <tr><th>Feasible routes compared</th><td>{num(result.routes.length)}</td></tr>
              </tbody>
            </table>
            <Caption>Table 1: Optimal route for the entered order</Caption>

            <h3>Network of feasible options</h3>
            <NetworkView result={result} best={best} />
            <Caption>Figure 1: Every feasible warehouse → port → carrier path for this order; the optimal path is highlighted</Caption>

            <h3>Ranking of feasible routes</h3>
            <div className="scroll">
              <table className="data">
                <thead>
                  <tr><th className="num">Rank</th><th className="solver">Warehouse</th><th className="solver">Origin port</th><th className="solver">Carrier</th><th className="solver">Mode</th><th>Service</th><th className="num">Transit (days)</th><th className="num">Warehouse cost</th><th className="num">Freight cost</th><th className="num">Total cost</th><th className="num">Objective</th></tr>
                </thead>
                <tbody>
                  {result.routes.slice(0, 15).map((route, index) => (
                    <tr key={`${route.plant}|${route.originPort}|${carrierLabel(route)}|${index}`} className={index === 0 ? "base" : undefined}>
                      <td className="num">{index + 1}{index === 0 ? " (optimal)" : ""}</td>
                      <td className="solver">{route.plant}</td>
                      <td className="solver">{route.originPort}</td>
                      <td className={route.carrier ? "solver" : undefined}>{route.carrier ?? "customer"}</td>
                      <td className={route.mode ? "solver" : undefined}>{route.mode ?? "-"}</td>
                      <td>{route.serviceLevel ?? "CRF"}</td>
                      <td className="num">{route.transitDays ?? "-"}</td>
                      <td className="num">{num(route.warehouseCost, 2)}</td>
                      <td className="num">{num(route.freightCost, 2)}</td>
                      <td className="num">{num(route.totalCost, 2)}</td>
                      <td className="num">{objectiveValue(route, solvedFor.objective)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Caption>Table 2: Best {Math.min(15, result.routes.length)} of {num(result.routes.length)} feasible routes under the chosen objective</Caption>
          </>
        )
      )}

      {result && (
        <>
          <h3>Which warehouses could serve this order?</h3>
          <table className="data">
            <thead><tr><th>Result</th><th className="num">Count</th><th>Warehouses</th></tr></thead>
            <tbody>
              {(["feasible", "no stock", "VMI restricted", "no port", "no freight lane"] as const).map((status) => {
                const plants = result.warehouses.filter((row) => row.status === status).map((row) => row.plant);
                if (plants.length === 0) return null;
                return (
                  <tr key={status}>
                    <td>{status === "feasible" ? <b>feasible</b> : `eliminated - ${status}`}</td>
                    <td className="num">{plants.length}</td>
                    <td>{plants.join(", ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Caption>Table 3: Feasibility filters applied to each warehouse for this order</Caption>
        </>
      )}
    </>
  );
}
