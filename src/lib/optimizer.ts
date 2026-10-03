import loadHighs from "highs";
import type { Assignment, Route, SolveResult, Warehouse } from "@/lib/types";

type Highs = Awaited<ReturnType<typeof loadHighs>>;
let solverPromise: Promise<Highs> | undefined;

async function solver() {
  solverPromise ??= loadHighs();
  return solverPromise;
}

/** Writes `coef var` terms in CPLEX LP syntax. */
function terms(items: { name: string; coef: number }[]) {
  return items.map(({ name, coef }, index) => `${coef < 0 ? "-" : index === 0 ? "" : "+"} ${Math.abs(coef)} ${name}`).join(" ");
}

class Dinic {
  private readonly graph: { to: number; reverse: number; capacity: number }[][];

  constructor(size: number) {
    this.graph = Array.from({ length: size }, () => []);
  }

  addEdge(from: number, to: number, capacity: number) {
    const forward = { to, reverse: this.graph[to].length, capacity };
    const backward = { to: from, reverse: this.graph[from].length, capacity: 0 };
    this.graph[from].push(forward);
    this.graph[to].push(backward);
  }

  maxFlow(source: number, sink: number) {
    let total = 0;
    for (;;) {
      const level = Array(this.graph.length).fill(-1) as number[];
      const queue = [source];
      level[source] = 0;
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const node = queue[cursor];
        for (const edge of this.graph[node]) {
          if (edge.capacity > 0 && level[edge.to] === -1) {
            level[edge.to] = level[node] + 1;
            queue.push(edge.to);
          }
        }
      }
      if (level[sink] === -1) return total;
      const nextEdge = Array(this.graph.length).fill(0) as number[];
      const visit = (node: number, flow: number): number => {
        if (node === sink) return flow;
        while (nextEdge[node] < this.graph[node].length) {
          const edge = this.graph[node][nextEdge[node]];
          if (edge.capacity > 0 && level[node] < level[edge.to]) {
            const pushed = visit(edge.to, Math.min(flow, edge.capacity));
            if (pushed > 0) {
              edge.capacity -= pushed;
              this.graph[edge.to][edge.reverse].capacity += pushed;
              return pushed;
            }
          }
          nextEdge[node] += 1;
        }
        return 0;
      };
      for (;;) {
        const pushed = visit(source, Number.MAX_SAFE_INTEGER);
        if (pushed === 0) break;
        total += pushed;
      }
    }
  }
}

function maximumAssignable(eligiblePlantsByOrder: Map<string, Set<string>>, warehouses: Warehouse[], horizonDays: number) {
  const plants = warehouses.map((warehouse) => warehouse.id);
  const plantNode = new Map(plants.map((plant, index) => [plant, index + 1]));
  const orderNodeStart = plants.length + 1;
  const sink = orderNodeStart + eligiblePlantsByOrder.size;
  const flow = new Dinic(sink + 1);
  warehouses.forEach((warehouse) => flow.addEdge(plantNode.get(warehouse.id)!, sink, warehouse.dailyCapacity * horizonDays));
  let index = 0;
  for (const eligiblePlants of eligiblePlantsByOrder.values()) {
    const orderNode = orderNodeStart + index;
    flow.addEdge(0, orderNode, 1);
    for (const plant of eligiblePlants) flow.addEdge(orderNode, plantNode.get(plant)!, 1);
    index += 1;
  }
  return flow.maxFlow(0, sink);
}

export function findMinimumHorizon(eligiblePlantsByOrder: Map<string, Set<string>>, warehouses: Warehouse[], maxDays = 30) {
  const totalDailyCapacity = warehouses.reduce((sum, warehouse) => sum + warehouse.dailyCapacity, 0);
  if (totalDailyCapacity === 0) return null;
  const exclusiveOrdersByPlant = new Map<string, number>();
  for (const eligiblePlants of eligiblePlantsByOrder.values()) {
    if (eligiblePlants.size !== 1) continue;
    const [plant] = eligiblePlants;
    exclusiveOrdersByPlant.set(plant, (exclusiveOrdersByPlant.get(plant) ?? 0) + 1);
  }
  let lowerBound = Math.ceil(eligiblePlantsByOrder.size / totalDailyCapacity);
  for (const warehouse of warehouses) {
    const forcedOrders = exclusiveOrdersByPlant.get(warehouse.id) ?? 0;
    lowerBound = Math.max(lowerBound, Math.ceil(forcedOrders / warehouse.dailyCapacity));
  }
  for (let horizonDays = lowerBound; horizonDays <= maxDays; horizonDays += 1) {
    if (maximumAssignable(eligiblePlantsByOrder, warehouses, horizonDays) === eligiblePlantsByOrder.size) return horizonDays;
  }
  return null;
}

export interface GoalSettings {
  /** Target total company cost (currency units). */
  costTarget: number;
  /** Target average transit days across company-controlled (DTD/DTP) orders. */
  transitTarget: number;
  costWeight: number;
  timeWeight: number;
}

export interface GoalDeviations {
  costOver: number;
  costUnder: number;
  transitOver: number;
  transitUnder: number;
}

/**
 * Capacity only depends on the warehouse, so for each (order, warehouse) pair a route that is
 * no cheaper and no faster than another one can never be needed. Dropping those is exact and
 * makes the model much smaller. Without a time goal only the cheapest route per pair survives
 * (ties broken by shorter transit).
 */
function pruneDominated(routesByOrder: Map<string, Route[]>, keepTimeTradeOffs: boolean) {
  const pruned = new Map<string, Route[]>();
  for (const [orderId, routes] of routesByOrder) {
    const byPlant = new Map<string, Route[]>();
    routes.forEach((route) => byPlant.set(route.plant, [...(byPlant.get(route.plant) ?? []), route]));
    const kept: Route[] = [];
    for (const plantRoutes of byPlant.values()) {
      plantRoutes.sort((left, right) => left.totalCost - right.totalCost || (left.transitDays ?? 0) - (right.transitDays ?? 0));
      let fastestSoFar = Infinity;
      for (const route of plantRoutes) {
        const transit = route.transitDays ?? 0;
        if (transit >= fastestSoFar) continue;
        kept.push(route);
        fastestSoFar = transit;
        if (!keepTimeTradeOffs) break;
      }
    }
    pruned.set(orderId, kept);
  }
  return pruned;
}

/**
 * Binary route-assignment model. Without `goals` it minimises total cost (Problem 1).
 * With `goals` it is a weighted goal programme (Problem 2): it minimises the normalised
 * over-achievement of the cost and average-transit targets, with a tiny cost tie-break.
 */
export async function solveAssignment(
  allRoutesByOrder: Map<string, Route[]>,
  warehouses: Warehouse[],
  horizonDays: number,
  options: { goals?: GoalSettings; timeLimitSeconds?: number } = {},
): Promise<SolveResult & { deviations?: GoalDeviations }> {
  const highs = await solver();
  const goals = options.goals;
  const routesByOrder = pruneDominated(allRoutesByOrder, Boolean(goals));
  const routes = [...routesByOrder.values()].flat();
  // LP-format column names must be simple identifiers; route ids contain dots and pipes
  const column = new Map(routes.map((route, index) => [route, `x${index}`]));
  // Goal 2 is expressed on total transit days so it stays linear: avg target × controllable orders.
  const controllableOrders = [...routesByOrder.values()].filter((orderRoutes) => orderRoutes.some((route) => route.transitDays !== null)).length;
  const transitTotalTarget = goals ? Math.max(goals.transitTarget * controllableOrders, 1) : 0;
  // Weighted GP: min w_c·d_c⁺/C* + w_t·d_t⁺/T*. Multiplied through by C* so coefficients stay in
  // currency units, plus a 0.1% cost tie-break so that, once both goals are met, the cheapest
  // plan among them is chosen.
  const objective = goals
    ? [
      ...routes.map((route) => ({ name: column.get(route)!, coef: route.totalCost * 1e-3 })),
      { name: "dcost", coef: goals.costWeight },
      { name: "dtime", coef: (goals.timeWeight * goals.costTarget) / transitTotalTarget },
    ]
    : routes.map((route) => ({ name: column.get(route)!, coef: route.totalCost }));

  const lines = ["Minimize", ` obj: ${terms(objective)}`, "Subject To"];
  let row = 0;
  for (const orderRoutes of routesByOrder.values()) {
    lines.push(` order${row++}: ${terms(orderRoutes.map((route) => ({ name: column.get(route)!, coef: 1 })))} = 1`);
  }
  for (const warehouse of warehouses) {
    const used = routes.filter((route) => route.plant === warehouse.id).map((route) => ({ name: column.get(route)!, coef: 1 }));
    if (used.length > 0) lines.push(` cap_${warehouse.id}: ${terms(used)} <= ${warehouse.dailyCapacity * horizonDays}`);
  }
  if (goals) {
    // Only d⁺ is penalised, so each goal row is written as "achieved − d⁺ ≤ target": d⁻ is the
    // row slack. This has the same optimum as the textbook equality form with d⁺ and d⁻.
    lines.push(` goal_cost: ${terms([...routes.map((route) => ({ name: column.get(route)!, coef: route.totalCost })), { name: "dcost", coef: -1 }])} <= ${goals.costTarget}`);
    const timed = routes.filter((route) => route.transitDays).map((route) => ({ name: column.get(route)!, coef: route.transitDays! }));
    lines.push(` goal_time: ${terms([...timed, { name: "dtime", coef: -1 }])} <= ${transitTotalTarget}`);
  }
  lines.push("Binary", ...routes.map((route) => ` ${column.get(route)}`), "End");

  const result = highs.solve(lines.join("\n"), { time_limit: options.timeLimitSeconds ?? 45, mip_rel_gap: 0.001, output_flag: false });
  if (result.Status === "Infeasible") {
    return { status: "infeasible", objectiveCost: null, assignments: [], plantLoads: {}, message: "No plan satisfies the selected capacity horizon." };
  }
  const columns = result.Columns as Record<string, { Primal?: number }>;
  const hasSolution = routes.length > 0 && columns[column.get(routes[0])!]?.Primal !== undefined;
  if (!hasSolution || (result.Status !== "Optimal" && result.Status !== "Time limit reached")) {
    return { status: "error", objectiveCost: null, assignments: [], plantLoads: {}, message: `Solver did not return a feasible plan (${result.Status}).` };
  }

  const selected = routes.filter((route) => (columns[column.get(route)!]?.Primal ?? 0) > 0.5);
  if (selected.length !== routesByOrder.size) {
    return { status: "error", objectiveCost: null, assignments: [], plantLoads: {}, message: `Solver stopped (${result.Status}) before finding a plan that serves every order.` };
  }
  const plantLoads: Record<string, number> = {};
  selected.forEach((route) => { plantLoads[route.plant] = (plantLoads[route.plant] ?? 0) + 1; });
  const assignments: Assignment[] = selected.map((route) => ({
    orderId: route.orderId,
    routeId: route.id,
    plant: route.plant,
    originPort: route.originPort,
    carrier: route.carrier,
    mode: route.mode,
    routeServiceLevel: route.serviceLevel,
    transitDays: route.transitDays,
    warehouseCost: route.warehouseCost,
    freightCost: route.freightCost,
    totalCost: route.totalCost,
  }));
  // deviations are recomputed from the chosen plan so they are exact rather than solver floats
  const achievedCost = selected.reduce((sum, route) => sum + route.totalCost, 0);
  const achievedTransit = selected.reduce((sum, route) => sum + (route.transitDays ?? 0), 0) / Math.max(controllableOrders, 1);
  const deviations = goals
    ? {
      costOver: Math.max(achievedCost - goals.costTarget, 0),
      costUnder: Math.max(goals.costTarget - achievedCost, 0),
      transitOver: Math.max(achievedTransit - goals.transitTarget, 0),
      transitUnder: Math.max(goals.transitTarget - achievedTransit, 0),
    }
    : undefined;
  return { status: result.Status === "Optimal" ? "optimal" : "feasible", objectiveCost: result.ObjectiveValue, assignments, plantLoads, deviations };
}
