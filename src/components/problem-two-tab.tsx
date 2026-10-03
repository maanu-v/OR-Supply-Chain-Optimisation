"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { AssignmentTable, axisStyle, Caption, ChartBox, colours, money, num, pct, PlantLoadChart, postJson, ResultTable } from "@/components/common";
import { Sensitivity } from "@/components/sensitivity";
import type { DashboardAnalysis, SolveResponse } from "@/lib/analysis";
import { baseFactors, defaultGoal, targetScenarios, type GoalInput } from "@/lib/scenarios";

const fields: { key: keyof GoalInput; label: string; step: number; min: number; max: number }[] = [
  { key: "costBudgetPercent", label: "Cost target (% above Problem 1 optimum)", step: 0.5, min: 0, max: 50 },
  { key: "transitTarget", label: "Target avg transit (days)", step: 0.25, min: 0.1, max: 14 },
  { key: "costWeight", label: "Weight on cost goal", step: 0.5, min: 0, max: 100 },
  { key: "timeWeight", label: "Weight on time goal", step: 0.5, min: 0, max: 100 },
];

export function ProblemTwoTab({ analysis }: { analysis: DashboardAnalysis }) {
  const [draft, setDraft] = useState<GoalInput>(defaultGoal);
  const [goal, setGoal] = useState<GoalInput>(defaultGoal);
  const [result, setResult] = useState<SolveResponse>();
  const [solving, setSolving] = useState(false);
  const [error, setError] = useState<string>();
  const transit = analysis.transitDays;

  async function solve() {
    setSolving(true);
    setError(undefined);
    try {
      const solved = await postJson<SolveResponse>("/api/solve", { ...baseFactors, problem: "cost-time", goal: draft });
      setGoal(draft);
      setResult(solved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Solve failed");
    } finally {
      setSolving(false);
    }
  }

  const reference = result?.reference;
  const compare = result && reference && result.totalCost !== null && reference.totalCost !== null
    ? [
      { name: "Total cost", p1: money(reference.totalCost), p2: money(result.totalCost), change: pct(((result.totalCost - reference.totalCost) / reference.totalCost) * 100) },
      { name: "Average transit (days)", p1: reference.averageTransitDays?.toFixed(2) ?? "-", p2: result.averageTransitDays?.toFixed(2) ?? "-", change: reference.averageTransitDays && result.averageTransitDays !== null ? pct(((result.averageTransitDays - reference.averageTransitDays) / reference.averageTransitDays) * 100) : "-" },
    ]
    : [];

  return (
    <>
      <h2>1. Problem Statement</h2>
      <p className="question">
        How should the company balance transportation cost against delivery time when the two objectives point to different routes?
      </p>
      <table className="data">
        <thead><tr><th>Route A</th><th>Route B</th></tr></thead>
        <tbody>
          <tr>
            <td>Lower freight cost, longer transit. The slowest lanes take up to {transit.at(-1)?.days} days.</td>
            <td>Higher freight cost, shorter transit. The fastest lanes deliver in 0 to 3 days.</td>
          </tr>
        </tbody>
      </table>
      <Caption>Table 1: The two kinds of route that compete for each order</Caption>
      <p>
        Transit times in the freight data range from {transit[0]?.days} to {transit.at(-1)?.days} days, so the choice is real and measurable.
        A single cost objective (Problem 1) does not care about delivery time at all, which is not acceptable to customers. Goal programming lets
        the user set a target cost and a target delivery time and minimise the deviation from them.
      </p>
      <p><b>OR technique:</b> Weighted Goal Programming (multi-criteria decision making), on top of the same feasible routes and capacity constraints as Problem 1.</p>

      <h2>2. Model Formulation</h2>
      <p>Same variables <i>x<sub>or</sub></i>, demand constraints (3) and capacity constraints (4) as Problem 1. We add two goals with deviation variables.</p>
      <h3>Goals</h3>
      <div className="eq">
        Σ<sub><i>o</i></sub> Σ<sub><i>r</i></sub> <i>c<sub>or</sub> x<sub>or</sub></i> − <i>d<sub>C</sub></i><sup>+</sup> + <i>d<sub>C</sub></i><sup>−</sup> = <i>C</i>*
        <span className="tag">(6) cost goal</span>
      </div>
      <div className="eq">
        Σ<sub><i>o</i></sub> Σ<sub><i>r</i></sub> <i>t<sub>r</sub> x<sub>or</sub></i> − <i>d<sub>T</sub></i><sup>+</sup> + <i>d<sub>T</sub></i><sup>−</sup> = <i>T</i>* · <i>N</i>
        <span className="tag">(7) delivery-time goal</span>
      </div>
      <p>
        <i>C</i>* is the cost target (Problem 1 optimum plus an allowed budget %), <i>T</i>* the target average transit in days, <i>t<sub>r</sub></i> the
        transit days of route <i>r</i> and <i>N</i> the number of DTD/DTP orders (CRF transit is controlled by the customer, so it is excluded).
        <i> d</i><sup>+</sup> and <i>d</i><sup>−</sup> ≥ 0 are the over- and under-achievement of each goal.
      </p>
      <h3>Objective</h3>
      <div className="eq">
        Minimise &nbsp; <i>w<sub>C</sub></i> · <i>d<sub>C</sub></i><sup>+</sup> / <i>C</i>* &nbsp;+&nbsp; <i>w<sub>T</sub></i> · <i>d<sub>T</sub></i><sup>+</sup> / (<i>T</i>* <i>N</i>)
        <span className="tag">(8)</span>
      </div>
      <p>
        Only overshooting a target is penalised. Dividing by the target makes the two deviations unit-free so the weights <i>w<sub>C</sub></i>, <i>w<sub>T</sub></i>
        can be compared. When both goals can be met, a very small cost term (0.1%) is added so the cheapest of those plans is picked.
      </p>

      <h2>3. Results</h2>
      <p>Choose the targets and priorities, then solve. The default is: cost may be at most 5% above the Problem 1 optimum, and average transit should be 1 day.</p>
      <div className="controls">
        {fields.map((field) => (
          <label key={field.key}>
            {field.label}
            <input type="number" step={field.step} min={field.min} max={field.max} value={draft[field.key]} onChange={(event) => setDraft({ ...draft, [field.key]: Number(event.target.value) })} />
          </label>
        ))}
        <button className="run" disabled={solving} onClick={solve}>{solving ? "Solving..." : "Solve Problem 2"}</button>
        <button className="run secondary" disabled={solving} onClick={() => setDraft(defaultGoal)}>Reset</button>
      </div>
      <p className="note">The first solve also solves Problem 1 in the background to get the cost target.</p>
      {error && <p className="error">{error}</p>}

      {result && (
        <>
          <ResultTable result={result} />
          <Caption>Table 2: Summary of the goal programming plan</Caption>
          {result.goal && (
            <>
              <table className="data">
                <thead><tr><th>Goal</th><th className="num">Target</th><th className="num">Achieved</th><th className="num">Over-achievement d⁺</th><th className="num">Under-achievement d⁻</th><th className="num">Weight</th><th>Met?</th></tr></thead>
                <tbody>
                  <tr>
                    <td>Total cost</td>
                    <td className="num">{money(result.goal.costTarget)}</td>
                    <td className="num">{money(result.totalCost)}</td>
                    <td className="num">{money(Math.max(result.goal.costOver, 0))}</td>
                    <td className="num">{money(Math.max(result.goal.costUnder, 0))}</td>
                    <td className="num">{result.goal.costWeight}</td>
                    <td>{result.goal.costOver < 1 ? "yes" : "no"}</td>
                  </tr>
                  <tr>
                    <td>Average transit (days)</td>
                    <td className="num">{result.goal.transitTarget.toFixed(2)}</td>
                    <td className="num">{result.averageTransitDays?.toFixed(2) ?? "-"}</td>
                    <td className="num">{Math.max(result.goal.transitOver, 0).toFixed(3)}</td>
                    <td className="num">{Math.max(result.goal.transitUnder, 0).toFixed(3)}</td>
                    <td className="num">{result.goal.timeWeight}</td>
                    <td>{result.goal.transitOver < 0.001 ? "yes" : "no"}</td>
                  </tr>
                </tbody>
              </table>
              <Caption>Table 3: Goal attainment</Caption>
            </>
          )}
          {compare.length > 0 && (
            <>
              <h3>Comparison with Problem 1</h3>
              <table className="data">
                <thead><tr><th>Measure</th><th className="num">Problem 1 (min cost)</th><th className="num">Problem 2 (goal programme)</th><th className="num">Change</th></tr></thead>
                <tbody>{compare.map((row) => <tr key={row.name}><td>{row.name}</td><td className="num">{row.p1}</td><td className="num">{row.p2}</td><td className="num">{row.change}</td></tr>)}</tbody>
              </table>
              <Caption>Table 4: Cost paid for faster delivery</Caption>
            </>
          )}
          {result.totalCost !== null && (
            <>
              <div className="two-col">
                <figure>
                  <ChartBox height={240}>
                    <BarChart data={result.carrierSplit} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                      <CartesianGrid stroke="#e3e3e3" vertical={false} />
                      <XAxis dataKey="carrier" tick={axisStyle} />
                      <YAxis tick={axisStyle} />
                      <Tooltip />
                      <Bar dataKey="orders" name="Orders" fill={colours.orange} />
                    </BarChart>
                  </ChartBox>
                  <Caption>Figure 1: Carrier selected for DTD/DTP orders</Caption>
                </figure>
                <figure>
                  <ChartBox height={240}>
                    <BarChart data={transitHistogram(result)} margin={{ top: 8, right: 12, bottom: 14, left: 4 }}>
                      <CartesianGrid stroke="#e3e3e3" vertical={false} />
                      <XAxis dataKey="days" tick={axisStyle} label={{ value: "transit days", position: "insideBottom", offset: -8, fontSize: 12 }} />
                      <YAxis tick={axisStyle} />
                      <Tooltip />
                      <Bar dataKey="orders" name="Orders" fill={colours.blue} />
                    </BarChart>
                  </ChartBox>
                  <Caption>Figure 2: Transit time of the chosen routes</Caption>
                </figure>
              </div>
              <PlantLoadChart result={result} figure="Figure 3" />
              <h3>Order-level plan</h3>
              <AssignmentTable assignments={result.assignments} table="Table 5" />
            </>
          )}
        </>
      )}

      <h2>4. Sensitivity Analysis</h2>
      <p className="question">How robust is the compromise plan, and how much does each extra day of speed cost?</p>
      <p>
        Uses the goal settings of the last solve (cost target +{goal.costBudgetPercent}%, transit target {goal.transitTarget} days, weights{" "}
        {goal.costWeight} : {goal.timeWeight}). {num(targetScenarios.length)} extra solves vary the transit target.
      </p>
      <Sensitivity key={JSON.stringify(goal)} problem="cost-time" goal={goal} extra={targetScenarios} section="4" firstFigure={4} firstTable={6} />
    </>
  );
}

function transitHistogram(result: SolveResponse) {
  const counts = new Map<number, number>();
  result.assignments.forEach((row) => {
    if (row.transitDays !== null) counts.set(row.transitDays, (counts.get(row.transitDays) ?? 0) + 1);
  });
  return [...counts].map(([days, orders]) => ({ days, orders })).sort((left, right) => left.days - right.days);
}
