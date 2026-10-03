"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { AssignmentTable, axisStyle, Caption, ChartBox, colours, num, PlantLoadChart, postJson, ResultTable } from "@/components/common";
import { Sensitivity } from "@/components/sensitivity";
import type { DashboardAnalysis, SolveResponse } from "@/lib/analysis";
import { baseFactors } from "@/lib/scenarios";

export function ProblemOneTab({ analysis }: { analysis: DashboardAnalysis }) {
  const [result, setResult] = useState<SolveResponse>();
  const [solving, setSolving] = useState(false);
  const [error, setError] = useState<string>();

  async function solve() {
    setSolving(true);
    setError(undefined);
    try {
      setResult(await postJson<SolveResponse>("/api/solve", { ...baseFactors, problem: "minimum-cost" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Solve failed");
    } finally {
      setSolving(false);
    }
  }

  return (
    <>
      <h2>1. Problem Statement</h2>
      <p className="question">
        Which warehouse, origin port and carrier should be assigned to each order so that total logistics cost is minimised?
      </p>
      <p>
        Every order must be assigned exactly one warehouse, one origin port and one carrier. The assignment must respect capacity, product
        availability, customer and connectivity restrictions. The historical dataset records what was done, not what was optimal, so we
        convert the business problem into an Operations Research model.
      </p>
      <p><b>OR technique:</b> Integer Programming (binary assignment model), solved with branch-and-bound using the HiGHS solver.</p>

      <h2>2. Model Formulation</h2>
      <h3>Sets and parameters</h3>
      <ul className="plain">
        <li><i>O</i> - set of customer orders ({num(analysis.source.orders)}), <i>P</i> - set of warehouses ({analysis.source.warehouses})</li>
        <li><i>R<sub>o</sub></i> - feasible routes (warehouse, origin port, carrier, service, mode) for order <i>o</i>, after all joins in the Dataset tab</li>
        <li><i>q<sub>o</sub></i> unit quantity, <i>w<sub>o</sub></i> weight of order <i>o</i></li>
        <li><i>h<sub>p</sub></i> cost per unit at warehouse <i>p</i>, <i>K<sub>p</sub></i> daily order capacity of warehouse <i>p</i></li>
        <li><i>f<sub>r</sub></i> freight rate of the weight band, <i>m<sub>r</sub></i> minimum charge of route <i>r</i></li>
        <li><i>H</i> = {analysis.feasibility.minimumHorizon} days, the planning horizon (see capacity check on the Dataset tab)</li>
      </ul>

      <h3>Decision variables</h3>
      <div className="eq">
        <i>x<sub>or</sub></i> = 1 if order <i>o</i> is shipped using route <i>r</i> ∈ <i>R<sub>o</sub></i>, otherwise 0
      </div>
      <p>One binary variable is created for every feasible order-warehouse-port-carrier combination ({num(analysis.feasibility.candidateRoutes)} in total).</p>

      <h3>Objective function</h3>
      <div className="eq">
        Minimise &nbsp; Z = Σ<sub><i>o</i>∈<i>O</i></sub> Σ<sub><i>r</i>∈<i>R<sub>o</sub></i></sub> <i>c<sub>or</sub> x<sub>or</sub></i>
        <span className="tag">(1)</span>
      </div>
      <div className="eq">
        <i>c<sub>or</sub></i> = <i>q<sub>o</sub> h<sub>p(r)</sub></i> &nbsp;+&nbsp; max( <i>m<sub>r</sub></i>, <i>w<sub>o</sub> f<sub>r</sub></i> )
        &nbsp;&nbsp;&nbsp; (DTD / DTP orders) &nbsp;&nbsp;&nbsp; <i>c<sub>or</sub></i> = <i>q<sub>o</sub> h<sub>p(r)</sub></i> &nbsp;&nbsp;&nbsp; (CRF orders)
        <span className="tag">(2)</span>
      </div>
      <p>
        i.e. Total Cost = Warehouse Cost + Transportation Cost. Warehouse cost is unit quantity × cost per unit of the assigned warehouse;
        transportation cost is shipment weight × rate of the applicable weight band, raised to the minimum charge when it falls below it.
      </p>

      <h3>Constraints</h3>
      <div className="eq">
        Σ<sub><i>r</i>∈<i>R<sub>o</sub></i></sub> <i>x<sub>or</sub></i> = 1 &nbsp;&nbsp;&nbsp; ∀ <i>o</i> ∈ <i>O</i>
        <span className="tag">(3) demand satisfaction</span>
      </div>
      <div className="eq">
        Σ<sub><i>o</i></sub> Σ<sub><i>r</i>∈<i>R<sub>o</sub></i> : <i>p(r)</i> = <i>p</i></sub> <i>x<sub>or</sub></i> ≤ <i>H · K<sub>p</sub></i> &nbsp;&nbsp;&nbsp; ∀ <i>p</i> ∈ <i>P</i>
        <span className="tag">(4) warehouse capacity</span>
      </div>
      <div className="eq">
        <i>x<sub>or</sub></i> ∈ {"{0, 1}"}
        <span className="tag">(5)</span>
      </div>
      <p>
        Product availability, VMI customer restrictions, port connectivity, carrier lanes and weight bands are not written as separate
        constraints - routes that break them are never generated, so they do not appear in <i>R<sub>o</sub></i>.
      </p>
      <div className="note">
        Implementation detail: for each order and warehouse we only keep the cheapest route (capacity only depends on the warehouse), which
        makes the model much smaller without changing the optimum.
      </div>

      <h2>3. Results</h2>
      <p>
        <button className="run" disabled={solving} onClick={solve}>{solving ? "Solving..." : result ? "Solve again" : "Solve Problem 1"}</button>
      </p>
      {error && <p className="error">{error}</p>}
      {result && (
        <>
          <ResultTable result={result} />
          <Caption>Table 1: Summary of the minimum-cost logistics plan</Caption>
          {result.totalCost !== null && (
            <>
              <p>
                Warehouse cost makes up {(((result.warehouseCost ?? 0) / result.totalCost) * 100).toFixed(1)}% of the total, so the choice of
                warehouse drives the cost far more than the choice of carrier.
              </p>
              <PlantLoadChart result={result} figure="Figure 1" />
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
                <Caption>Figure 2: Carrier selected for DTD/DTP orders in the optimal plan</Caption>
              </figure>
              <h3>Order-level plan</h3>
              <AssignmentTable assignments={result.assignments} table="Table 2" />
            </>
          )}
        </>
      )}

      <h2>4. Sensitivity Analysis</h2>
      <p className="question">If a key parameter changes, does the optimal plan stay optimal, and at what point does the routing decision actually flip?</p>
      <Sensitivity problem="minimum-cost" section="4" firstFigure={3} firstTable={3} />
    </>
  );
}
