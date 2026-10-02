import GLPKFactory, { type GLPK, type LP } from "glpk.js/node";
import type { Assignment, Route, SolveResult, Warehouse } from "@/lib/types";

let solverPromise: Promise<GLPK> | undefined;

async function solver() {
  solverPromise ??= GLPKFactory();
  return solverPromise;
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
  for (let horizonDays = 1; horizonDays <= maxDays; horizonDays += 1) {
    if (maximumAssignable(eligiblePlantsByOrder, warehouses, horizonDays) === eligiblePlantsByOrder.size) {
      return horizonDays;
    }
  }
  return null;
}

export async function solveMinimumCost(
  routesByOrder: Map<string, Route[]>,
  warehouses: Warehouse[],
  horizonDays: number,
  options: { routeScore?: (route: Route) => number; timeLimitSeconds?: number } = {},
): Promise<SolveResult> {
  const optimizer = await solver();
  const capacity = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.dailyCapacity * horizonDays]));
  const routes = [...routesByOrder.values()].flat();
  const scoreRoute = options.routeScore ?? ((route: Route) => route.totalCost);
  const model: LP = {
    name: "supply-chain-routing",
    objective: { direction: optimizer.GLP_MIN, name: "cost", vars: routes.map((route) => ({ name: route.id, coef: scoreRoute(route) })) },
    subjectTo: [],
    binaries: routes.map((route) => route.id),
  };

  for (const [orderId, orderRoutes] of routesByOrder) {
    model.subjectTo.push({
      name: `order:${orderId}`,
      vars: orderRoutes.map((route) => ({ name: route.id, coef: 1 })),
      bnds: { type: optimizer.GLP_FX, lb: 1, ub: 1 },
    });
  }
  for (const [plant, maximumOrders] of capacity) {
    model.subjectTo.push({
      name: `capacity:${plant}`,
      vars: routes.filter((route) => route.plant === plant).map((route) => ({ name: route.id, coef: 1 })),
      bnds: { type: optimizer.GLP_UP, lb: 0, ub: maximumOrders },
    });
  }

  const result = optimizer.solve(model, { msglev: optimizer.GLP_MSG_OFF, presol: true, tmlim: options.timeLimitSeconds ?? 45, mipgap: 0.001 });
  const status = result.result.status;
  if (status === optimizer.GLP_NOFEAS || status === optimizer.GLP_INFEAS) {
    return { status: "infeasible", objectiveCost: null, assignments: [], plantLoads: {}, message: "No plan satisfies the selected capacity horizon." };
  }
  if (status !== optimizer.GLP_OPT && status !== optimizer.GLP_FEAS) {
    return { status: "error", objectiveCost: null, assignments: [], plantLoads: {}, message: "Solver did not return a feasible plan." };
  }

  const selected = routes.filter((route) => (result.result.vars[route.id] ?? 0) > 0.5);
  const plantLoads: Record<string, number> = {};
  selected.forEach((route) => { plantLoads[route.plant] = (plantLoads[route.plant] ?? 0) + 1; });
  const assignments: Assignment[] = selected.map((route) => ({ orderId: route.orderId, routeId: route.id }));
  return { status: status === optimizer.GLP_OPT ? "optimal" : "feasible", objectiveCost: result.result.z, assignments, plantLoads };
}
