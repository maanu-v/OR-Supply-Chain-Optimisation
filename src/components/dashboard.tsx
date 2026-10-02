"use client";

import { useMemo, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, CheckCircle2, Database, Factory, LoaderCircle, Route, SlidersHorizontal, Truck, Waves } from "lucide-react";
import { HorizontalBars, SensitivityLine } from "@/components/charts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DashboardAnalysis } from "@/lib/analysis";

const chartColors = ["#1d4ed8", "#0f766e", "#d97706", "#9333ea", "#e11d48", "#475569"];

type SolveView = { status: string; horizonDays: number | null; objectiveCost: number | null; assignments: unknown[]; plantLoads: Record<string, number>; message?: string };

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
  const [capacityFactor, setCapacityFactor] = useState(1);
  const [freightRateFactor, setFreightRateFactor] = useState(1);
  const [warehouseCostFactor, setWarehouseCostFactor] = useState(1);
  const [transitPriority, setTransitPriority] = useState(0);

  const capacityChart = useMemo(() => analysis.capacity.slice(0, 8).reverse(), [analysis]);

  async function runScenario() {
    setSolving(true);
    setSolveResult(undefined);
    try {
      const response = await fetch("/api/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capacityFactor, freightRateFactor, warehouseCostFactor, transitPriority }),
      });
      const body = await response.json() as SolveView;
      if (!response.ok) throw new Error(body.message ?? "Solver request failed.");
      setSolveResult(body);
    } catch (cause) {
      setSolveResult({ status: "error", horizonDays: null, objectiveCost: null, assignments: [], plantLoads: {}, message: cause instanceof Error ? cause.message : "Solver request failed." });
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
            <div className="grid gap-4 lg:grid-cols-2">
              <Card><CardHeader><CardTitle>Route options by transport mode</CardTitle><CardDescription>Candidate DTD/DTP freight routes after origin, destination, and weight-band matching.</CardDescription></CardHeader><CardContent><HorizontalBars data={analysis.modeMix} valueKey="routes" color="bg-teal-700" /></CardContent></Card>
              <Card><CardHeader><CardTitle>Largest carrier option pools</CardTitle><CardDescription>Available route count, not a selected shipment allocation.</CardDescription></CardHeader><CardContent><HorizontalBars data={analysis.carrierMix.slice(0, 7)} valueKey="routes" color="bg-violet-700" /></CardContent></Card>
            </div>
            <Card><CardHeader><CardTitle>Capacity criticality</CardTitle><CardDescription>Minimum days is a lower bound from orders forced to one plant. Plant 03 drives the baseline horizon.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="pb-3 font-medium">Plant</th><th className="pb-3 font-medium">Daily capacity</th><th className="pb-3 font-medium">Exclusive orders</th><th className="pb-3 font-medium">Minimum days</th></tr></thead><tbody>{analysis.capacity.slice(0, 8).map((row) => <tr key={row.plant} className="border-b border-slate-100"><td className="py-3 font-medium">{row.plant}</td><td className="py-3">{formatNumber(row.dailyCapacity)}</td><td className="py-3">{formatNumber(row.exclusiveOrders)}</td><td className="py-3"><Badge tone={row.minimumDaysForExclusiveOrders >= 7 ? "warning" : "neutral"}>{row.minimumDaysForExclusiveOrders || "—"}</Badge></td></tr>)}</tbody></table></div></CardContent></Card>
          </TabsContent>

          <TabsContent value="optimise"><div className="grid gap-4 lg:grid-cols-5"><Card className="lg:col-span-2"><CardHeader><CardTitle>Scenario controls</CardTitle><CardDescription>Each run re-solves route choices after adjusting the selected parameters.</CardDescription></CardHeader><CardContent className="space-y-5"><label className="block text-sm font-medium">Capacity multiplier <span className="float-right text-slate-500">{capacityFactor.toFixed(2)}×</span><input aria-label="Capacity multiplier" className="mt-2 w-full accent-slate-950" type="range" min="0.8" max="1.2" step="0.1" value={capacityFactor} onChange={(event) => setCapacityFactor(Number(event.target.value))} /></label><label className="block text-sm font-medium">Freight-rate multiplier <span className="float-right text-slate-500">{freightRateFactor.toFixed(2)}×</span><input aria-label="Freight rate multiplier" className="mt-2 w-full accent-slate-950" type="range" min="1" max="1.2" step="0.1" value={freightRateFactor} onChange={(event) => setFreightRateFactor(Number(event.target.value))} /></label><label className="block text-sm font-medium">Warehouse-cost multiplier <span className="float-right text-slate-500">{warehouseCostFactor.toFixed(2)}×</span><input aria-label="Warehouse cost multiplier" className="mt-2 w-full accent-slate-950" type="range" min="0.8" max="1.2" step="0.1" value={warehouseCostFactor} onChange={(event) => setWarehouseCostFactor(Number(event.target.value))} /></label><label className="block text-sm font-medium">Transit priority <span className="float-right text-slate-500">{transitPriority}</span><input aria-label="Transit priority" className="mt-2 w-full accent-slate-950" type="range" min="0" max="100" step="10" value={transitPriority} onChange={(event) => setTransitPriority(Number(event.target.value))} /></label><button onClick={runScenario} disabled={solving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60">{solving ? <LoaderCircle className="animate-spin" size={17} /> : <SlidersHorizontal size={17} />}{solving ? "Solving scenario" : "Solve scenario"}</button></CardContent></Card><Card className="lg:col-span-3"><CardHeader><CardTitle>Optimisation result</CardTitle><CardDescription>The cost model selects one feasible route per order within the minimum feasible horizon for the selected capacity.</CardDescription></CardHeader><CardContent>{!solveResult ? <EmptyChart label="Set a scenario and run the solver." /> : <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-slate-50 p-4"><p className="text-xs text-slate-500">Status</p><p className="mt-1 font-semibold capitalize">{solveResult.status}</p></div><div className="rounded-lg bg-slate-50 p-4"><p className="text-xs text-slate-500">Planning horizon</p><p className="mt-1 font-semibold">{solveResult.horizonDays ?? "—"} days</p></div><div className="rounded-lg bg-slate-50 p-4"><p className="text-xs text-slate-500">Objective score</p><p className="mt-1 font-semibold">{solveResult.objectiveCost ? `$${formatNumber(Math.round(solveResult.objectiveCost))}` : "—"}</p></div></div>{solveResult.message ? <p className="rounded-lg bg-rose-50 p-4 text-sm text-rose-800">{solveResult.message}</p> : <><p className="text-sm text-slate-600">{formatNumber(solveResult.assignments.length)} orders assigned. Objective includes the configured transit-priority penalty when it is non-zero.</p><HorizontalBars data={Object.entries(solveResult.plantLoads).map(([plant, orders]) => ({ plant, orders }))} valueKey="orders" /></>}</div>}</CardContent></Card></div></TabsContent>

          <TabsContent value="sensitivity" className="space-y-4"><div className="grid gap-4 lg:grid-cols-5"><Card className="lg:col-span-3"><CardHeader><CardTitle>Capacity sensitivity</CardTitle><CardDescription>Each scenario recomputes the shortest horizon that can serve every order.</CardDescription></CardHeader><CardContent><SensitivityLine data={analysis.sensitivity} /></CardContent></Card><Card className="lg:col-span-2"><CardHeader><CardTitle>What changed?</CardTitle><CardDescription>Capacity at the bottleneck has non-linear planning effects.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex items-start gap-3"><ArrowDownRight className="mt-0.5 text-rose-600" size={18} /><p className="text-sm leading-5 text-slate-600">A 20% capacity reduction increases the feasible plan from seven to nine days.</p></div><div className="flex items-start gap-3"><ArrowUpRight className="mt-0.5 text-emerald-600" size={18} /><p className="text-sm leading-5 text-slate-600">A 20% increase reduces the plan to six days; a 10% increase does not.</p></div><div className="flex items-start gap-3"><Activity className="mt-0.5 text-blue-600" size={18} /><p className="text-sm leading-5 text-slate-600">`PLANT03` holds 6,868 exclusive orders and remains the main expansion candidate.</p></div></CardContent></Card></div><Card><CardHeader><CardTitle>Scenario table</CardTitle><CardDescription>Capacity is floored to whole order slots before feasibility is solved.</CardDescription></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-5">{analysis.sensitivity.map((scenario) => <div key={scenario.label} className="rounded-lg border border-slate-200 p-4"><p className="text-sm font-semibold">{scenario.label}</p><p className="mt-4 text-2xl font-semibold">{scenario.minimumHorizon}</p><p className="text-xs text-slate-500">days required</p><p className="mt-3 text-xs text-slate-500">{formatNumber(scenario.dailyCapacity)} orders/day</p></div>)}</div></CardContent></Card></TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
