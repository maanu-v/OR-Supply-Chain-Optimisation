import { buildFeasibleRoutes, eligiblePlantsByOrder, type RouteGeneration } from "@/lib/routes";
import { findMinimumHorizon, solveAssignment } from "@/lib/optimizer";
import { planRoute, type PlannerInput } from "@/lib/planner";
import { loadSourceData } from "@/lib/workbook";
import { baseFactors, defaultGoal, findScenario, type CustomSensitivityInput, type CustomSensitivityResult, type Factors, type GoalInput, type ProblemId, type SensitivityRow, type SolveSummary } from "@/lib/scenarios";
import type { Assignment, Route, SourceData, Warehouse } from "@/lib/types";

export interface DashboardAnalysis {
  source: { orders: number; warehouses: number; freightRates: number; duplicateFreightRowsRemoved: number; crfOrders: number };
  feasibility: {
    zeroCandidateOrders: number;
    candidateRoutes: number;
    unfilteredCombinations: number;
    ordersWithOnePlant: number;
    averageRoutesPerOrder: number;
    minimumHorizon: number | null;
    lowerBoundHorizon: number;
  };
  tables: { name: string; rows: number; columns: number; role: string }[];
  scale: { label: string; value: string; source: string }[];
  warehouses: { plant: string; unitCost: number; dailyCapacity: number; products: number; ports: string[]; vmi: boolean; historicalOrders: number; singlePlantOrders: number }[];
  serviceLevels: { name: string; orders: number; meaning: string }[];
  weightBands: { band: string; orders: number }[];
  historicalCarriers: { carrier: string; orders: number }[];
  rateCarriers: { carrier: string; air: number; ground: number; minTransit: number; maxTransit: number }[];
  transitDays: { days: number; rateLines: number }[];
  modeStats: { mode: string; rateLines: number; averageRate: number; averageMinimum: number; averageTransit: number }[];
  /** Freight routes whose price is the carrier's minimum charge rather than weight × rate. */
  minimumChargeRoutes: { binding: number; total: number };
  routesPerOrder: { bucket: string; orders: number }[];
  capacityHorizon: { label: string; dailyCapacity: number; minimumHorizon: number | null }[];
  planner: {
    products: string[];
    customers: string[];
    /** First order of OrderList, used to prefill the planner form. */
    sample: { productId: string; customer: string; serviceLevel: string; quantity: number; weight: number };
  };
}

let cachedData: SourceData | undefined;
let cachedAnalysis: DashboardAnalysis | undefined;
let cachedRoutes: RouteGeneration | undefined;

function sourceData() {
  cachedData ??= loadSourceData();
  return cachedData;
}

function baseRoutes() {
  cachedRoutes ??= buildFeasibleRoutes(sourceData());
  return cachedRoutes;
}

/** Scales daily capacity of every plant, or only of `plants` when a non-empty list is given. */
function scaledWarehouses(warehouses: Warehouse[], capacityFactor: number, plants?: string[]) {
  return warehouses.map((warehouse) => (plants?.length && !plants.includes(warehouse.id) ? warehouse : { ...warehouse, dailyCapacity: Math.floor(warehouse.dailyCapacity * capacityFactor) }));
}

function countBy<T>(items: T[], key: (item: T) => string) {
  const counts = new Map<string, number>();
  items.forEach((item) => counts.set(key(item), (counts.get(key(item)) ?? 0) + 1));
  return counts;
}

export function getDashboardAnalysis(): DashboardAnalysis {
  if (cachedAnalysis) return cachedAnalysis;
  const data = sourceData();
  const generated = baseRoutes();
  const eligible = eligiblePlantsByOrder(generated.routesByOrder);

  const singlePlantOrders = new Map<string, number>();
  for (const plants of eligible.values()) {
    if (plants.size !== 1) continue;
    const [plant] = plants;
    singlePlantOrders.set(plant, (singlePlantOrders.get(plant) ?? 0) + 1);
  }
  const historicalByPlant = countBy(data.orders, (order) => order.historicalPlant);
  const warehouses = data.warehouses.map((warehouse) => ({
    plant: warehouse.id,
    unitCost: warehouse.unitCost,
    dailyCapacity: warehouse.dailyCapacity,
    products: data.productsByPlant.get(warehouse.id)?.size ?? 0,
    ports: [...(data.portsByPlant.get(warehouse.id) ?? [])].sort(),
    vmi: data.vmiCustomersByPlant.has(warehouse.id),
    historicalOrders: historicalByPlant.get(warehouse.id) ?? 0,
    singlePlantOrders: singlePlantOrders.get(warehouse.id) ?? 0,
  })).sort((left, right) => Number(left.plant.replace(/\D/g, "")) - Number(right.plant.replace(/\D/g, "")));

  const totalDailyCapacity = data.warehouses.reduce((sum, warehouse) => sum + warehouse.dailyCapacity, 0);
  const capacityHorizon = [0.8, 0.9, 1, 1.1, 1.2].map((factor) => {
    const scaled = scaledWarehouses(data.warehouses, factor);
    return {
      label: factor === 1 ? "Baseline" : `${factor > 1 ? "+" : "−"}${Math.round(Math.abs(factor - 1) * 100)}%`,
      dailyCapacity: scaled.reduce((sum, warehouse) => sum + warehouse.dailyCapacity, 0),
      minimumHorizon: findMinimumHorizon(eligible, scaled, 14),
    };
  });

  const weightEdges = [0, 1, 5, 10, 50, 100, 500, Infinity];
  const weightBands = weightEdges.slice(0, -1).map((low, index) => {
    const high = weightEdges[index + 1];
    return {
      band: high === Infinity ? `${low}+ kg` : `${low}–${high} kg`,
      orders: data.orders.filter((order) => order.weight >= low && order.weight < high).length,
    };
  });

  const carriers = [...new Set(data.rates.map((rate) => rate.carrier))].sort();
  const rateCarriers = carriers.map((carrier) => {
    const rates = data.rates.filter((rate) => rate.carrier === carrier);
    return {
      carrier,
      air: rates.filter((rate) => rate.mode === "AIR").length,
      ground: rates.filter((rate) => rate.mode === "GROUND").length,
      minTransit: Math.min(...rates.map((rate) => rate.transitDays)),
      maxTransit: Math.max(...rates.map((rate) => rate.transitDays)),
    };
  });
  const transitCounts = countBy(data.rates, (rate) => String(rate.transitDays));
  const transitDays = [...transitCounts].map(([days, rateLines]) => ({ days: Number(days), rateLines })).sort((left, right) => left.days - right.days);
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  const modeStats = [...new Set(data.rates.map((rate) => rate.mode))].sort().map((mode) => {
    const rates = data.rates.filter((rate) => rate.mode === mode);
    return {
      mode,
      rateLines: rates.length,
      averageRate: average(rates.map((rate) => rate.rate)),
      averageMinimum: average(rates.map((rate) => rate.minimumCost)),
      averageTransit: average(rates.map((rate) => rate.transitDays)),
    };
  });
  const minimumByRate = new Map(data.rates.map((rate) => [rate.id, rate.minimumCost]));
  const freightRoutes = [...generated.routesByOrder.values()].flat().filter((route) => route.carrier !== null);
  const minimumChargeRoutes = {
    total: freightRoutes.length,
    // route ids end with the rate id: `${order}|${plant}|${port}|${rate}`
    binding: freightRoutes.filter((route) => route.freightCost === minimumByRate.get(route.id.slice(route.id.lastIndexOf("|") + 1))).length,
  };

  const routeCounts = [...generated.routesByOrder.values()].map((routes) => routes.length);
  const routeBuckets: [string, number, number][] = [["1–5", 1, 5], ["6–10", 6, 10], ["11–20", 11, 20], ["21–50", 21, 50], ["51–100", 51, 100], ["100+", 101, Infinity]];
  const routesPerOrder = routeBuckets.map(([bucket, low, high]) => ({ bucket, orders: routeCounts.filter((count) => count >= low && count <= high).length }));

  const ports = new Set([...data.portsByPlant.values()].flatMap((set) => [...set]));
  const plantPortLinks = [...data.portsByPlant.values()].reduce((sum, set) => sum + set.size, 0);
  const servicesByName = countBy(data.orders, (order) => order.serviceLevel);
  const customers = new Set(data.orders.map((order) => order.customer)).size;
  const products = new Set(data.orders.map((order) => order.productId)).size;

  cachedAnalysis = {
    source: {
      orders: data.orders.length,
      warehouses: data.warehouses.length,
      freightRates: data.rates.length + data.duplicatesRemoved,
      duplicateFreightRowsRemoved: data.duplicatesRemoved,
      crfOrders: servicesByName.get("CRF") ?? 0,
    },
    feasibility: {
      zeroCandidateOrders: generated.diagnostics.zeroCandidateOrders.length,
      candidateRoutes: generated.diagnostics.candidateRoutes,
      unfilteredCombinations: data.orders.length * data.warehouses.length * ports.size * carriers.length,
      ordersWithOnePlant: [...singlePlantOrders.values()].reduce((sum, count) => sum + count, 0),
      averageRoutesPerOrder: generated.diagnostics.candidateRoutes / data.orders.length,
      minimumHorizon: capacityHorizon.find((row) => row.label === "Baseline")?.minimumHorizon ?? null,
      lowerBoundHorizon: Math.ceil(data.orders.length / totalDailyCapacity),
    },
    tables: [
      { name: "OrderList", rows: data.orders.length, columns: 14, role: "Customer demand: weight, quantity, service level, dates" },
      { name: "FreightRates", rows: data.rates.length + data.duplicatesRemoved, columns: 11, role: "Carrier lane rates by weight band and service" },
      { name: "WhCosts", rows: data.warehouses.length, columns: 2, role: "Storage cost per unit at each warehouse" },
      { name: "WhCapacities", rows: data.warehouses.length, columns: 2, role: "Daily order-handling capacity of each warehouse" },
      { name: "ProductsPerPlant", rows: [...data.productsByPlant.values()].reduce((sum, set) => sum + set.size, 0), columns: 2, role: "Products each warehouse is able to ship" },
      { name: "VmiCustomers", rows: [...data.vmiCustomersByPlant.values()].reduce((sum, set) => sum + set.size, 0), columns: 2, role: "Customers restricted to specific warehouses" },
      { name: "PlantPorts", rows: plantPortLinks, columns: 2, role: "Warehouse to origin-port connectivity" },
    ],
    scale: [
      { label: "Customer orders to be routed", value: data.orders.length.toLocaleString("en-US"), source: "OrderList" },
      { label: "Distinct customers / products", value: `${customers} / ${products}`, source: "OrderList" },
      { label: "Warehouses (plants)", value: String(data.warehouses.length), source: "WhCapacities" },
      { label: "Origin ports / destination ports", value: `${ports.size} / ${new Set(data.orders.map((order) => order.destinationPort)).size}`, source: "PlantPorts" },
      { label: "Warehouse-to-port connections", value: String(plantPortLinks), source: "PlantPorts" },
      { label: "Carriers available", value: String(carriers.length), source: "FreightRates" },
      { label: "Freight rate lines (weight bands)", value: (data.rates.length + data.duplicatesRemoved).toLocaleString("en-US"), source: "FreightRates" },
      { label: "Service levels / transport modes", value: `${servicesByName.size} / ${new Set(data.rates.map((rate) => rate.mode)).size}`, source: "OrderList" },
    ],
    warehouses,
    serviceLevels: [
      { name: "DTP", orders: servicesByName.get("DTP") ?? 0, meaning: "Door-to-Port: company pays freight up to the destination port" },
      { name: "DTD", orders: servicesByName.get("DTD") ?? 0, meaning: "Door-to-Door: company pays freight to the customer" },
      { name: "CRF", orders: servicesByName.get("CRF") ?? 0, meaning: "Customer Referred Freight: customer arranges freight, company pays warehouse cost only" },
    ],
    weightBands,
    historicalCarriers: [...countBy(data.orders, (order) => order.historicalCarrier)].map(([carrier, orders]) => ({ carrier, orders })).sort((left, right) => right.orders - left.orders),
    rateCarriers,
    transitDays,
    modeStats,
    minimumChargeRoutes,
    routesPerOrder,
    capacityHorizon,
    planner: {
      products: [...new Set([...data.productsByPlant.values()].flatMap((set) => [...set]))].sort((left, right) => left.localeCompare(right, "en", { numeric: true })),
      customers: [...new Set(data.orders.map((order) => order.customer))].sort((left, right) => left.localeCompare(right, "en", { numeric: true })),
      sample: (() => {
        // prefill with the freight-paying order that has the most alternative warehouses, so the planner has real choices to show
        const order = data.orders
          .filter((candidate) => candidate.serviceLevel !== "CRF")
          .reduce((best, candidate) => ((eligible.get(candidate.id)?.size ?? 0) > (eligible.get(best.id)?.size ?? 0) ? candidate : best));
        return { productId: order.productId, customer: order.customer, serviceLevel: order.serviceLevel, quantity: order.quantity, weight: Math.round(order.weight * 100) / 100 };
      })(),
    },
  };
  return cachedAnalysis;
}

export function planOrder(input: PlannerInput) {
  return planRoute(sourceData(), input);
}

// ---------------------------------------------------------------------------
// Solving

export interface SolveRequest extends Factors {
  problem: ProblemId;
  goal?: GoalInput;
}

export interface SolveResponse extends SolveSummary {
  assignments: Assignment[];
  /** Problem 1 baseline, shown next to Problem 2 results for comparison. */
  reference?: { totalCost: number | null; averageTransitDays: number | null };
}

/**
 * Routes for the scenario: demand scales order quantity and weight, cost factors scale route
 * costs. `plants` limits the warehouse-cost change to those plants, `carriers` the freight change.
 */
function scenarioRoutes(factors: Factors) {
  const base = factors.demandFactor === 1
    ? baseRoutes()
    : (() => {
      const data = sourceData();
      return buildFeasibleRoutes({ ...data, orders: data.orders.map((order) => ({ ...order, quantity: order.quantity * factors.demandFactor, weight: order.weight * factors.demandFactor })) });
    })();
  if (factors.freightRateFactor === 1 && factors.warehouseCostFactor === 1) return base;
  const routesByOrder = new Map<string, Route[]>();
  for (const [orderId, routes] of base.routesByOrder) {
    routesByOrder.set(orderId, routes.map((route) => {
      const warehouseCost = route.warehouseCost * (!factors.plants?.length || factors.plants.includes(route.plant) ? factors.warehouseCostFactor : 1);
      const freightCost = route.freightCost * (!factors.carriers?.length || (route.carrier !== null && factors.carriers.includes(route.carrier)) ? factors.freightRateFactor : 1);
      return { ...route, warehouseCost, freightCost, totalCost: warehouseCost + freightCost };
    }));
  }
  return { ...base, routesByOrder };
}

function summarise(assignments: Assignment[], warehouses: Warehouse[], horizonDays: number, plantLoads: Record<string, number>) {
  const controllable = assignments.filter((assignment) => assignment.transitDays !== null);
  const warehouseCost = assignments.reduce((sum, assignment) => sum + assignment.warehouseCost, 0);
  const freightCost = assignments.reduce((sum, assignment) => sum + assignment.freightCost, 0);
  const constraints = warehouses.map((warehouse) => {
    const rhs = warehouse.dailyCapacity * horizonDays;
    const used = plantLoads[warehouse.id] ?? 0;
    return { plant: warehouse.id, used, rhs, slack: rhs - used, slackPercent: rhs === 0 ? 0 : ((rhs - used) / rhs) * 100 };
  }).sort((left, right) => left.slack - right.slack);
  return {
    totalCost: warehouseCost + freightCost,
    warehouseCost,
    freightCost,
    averageTransitDays: controllable.length === 0 ? null : controllable.reduce((sum, assignment) => sum + (assignment.transitDays ?? 0), 0) / controllable.length,
    modeSplit: [...countBy(assignments, (assignment) => assignment.mode ?? "CRF (customer)")].map(([mode, orders]) => ({ mode, orders })).sort((left, right) => right.orders - left.orders),
    carrierSplit: [...countBy(controllable, (assignment) => assignment.carrier ?? "—")].map(([carrier, orders]) => ({ carrier, orders })).sort((left, right) => right.orders - left.orders),
    plantLoads: warehouses
      .map((warehouse) => ({ plant: warehouse.id, orders: plantLoads[warehouse.id] ?? 0, capacity: warehouse.dailyCapacity * horizonDays }))
      .sort((left, right) => left.plant.localeCompare(right.plant, "en", { numeric: true })),
    constraints,
  };
}

const solveCache = new Map<string, Promise<SolveResponse>>();

export function solveScenario(request: SolveRequest): Promise<SolveResponse> {
  const normalised: SolveRequest = request.problem === "cost-time" ? { ...request, goal: request.goal ?? defaultGoal } : { ...request, goal: undefined };
  const key = JSON.stringify(normalised);
  let pending = solveCache.get(key);
  if (!pending) {
    pending = runSolve(normalised);
    pending.catch(() => solveCache.delete(key));
    solveCache.set(key, pending);
    // Each cached plan holds ~9k assignments; keep only the most recent plans.
    if (solveCache.size > 40) solveCache.delete(solveCache.keys().next().value!);
  }
  return pending;
}

async function runSolve(request: SolveRequest): Promise<SolveResponse> {
  const started = Date.now();
  const generated = scenarioRoutes(request);
  const warehouses = scaledWarehouses(sourceData().warehouses, request.capacityFactor, request.plants);
  const empty = { totalCost: null, warehouseCost: null, freightCost: null, averageTransitDays: null, modeSplit: [], carrierSplit: [], plantLoads: [], constraints: [], assignments: [] };
  if (generated.diagnostics.zeroCandidateOrders.length > 0) {
    return { ...empty, status: "infeasible", horizonDays: null, solveSeconds: 0, message: `${generated.diagnostics.zeroCandidateOrders.length} orders have no freight lane for their scaled weight.` };
  }
  const horizonDays = findMinimumHorizon(eligiblePlantsByOrder(generated.routesByOrder), warehouses, 30);
  if (!horizonDays) {
    return { ...empty, status: "infeasible", horizonDays: null, solveSeconds: (Date.now() - started) / 1000, message: "Capacity cannot serve every order within 30 days." };
  }

  let goals;
  let reference: SolveResponse["reference"];
  if (request.problem === "cost-time" && request.goal) {
    const problemOne = await solveScenario({ ...baseFactors, problem: "minimum-cost" });
    if (problemOne.totalCost === null) throw new Error("Problem 1 baseline is infeasible, so no cost target can be set.");
    reference = { totalCost: problemOne.totalCost, averageTransitDays: problemOne.averageTransitDays };
    goals = { ...request.goal, costTarget: problemOne.totalCost * (1 + request.goal.costBudgetPercent / 100) };
  }

  const solved = await solveAssignment(generated.routesByOrder, warehouses, horizonDays, { goals });
  const solveSeconds = (Date.now() - started) / 1000;
  if (solved.status === "infeasible" || solved.status === "error") {
    return { ...empty, status: solved.status, horizonDays, solveSeconds, message: solved.message };
  }
  return {
    status: solved.status,
    horizonDays,
    solveSeconds,
    assignments: solved.assignments,
    reference,
    ...summarise(solved.assignments, warehouses, horizonDays, solved.plantLoads),
    goal: goals && solved.deviations ? { costTarget: goals.costTarget, transitTarget: goals.transitTarget, costWeight: goals.costWeight, timeWeight: goals.timeWeight, ...solved.deviations } : undefined,
  };
}

/** Re-solves one perturbed scenario and compares its plan with the unperturbed plan of the same problem. */
export async function solveSensitivity(problem: ProblemId, goal: GoalInput | undefined, scenarioId: string): Promise<SensitivityRow> {
  const scenario = findScenario(scenarioId);
  if (!scenario) throw new Error(`Unknown sensitivity scenario: ${scenarioId}`);
  const baseGoal = problem === "cost-time" ? goal ?? defaultGoal : undefined;
  const scenarioGoal = baseGoal && scenario.transitTarget !== undefined ? { ...baseGoal, transitTarget: scenario.transitTarget } : baseGoal;
  const [solved, baseline] = await Promise.all([
    solveScenario({ ...scenario.factors, problem, goal: scenarioGoal }),
    solveScenario({ ...baseFactors, problem, goal: baseGoal }),
  ]);
  return { ...summaryOf(solved), scenarioId, ...countChanges(baseline.assignments, solved.assignments) };
}

function summaryOf(solved: SolveResponse): SolveSummary {
  const { assignments: _assignments, reference: _reference, ...summary } = solved;
  return summary;
}

const routeText = (assignment: Assignment) => [assignment.plant, assignment.originPort, assignment.carrier ? `${assignment.carrier} ${assignment.mode} ${assignment.routeServiceLevel}` : "customer freight"].join(" → ");
const sameRoute = (left: Assignment, right: Assignment) => routeText(left) === routeText(right);

function countChanges(before: Assignment[], after: Assignment[]) {
  if (before.length === 0 || after.length === 0) return { routesChanged: null, plantsChanged: null };
  const baseByOrder = new Map(before.map((assignment) => [assignment.orderId, assignment]));
  let routesChanged = 0;
  let plantsChanged = 0;
  for (const assignment of after) {
    const previous = baseByOrder.get(assignment.orderId);
    if (!previous) continue;
    if (previous.plant !== assignment.plant) plantsChanged += 1;
    if (!sameRoute(previous, assignment)) routesChanged += 1;
  }
  return { routesChanged, plantsChanged };
}

/** Turns a user-chosen parameter change into solver factors (and, for Problem 2, goal settings). */
function customScenario(input: CustomSensitivityInput, baseGoal: GoalInput | undefined) {
  const factor = 1 + input.changePercent / 100;
  // sorted so the same selection in a different click order hits the same cached solve
  const targets = input.targets?.length ? [...new Set(input.targets)].sort((left, right) => left.localeCompare(right, "en", { numeric: true })) : undefined;
  const scope = targets ? ` at ${targets.join(", ")}` : "";
  const signed = `${input.changePercent > 0 ? "+" : ""}${input.changePercent}%`;
  switch (input.parameter) {
    case "capacity":
      return { label: `Warehouse capacity ${signed}${scope}`, factors: { ...baseFactors, capacityFactor: factor, plants: targets }, goal: baseGoal };
    case "warehouseCost":
      return { label: `Warehouse cost per unit ${signed}${scope}`, factors: { ...baseFactors, warehouseCostFactor: factor, plants: targets }, goal: baseGoal };
    case "freight":
      return { label: `Freight rates ${signed}${targets ? ` for ${targets.join(", ")}` : ""}`, factors: { ...baseFactors, freightRateFactor: factor, carriers: targets }, goal: baseGoal };
    case "demand":
      return { label: `Demand (quantity and weight) ${signed}`, factors: { ...baseFactors, demandFactor: factor }, goal: baseGoal };
    case "transitTarget":
      if (!baseGoal) throw new Error("The delivery-time target only exists in Problem 2.");
      return { label: `Transit target ${input.value} days`, factors: baseFactors, goal: { ...baseGoal, transitTarget: input.value ?? baseGoal.transitTarget } };
    case "costBudget":
      if (!baseGoal) throw new Error("The cost budget only exists in Problem 2.");
      return { label: `Cost budget +${input.value}% over Problem 1`, factors: baseFactors, goal: { ...baseGoal, costBudgetPercent: input.value ?? baseGoal.costBudgetPercent } };
  }
}

/** One user-defined what-if: re-solve and explain what changed against the baseline plan. */
export async function solveCustomSensitivity(problem: ProblemId, goal: GoalInput | undefined, input: CustomSensitivityInput): Promise<CustomSensitivityResult> {
  const baseGoal = problem === "cost-time" ? goal ?? defaultGoal : undefined;
  const scenario = customScenario(input, baseGoal);
  const [solved, baseline] = await Promise.all([
    solveScenario({ ...scenario.factors, problem, goal: scenario.goal }),
    solveScenario({ ...baseFactors, problem, goal: baseGoal }),
  ]);
  // daily capacity, so a longer horizon alone does not make every plant look "changed"
  const daily = (capacity: number, horizon: number | null) => (horizon ? Math.round(capacity / horizon) : 0);
  const plantChanges = baseline.plantLoads.map((row) => {
    const after = solved.plantLoads.find((other) => other.plant === row.plant);
    return {
      plant: row.plant,
      ordersBefore: row.orders,
      ordersAfter: after?.orders ?? 0,
      capacityBefore: daily(row.capacity, baseline.horizonDays),
      capacityAfter: daily(after?.capacity ?? 0, solved.horizonDays),
    };
  }).filter((row) => row.ordersBefore !== row.ordersAfter || row.capacityBefore !== row.capacityAfter);
  const carriers = new Set([...baseline.carrierSplit, ...solved.carrierSplit].map((row) => row.carrier));
  const carrierChanges = [...carriers].map((carrier) => ({
    carrier,
    ordersBefore: baseline.carrierSplit.find((row) => row.carrier === carrier)?.orders ?? 0,
    ordersAfter: solved.carrierSplit.find((row) => row.carrier === carrier)?.orders ?? 0,
  })).filter((row) => row.ordersBefore !== row.ordersAfter).sort((left, right) => Math.abs(right.ordersAfter - right.ordersBefore) - Math.abs(left.ordersAfter - left.ordersBefore));
  const baseByOrder = new Map(baseline.assignments.map((assignment) => [assignment.orderId, assignment]));
  const examples = solved.assignments
    .flatMap((assignment) => {
      const previous = baseByOrder.get(assignment.orderId);
      return previous && !sameRoute(previous, assignment) ? [{ orderId: assignment.orderId, before: routeText(previous), after: routeText(assignment), costBefore: previous.totalCost, costAfter: assignment.totalCost }] : [];
    })
    .slice(0, 20);
  return { label: scenario.label, baseline: summaryOf(baseline), scenario: summaryOf(solved), ...countChanges(baseline.assignments, solved.assignments), plantChanges, carrierChanges, examples };
}
