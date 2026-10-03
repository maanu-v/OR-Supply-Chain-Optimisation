"use client";

import { useMemo, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, CheckCircle2, Database, Factory, LoaderCircle, Route, SlidersHorizontal, Truck, Waves } from "lucide-react";
import { HorizontalBars, SensitivityLine } from "@/components/charts";
import { DatasetGuide } from "@/components/dataset-guide";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ConstraintStabilityRow, DashboardAnalysis } from "@/lib/analysis";
import type { Assignment } from "@/lib/types";

const optimisationProblems = [
  { id: "minimum-cost", name: "1. Minimum-cost logistics assignment", detail: "Assign every order to its least-cost feasible warehouse, port, and carrier route." },
  { id: "cost-time", name: "2. Cost vs delivery time", detail: "Balance company logistics cost against faster company-controlled transit routes." },
] as const;

type Problem = typeof optimisationProblems[number];
type SolveView = { status: string; horizonDays: number | null; objectiveCost: number | null; companyCost: number | null; averageTransitDays: number | null; timePenalty?: number; assignments: Assignment[]; plantLoads: Record<string, number>; constraints: ConstraintStabilityRow[]; message?: string };

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Database }) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between pt-5">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
          <p className="mt-2 text-xs text-slate-500">{detail}</p>
        </div>
        <span className="rounded-lg bg-slate-100 p-2.5 text-slate-600"><Icon size={19} /></span>
      </CardContent>
    </Card>
  );
}

function EmptyChart({ label }: { label: string }) {
  return <div className="grid h-64 place-items-center text-sm text-slate-400">{label}</div>;
}

export function Dashboard({ initialAnalysis }: { initialAnalysis: DashboardAnalysis }) {
  const [analysis] = useState(initialAnalysis);
  const [solving, setSolving] = useState(false);
  const [solveResult, setSolveResult] = useState<SolveView>();
  const [selectedProblemId, setSelectedProblemId] = useState<Problem["id"]>("minimum-cost");
  const [assignmentQuery, setAssignmentQuery] = useState("");
  const [assignmentPage, setAssignmentPage] = useState(0);

  const capacityChart = useMemo(() => analysis.capacity.slice(0, 8).reverse(), [analysis]);
  const selectedProblem = optimisationProblems.find((problem) => problem.id === selectedProblemId) ?? optimisationProblems[0];
  const matchingAssignments = useMemo(() => {
    const query = assignmentQuery.trim().toLowerCase();
    if (!solveResult || query.length === 0) return solveResult?.assignments ?? [];
    return solveResult.assignments.filter((assignment) => [assignment.orderId, assignment.plant, assignment.originPort, assignment.carrier ?? "", assignment.mode ?? ""].some((value) => value.toLowerCase().includes(query)));
  }, [assignmentQuery, solveResult]);
  const assignmentPageSize = 50;
  const visibleAssignments = matchingAssignments.slice(assignmentPage * assignmentPageSize, (assignmentPage + 1) * assignmentPageSize);
  const assignmentPageCount = Math.max(1, Math.ceil(matchingAssignments.length / assignmentPageSize));

  async function runScenario() {
    setSolving(true);
    setSolveResult(undefined);
    setAssignmentQuery("");
    setAssignmentPage(0);
    try {
      const response = await fetch("/api/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem: selectedProblem.id, capacityFactor: 1, freightRateFactor: 1, warehouseCostFactor: 1 }),
      });
      const body = await response.json() as SolveView;
      if (!response.ok) throw new Error(body.message ?? "Solver request failed.");
      setSolveResult(body);
    } catch (cause) {
      setSolveResult({ status: "error", horizonDays: null, objectiveCost: null, companyCost: null, averageTransitDays: null, assignments: [], plantLoads: {}, constraints: [], message: cause instanceof Error ? cause.message : "Solver request failed." });
    } finally {
      setSolving(false);
    }
  }


  const baseline = analysis.sensitivity.find((scenario) => scenario.capacityFactor === 1);
  return (
    <main className="min-h-screen bg-[#f7f8fa] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-slate-950 text-white"><Waves size={21} /></span>
            <div><p className="text-sm font-semibold tracking-tight">Flowline</p><p className="text-xs text-slate-500">Outbound network decisions</p></div>
          </div>
          <div className="flex items-center gap-3"><Badge tone="success"><CheckCircle2 className="mr-1" size={13} />Source-validated</Badge><span className="text-sm text-slate-500">Planning horizon · {baseline?.minimumHorizon ?? "—"} days</span></div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-9">
        <section className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div><p className="text-sm font-medium text-blue-700">Supply chain optimisation</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Route decisions with capacity reality.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">The model builds only feasible warehouse, port, and freight options, then checks whether daily processing capacity can fulfil every order.</p></div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-right"><p className="text-xs text-slate-500">Minimum feasible plan</p><p className="text-xl font-semibold">{baseline?.minimumHorizon} days</p></div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Orders" value={formatNumber(analysis.source.orders)} detail="All workbook demand rows" icon={Database} />
          <Metric label="Candidate routes" value={formatNumber(analysis.feasibility.candidateRoutes)} detail="After all hard feasibility filters" icon={Route} />
          <Metric label="Forced orders" value={formatNumber(analysis.feasibility.exclusiveOrders)} detail="Orders with exactly one eligible plant" icon={Factory} />
          <Metric label="CRF orders" value={formatNumber(analysis.source.crfOrders)} detail="Warehouse cost only; customer freight" icon={Truck} />
        </section>

        <Tabs defaultValue="overview" className="mt-9">
          <TabsList className="mb-6 max-w-full overflow-x-auto"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="data">Dataset analysis</TabsTrigger><TabsTrigger value="optimise">Optimisation</TabsTrigger><TabsTrigger value="sensitivity">Sensitivity</TabsTrigger></TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-5">
              <Card className="lg:col-span-3">
                <CardHeader><CardTitle>Capacity bottlenecks</CardTitle><CardDescription>Exclusive orders cannot be transferred to another eligible warehouse.</CardDescription></CardHeader>
                <CardContent>{capacityChart.length ? <HorizontalBars data={capacityChart} valueKey="exclusiveOrders" /> : <EmptyChart label="No plant data" />}</CardContent>
              </Card>
              <Card className="lg:col-span-2"><CardHeader><CardTitle>Model health</CardTitle><CardDescription>Checks run before optimisation.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="rounded-lg bg-emerald-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Route coverage</p><p className="mt-1 text-2xl font-semibold text-emerald-950">{analysis.source.orders - analysis.feasibility.zeroCandidateOrders} / {analysis.source.orders}</p><p className="mt-1 text-sm text-emerald-800">Orders have at least one valid route.</p></div><div className="flex justify-between border-b border-slate-100 pb-3 text-sm"><span className="text-slate-500">Duplicate freight rows removed</span><span className="font-medium">{analysis.source.duplicateFreightRowsRemoved}</span></div><div className="flex justify-between text-sm"><span className="text-slate-500">Source freight-rate rows</span><span className="font-medium">{formatNumber(analysis.source.freightRates)}</span></div></CardContent></Card>
            </div>
            <Card><CardHeader><CardTitle>Decision sequence</CardTitle><CardDescription>Feasibility comes before cost; capacity comes before a promise of fulfilment.</CardDescription></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-4">{[["01", "Validate", "Workbook structure, numeric fields, relationships"], ["02", "Generate", "Eligible routes and route-level costs"], ["03", "Prove", "Minimum days under plant capacities"], ["04", "Optimise", "Lowest-cost assignment for the feasible horizon"]].map(([number, title, detail]) => <div key={number} className="rounded-lg border border-slate-200 p-4"><span className="text-xs font-semibold text-blue-700">{number}</span><p className="mt-3 font-semibold">{title}</p><p className="mt-1 text-sm leading-5 text-slate-500">{detail}</p></div>)}</div></CardContent></Card>
          </TabsContent>

          <TabsContent value="data" className="space-y-4">
            <DatasetGuide dataset={analysis.dataset} />
          </TabsContent>

          <TabsContent value="optimise" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Optimisation problems</CardTitle><CardDescription>Choose one of the two required OR models. Both use the same feasible-route network and seven-day capacity horizon.</CardDescription></CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2">{optimisationProblems.map((problem) => <button key={problem.id} onClick={() => { setSelectedProblemId(problem.id); setAssignmentPage(0); }} className={`rounded-lg border p-5 text-left transition ${problem.id === selectedProblem.id ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white hover:border-slate-400"}`}><p className="text-sm font-semibold">{problem.name}</p><p className={`mt-2 text-sm leading-5 ${problem.id === selectedProblem.id ? "text-slate-300" : "text-slate-500"}`}>{problem.detail}</p></button>)}</div>
                <button onClick={runScenario} disabled={solving} className="mt-5 flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60">{solving ? <LoaderCircle className="animate-spin" size={17} /> : <SlidersHorizontal size={17} />}{solving ? `Solving ${selectedProblem.name}` : `Solve ${selectedProblem.name}`}</button>
              </CardContent>
            </Card>
            {solveResult && <><Card><CardHeader><CardTitle>Optimisation result</CardTitle><CardDescription>{selectedProblem.name} — selected route assignments are listed below.</CardDescription></CardHeader><CardContent>{solveResult.message ? <p className="rounded-lg bg-rose-50 p-4 text-sm text-rose-800">{solveResult.message}</p> : <div className="grid gap-3 sm:grid-cols-5"><div className="rounded-lg bg-slate-50 p-4"><p className="text-xs text-slate-500">Status</p><p className="mt-1 font-semibold capitalize">{solveResult.status}</p></div><div className="rounded-lg bg-slate-50 p-4"><p className="text-xs text-slate-500">Planning horizon</p><p className="mt-1 font-semibold">{solveResult.horizonDays} days</p></div><div className="rounded-lg bg-slate-50 p-4"><p className="text-xs text-slate-500">Company logistics cost</p><p className="mt-1 font-semibold">${formatNumber(Math.round(solveResult.companyCost ?? 0))}</p></div><div className="rounded-lg bg-slate-50 p-4"><p className="text-xs text-slate-500">Average transit</p><p className="mt-1 font-semibold">{solveResult.averageTransitDays?.toFixed(2) ?? "—"} days</p></div><div className="rounded-lg bg-slate-50 p-4"><p className="text-xs text-slate-500">Assigned orders</p><p className="mt-1 font-semibold">{formatNumber(solveResult.assignments.length)}</p></div></div>}</CardContent></Card>
            {solveResult.assignments.length > 0 && <Card><CardHeader><CardTitle>Order route assignments</CardTitle><CardDescription>Search any order ID, plant, origin port, carrier, or mode. Results are paginated to keep the dashboard responsive.</CardDescription></CardHeader><CardContent><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><input aria-label="Search route assignments" value={assignmentQuery} onChange={(event) => { setAssignmentQuery(event.target.value); setAssignmentPage(0); }} placeholder="Search order, plant, port, carrier…" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950 sm:max-w-sm" /><p className="text-sm text-slate-500">{formatNumber(matchingAssignments.length)} matching assignments</p></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="pb-3 font-medium">Order</th><th className="pb-3 font-medium">Plant</th><th className="pb-3 font-medium">Origin port</th><th className="pb-3 font-medium">Carrier / mode</th><th className="pb-3 font-medium">Transit</th><th className="pb-3 text-right font-medium">Warehouse</th><th className="pb-3 text-right font-medium">Freight</th><th className="pb-3 text-right font-medium">Total</th></tr></thead><tbody>{visibleAssignments.map((assignment) => <tr key={assignment.routeId} className="border-b border-slate-100"><td className="py-3 font-mono text-xs">{assignment.orderId}</td><td className="py-3 font-medium">{assignment.plant}</td><td className="py-3">{assignment.originPort}</td><td className="py-3">{assignment.carrier ? `${assignment.carrier} · ${assignment.mode}` : "CRF · customer freight"}</td><td className="py-3">{assignment.transitDays === null ? "—" : `${assignment.transitDays} days`}</td><td className="py-3 text-right">${formatNumber(Math.round(assignment.warehouseCost))}</td><td className="py-3 text-right">${formatNumber(Math.round(assignment.freightCost))}</td><td className="py-3 text-right font-medium">${formatNumber(Math.round(assignment.totalCost))}</td></tr>)}</tbody></table></div><div className="mt-4 flex items-center justify-between text-sm"><button disabled={assignmentPage === 0} onClick={() => setAssignmentPage((page) => page - 1)} className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40">Previous</button><span className="text-slate-500">Page {assignmentPage + 1} of {assignmentPageCount}</span><button disabled={assignmentPage >= assignmentPageCount - 1} onClick={() => setAssignmentPage((page) => page + 1)} className="rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40">Next</button></div></CardContent></Card>}</>}
          </TabsContent>

          <TabsContent value="sensitivity" className="space-y-4">
            <Card><CardHeader><CardTitle>Sensitivity report</CardTitle><CardDescription>Excel allowable-increase and shadow-price reports apply to continuous LPs. Both project models are binary route-assignment problems, so this report shows exact constraint usage and the guaranteed no-change capacity decrease for the current selected plan.</CardDescription></CardHeader><CardContent>{!solveResult ? <EmptyChart label="Solve either optimisation problem to generate its sensitivity report." /> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="pb-3">Plant capacity constraint</th><th className="pb-3 text-right">Used orders</th><th className="pb-3 text-right">RHS over horizon</th><th className="pb-3 text-right">Slack</th><th className="pb-3 text-right">Guaranteed decrease</th><th className="pb-3 text-right">Decrease %</th></tr></thead><tbody>{solveResult.constraints.map((constraint) => <tr key={constraint.plant} className="border-b border-slate-100"><td className="py-3 font-medium">{constraint.plant}</td><td className="py-3 text-right">{formatNumber(constraint.used)}</td><td className="py-3 text-right">{formatNumber(constraint.rhs)}</td><td className="py-3 text-right">{formatNumber(constraint.slack)}</td><td className="py-3 text-right">{formatNumber(constraint.guaranteedDecrease)}</td><td className="py-3 text-right">{constraint.guaranteedDecreasePercent.toFixed(1)}%</td></tr>)}</tbody></table></div>}</CardContent></Card>
            <div className="grid gap-4 lg:grid-cols-5"><Card className="lg:col-span-3"><CardHeader><CardTitle>Network capacity scenarios</CardTitle><CardDescription>Independent feasibility re-solves show when all orders require another planning day.</CardDescription></CardHeader><CardContent><SensitivityLine data={analysis.sensitivity} /></CardContent></Card><Card className="lg:col-span-2"><CardHeader><CardTitle>How to read this</CardTitle><CardDescription>Applies to both optimisation problems.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm leading-5 text-slate-600"><p><strong className="text-slate-900">Guaranteed decrease</strong> is the current constraint slack: the current solution remains feasible and optimal if capacity falls by no more than this amount.</p><p><strong className="text-slate-900">Capacity increases</strong> can unlock cheaper or faster routes, so the system re-solves scenarios instead of reporting an invalid LP shadow price.</p><p>Baseline feasibility requires <strong className="text-slate-900">7 days</strong>; −20% capacity requires 9 days and +20% requires 6 days.</p></CardContent></Card></div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
