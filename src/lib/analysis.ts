import { buildFeasibleRoutes, eligiblePlantsByOrder, type RouteGeneration } from "@/lib/routes";
import { findMinimumHorizon, solveMinimumCost } from "@/lib/optimizer";
import { loadSourceData } from "@/lib/workbook";
import type { Route, Warehouse } from "@/lib/types";

export interface ScenarioSummary {
  label: string;
  capacityFactor: number;
  dailyCapacity: number;
  minimumHorizon: number | null;
}

export interface DashboardAnalysis {
  source: { orders: number; warehouses: number; freightRates: number; duplicateFreightRowsRemoved: number; crfOrders: number };
  feasibility: { zeroCandidateOrders: number; candidateRoutes: number; minimumHorizon: number | null; exclusiveOrders: number };
  capacity: { plant: string; dailyCapacity: number; exclusiveOrders: number; minimumDaysForExclusiveOrders: number }[];
  sensitivity: ScenarioSummary[];
  modeMix: { mode: string; routes: number }[];
  carrierMix: { carrier: string; routes: number }[];
}

let cachedAnalysis: DashboardAnalysis | undefined;
let cachedRoutes: RouteGeneration | undefined;
let cachedWarehouses: Warehouse[] | undefined;

function scaledWarehouses(warehouses: Warehouse[], capacityFactor: number) {
  return warehouses.map((warehouse) => ({ ...warehouse, dailyCapacity: Math.floor(warehouse.dailyCapacity * capacityFactor) }));
}

export function getDashboardAnalysis(): DashboardAnalysis {
  if (cachedAnalysis) return cachedAnalysis;
  const data = loadSourceData();
  const generated = buildFeasibleRoutes(data);
  const eligible = eligiblePlantsByOrder(generated.routesByOrder);
  const exclusiveOrders = new Map<string, number>();
  for (const plants of eligible.values()) {
    if (plants.size === 1) {
      const [plant] = plants;
      exclusiveOrders.set(plant, (exclusiveOrders.get(plant) ?? 0) + 1);
    }
  }
  const capacity = data.warehouses
    .map((warehouse) => {
      const forcedOrders = exclusiveOrders.get(warehouse.id) ?? 0;
      return {
        plant: warehouse.id,
        dailyCapacity: warehouse.dailyCapacity,
        exclusiveOrders: forcedOrders,
        minimumDaysForExclusiveOrders: forcedOrders === 0 ? 0 : Math.ceil(forcedOrders / warehouse.dailyCapacity),
      };
    })
    .sort((left, right) => right.minimumDaysForExclusiveOrders - left.minimumDaysForExclusiveOrders);
  const scenarios = [
    { label: "−20%", capacityFactor: 0.8 },
    { label: "−10%", capacityFactor: 0.9 },
    { label: "Baseline", capacityFactor: 1 },
    { label: "+10%", capacityFactor: 1.1 },
    { label: "+20%", capacityFactor: 1.2 },
  ].map((scenario) => {
    const warehouses = scaledWarehouses(data.warehouses, scenario.capacityFactor);
    return {
      ...scenario,
      dailyCapacity: warehouses.reduce((sum, warehouse) => sum + warehouse.dailyCapacity, 0),
      minimumHorizon: findMinimumHorizon(eligible, warehouses, 14),
    };
  });
  const routes = [...generated.routesByOrder.values()].flat();
  const modeCounts = new Map<string, number>();
  const carrierCounts = new Map<string, number>();
  routes.forEach((route) => {
    if (route.mode) modeCounts.set(route.mode, (modeCounts.get(route.mode) ?? 0) + 1);
    if (route.carrier) carrierCounts.set(route.carrier, (carrierCounts.get(route.carrier) ?? 0) + 1);
  });
  cachedAnalysis = {
    source: {
      orders: data.orders.length,
      warehouses: data.warehouses.length,
      freightRates: data.rates.length,
      duplicateFreightRowsRemoved: data.duplicatesRemoved,
      crfOrders: data.orders.filter((order) => order.serviceLevel === "CRF").length,
    },
    feasibility: {
      zeroCandidateOrders: generated.diagnostics.zeroCandidateOrders.length,
      candidateRoutes: generated.diagnostics.candidateRoutes,
      minimumHorizon: scenarios.find((scenario) => scenario.capacityFactor === 1)?.minimumHorizon ?? null,
      exclusiveOrders: [...exclusiveOrders.values()].reduce((sum, count) => sum + count, 0),
    },
    capacity,
    sensitivity: scenarios,
    modeMix: [...modeCounts].map(([mode, routes]) => ({ mode, routes })).sort((left, right) => right.routes - left.routes),
    carrierMix: [...carrierCounts].map(([carrier, routes]) => ({ carrier, routes })).sort((left, right) => right.routes - left.routes),
  };
  cachedRoutes = generated;
  cachedWarehouses = data.warehouses;
  return cachedAnalysis;
}

export async function solveScenario(input: { capacityFactor: number; freightRateFactor: number; warehouseCostFactor: number; transitPriority: number }) {
  getDashboardAnalysis();
  if (!cachedRoutes || !cachedWarehouses) throw new Error("Analysis data was not initialised.");
  const adjustedWarehouses = scaledWarehouses(cachedWarehouses, input.capacityFactor);
  const eligible = eligiblePlantsByOrder(cachedRoutes.routesByOrder);
  const horizonDays = findMinimumHorizon(eligible, adjustedWarehouses, 30);
  if (!horizonDays) return { status: "infeasible" as const, horizonDays: null, objectiveCost: null, assignments: [], plantLoads: {} };
  const routeScore = (route: Route) => {
    const adjustedWarehouse = route.warehouseCost * input.warehouseCostFactor;
    const adjustedFreight = route.freightCost * input.freightRateFactor;
    const transitPenalty = route.transitDays === null ? 0 : route.transitDays * input.transitPriority;
    return adjustedWarehouse + adjustedFreight + transitPenalty;
  };
  const solved = await solveMinimumCost(cachedRoutes.routesByOrder, adjustedWarehouses, horizonDays, { routeScore });
  return { ...solved, horizonDays };
}
