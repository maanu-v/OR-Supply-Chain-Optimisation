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
  dataset: {
    tables: { name: string; rows: number; columns: number; role: string; answer: string }[];
    historical: { customers: number; products: number; plants: number; originPorts: number; destinationPorts: number; carriers: number; orderDate: string };
    transport: { carrierOptions: number; originPorts: number; destinationPorts: number; airRateRows: number; groundRateRows: number; dtdRateRows: number; dtpRateRows: number };
    warehouseCost: { minimum: number; maximum: number; cheapestPlant: string; highestCostPlant: string };
    capacity: { dailyTotal: number; highestPlant: string; highestCapacity: number };
    serviceLevels: { name: string; orders: number; meaning: string }[];
  };
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
  const historicalCustomers = new Set(data.orders.map((order) => order.customer));
  const historicalProducts = new Set(data.orders.map((order) => order.productId));
  const historicalPlants = new Set(data.orders.map((order) => order.historicalPlant));
  const historicalOriginPorts = new Set(data.orders.map((order) => order.historicalOriginPort));
  const historicalDestinationPorts = new Set(data.orders.map((order) => order.destinationPort));
  const historicalCarriers = new Set(data.orders.map((order) => order.historicalCarrier));
  const rateCarriers = new Set(data.rates.map((rate) => rate.carrier));
  const rateOriginPorts = new Set(data.rates.map((rate) => rate.originPort));
  const rateDestinationPorts = new Set(data.rates.map((rate) => rate.destinationPort));
  const costsAscending = [...data.warehouses].sort((left, right) => left.unitCost - right.unitCost);
  const capacityDescending = [...data.warehouses].sort((left, right) => right.dailyCapacity - left.dailyCapacity);
  const ordersByServiceLevel = new Map<string, number>();
  data.orders.forEach((order) => ordersByServiceLevel.set(order.serviceLevel, (ordersByServiceLevel.get(order.serviceLevel) ?? 0) + 1));
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
    dataset: {
      tables: [
        { name: "OrderList", rows: 9_215, columns: 14, role: "Historical demand", answer: "What was ordered, by whom, and how was it historically fulfilled?" },
        { name: "FreightRates", rows: 1_540, columns: 11, role: "Transportation price rules", answer: "Which carrier/lane/weight-band options exist and what do they cost?" },
        { name: "WhCosts", rows: 19, columns: 2, role: "Warehouse handling cost", answer: "What does one unit cost to handle at each plant?" },
        { name: "WhCapacities", rows: 19, columns: 2, role: "Daily throughput limit", answer: "How many orders can each plant process per day?" },
        { name: "ProductsPerPlant", rows: 2_036, columns: 2, role: "Product eligibility", answer: "Which plants stock each product?" },
        { name: "VmiCustomers", rows: 14, columns: 2, role: "VMI eligibility", answer: "Which customers may a VMI-restricted plant serve?" },
        { name: "PlantPorts", rows: 22, columns: 2, role: "Physical connectivity", answer: "Which origin ports can each plant use?" },
      ],
      historical: { customers: historicalCustomers.size, products: historicalProducts.size, plants: historicalPlants.size, originPorts: historicalOriginPorts.size, destinationPorts: historicalDestinationPorts.size, carriers: historicalCarriers.size, orderDate: data.orders[0]?.orderDate ?? "—" },
      transport: { carrierOptions: rateCarriers.size, originPorts: rateOriginPorts.size, destinationPorts: rateDestinationPorts.size, airRateRows: data.rates.filter((rate) => rate.mode === "AIR").length, groundRateRows: data.rates.filter((rate) => rate.mode === "GROUND").length, dtdRateRows: data.rates.filter((rate) => rate.serviceLevel === "DTD").length, dtpRateRows: data.rates.filter((rate) => rate.serviceLevel === "DTP").length },
      warehouseCost: { minimum: costsAscending[0].unitCost, maximum: costsAscending.at(-1)!.unitCost, cheapestPlant: costsAscending[0].id, highestCostPlant: costsAscending.at(-1)!.id },
      capacity: { dailyTotal: data.warehouses.reduce((sum, warehouse) => sum + warehouse.dailyCapacity, 0), highestPlant: capacityDescending[0].id, highestCapacity: capacityDescending[0].dailyCapacity },
      serviceLevels: [
        { name: "DTP", orders: ordersByServiceLevel.get("DTP") ?? 0, meaning: "Door-to-Port; company arranges freight to destination port." },
        { name: "DTD", orders: ordersByServiceLevel.get("DTD") ?? 0, meaning: "Door-to-Door; company chooses a priced transport route." },
        { name: "CRF", orders: ordersByServiceLevel.get("CRF") ?? 0, meaning: "Customer Referred Freight; customer arranges freight, so company pays warehouse cost only." },
      ],
    },
  };
  cachedRoutes = generated;
  cachedWarehouses = data.warehouses;
  return cachedAnalysis;
}

export interface ScenarioInput {
  problem: "minimum-cost" | "cost-time";
  capacityFactor: number;
  freightRateFactor: number;
  warehouseCostFactor: number;
}

export interface ConstraintStabilityRow {
  plant: string;
  used: number;
  rhs: number;
  slack: number;
  guaranteedDecrease: number;
  guaranteedDecreasePercent: number;
}

export async function solveScenario(input: ScenarioInput) {
  getDashboardAnalysis();
  if (!cachedRoutes || !cachedWarehouses) throw new Error("Analysis data was not initialised.");
  const adjustedWarehouses = scaledWarehouses(cachedWarehouses, input.capacityFactor);
  const eligible = eligiblePlantsByOrder(cachedRoutes.routesByOrder);
  const horizonDays = findMinimumHorizon(eligible, adjustedWarehouses, 30);
  if (!horizonDays) return { status: "infeasible" as const, horizonDays: null, objectiveCost: null, companyCost: null, averageTransitDays: null, assignments: [], plantLoads: {}, constraints: [] as ConstraintStabilityRow[] };
  const timePenalty = input.problem === "cost-time" ? 3_000 : 0;
  const routeScore = (route: Route) => {
    const adjustedWarehouse = route.warehouseCost * input.warehouseCostFactor;
    const adjustedFreight = route.freightCost * input.freightRateFactor;
    const transitPenalty = route.transitDays === null ? 0 : route.transitDays * timePenalty;
    return adjustedWarehouse + adjustedFreight + transitPenalty;
  };
  const solved = await solveMinimumCost(cachedRoutes.routesByOrder, adjustedWarehouses, horizonDays, { routeScore });
  const controllableAssignments = solved.assignments.filter((assignment) => assignment.transitDays !== null);
  const companyCost = solved.assignments.reduce((sum, assignment) => sum + assignment.totalCost, 0);
  const averageTransitDays = controllableAssignments.length === 0 ? null : controllableAssignments.reduce((sum, assignment) => sum + (assignment.transitDays ?? 0), 0) / controllableAssignments.length;
  const constraints = adjustedWarehouses.map((warehouse) => {
    const rhs = warehouse.dailyCapacity * horizonDays;
    const used = solved.plantLoads[warehouse.id] ?? 0;
    const slack = rhs - used;
    return { plant: warehouse.id, used, rhs, slack, guaranteedDecrease: slack, guaranteedDecreasePercent: rhs === 0 ? 0 : (slack / rhs) * 100 };
  }).sort((left, right) => left.slack - right.slack);
  return { ...solved, horizonDays, companyCost, averageTransitDays, constraints, timePenalty };
}
