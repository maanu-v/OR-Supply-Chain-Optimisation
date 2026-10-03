// Shared between the server (solver) and the browser (pages). No server-only imports here.

export type ProblemId = "minimum-cost" | "cost-time";

export interface GoalInput {
  /** Cost target expressed as % above the Problem 1 optimum. */
  costBudgetPercent: number;
  /** Target average transit time (days) over DTD/DTP orders. */
  transitTarget: number;
  costWeight: number;
  timeWeight: number;
}

export const defaultGoal: GoalInput = { costBudgetPercent: 5, transitTarget: 1, costWeight: 1, timeWeight: 1 };

export interface Factors {
  capacityFactor: number;
  freightRateFactor: number;
  warehouseCostFactor: number;
  demandFactor: number;
  /** Limit the capacity / warehouse-cost change to these plants (default: all plants). */
  plants?: string[];
  /** Limit the freight-rate change to these carriers (default: all carriers). */
  carriers?: string[];
}

export type CustomParameter = "capacity" | "warehouseCost" | "freight" | "demand" | "transitTarget" | "costBudget";

export interface CustomSensitivityInput {
  parameter: CustomParameter;
  /** % change for capacity, warehouse cost, freight and demand. */
  changePercent: number;
  /** Absolute value for the Problem 2 goal parameters (days or budget %). */
  value?: number;
  /** Plants (capacity, warehouse cost) or carriers (freight) the change applies to; empty = all. */
  targets?: string[];
}

export const baseFactors: Factors = { capacityFactor: 1, freightRateFactor: 1, warehouseCostFactor: 1, demandFactor: 1 };

export interface CustomSensitivityResult {
  label: string;
  baseline: SolveSummary;
  scenario: SolveSummary;
  routesChanged: number | null;
  plantsChanged: number | null;
  /** Capacities are per day (horizon-independent). */
  plantChanges: { plant: string; ordersBefore: number; ordersAfter: number; capacityBefore: number; capacityAfter: number }[];
  carrierChanges: { carrier: string; ordersBefore: number; ordersAfter: number }[];
  /** First few re-routed orders, route written as "plant → port → carrier mode service". */
  examples: { orderId: string; before: string; after: string; costBefore: number; costAfter: number }[];
}

export type ParameterGroup = "Baseline" | "Warehouse capacity" | "Freight rates" | "Warehouse cost" | "Demand volume" | "Transit target";

export interface SensitivityScenario {
  id: string;
  group: ParameterGroup;
  label: string;
  factors: Factors;
  /** Only used by Problem 2: overrides the average-transit goal, all other goal settings unchanged. */
  transitTarget?: number;
}

const scenario = (id: string, group: ParameterGroup, label: string, change: Partial<Factors>): SensitivityScenario => ({
  id,
  group,
  label,
  factors: { ...baseFactors, ...change },
});

// The perturbations proposed in the review: capacity ±10/20 %, freight +10/20 %,
// warehouse per-unit cost shifts and seasonal demand surges.
export const parameterScenarios: SensitivityScenario[] = [
  scenario("baseline", "Baseline", "Baseline", {}),
  scenario("cap-80", "Warehouse capacity", "Capacity −20%", { capacityFactor: 0.8 }),
  scenario("cap-90", "Warehouse capacity", "Capacity −10%", { capacityFactor: 0.9 }),
  scenario("cap-110", "Warehouse capacity", "Capacity +10%", { capacityFactor: 1.1 }),
  scenario("cap-120", "Warehouse capacity", "Capacity +20%", { capacityFactor: 1.2 }),
  scenario("freight-110", "Freight rates", "Freight +10%", { freightRateFactor: 1.1 }),
  scenario("freight-120", "Freight rates", "Freight +20%", { freightRateFactor: 1.2 }),
  scenario("whcost-90", "Warehouse cost", "Warehouse cost −10%", { warehouseCostFactor: 0.9 }),
  scenario("whcost-110", "Warehouse cost", "Warehouse cost +10%", { warehouseCostFactor: 1.1 }),
  scenario("demand-110", "Demand volume", "Demand +10%", { demandFactor: 1.1 }),
  scenario("demand-120", "Demand volume", "Demand +20%", { demandFactor: 1.2 }),
];

// Problem 2 only: tighten/relax the delivery-time goal to trace the cost/time trade-off curve.
export const targetScenarios: SensitivityScenario[] = [0.25, 0.5, 1, 1.5, 2, 3, 3.5].map((transitTarget) => ({
  id: `target-${transitTarget}`,
  group: "Transit target",
  label: `Target ${transitTarget} d`,
  factors: baseFactors,
  transitTarget,
}));

export function findScenario(id: string) {
  return [...parameterScenarios, ...targetScenarios].find((item) => item.id === id);
}

export interface PlantConstraintRow {
  plant: string;
  used: number;
  rhs: number;
  slack: number;
  slackPercent: number;
}

export interface SolveSummary {
  status: "optimal" | "feasible" | "infeasible" | "error";
  message?: string;
  horizonDays: number | null;
  totalCost: number | null;
  warehouseCost: number | null;
  freightCost: number | null;
  averageTransitDays: number | null;
  modeSplit: { mode: string; orders: number }[];
  carrierSplit: { carrier: string; orders: number }[];
  plantLoads: { plant: string; orders: number; capacity: number }[];
  constraints: PlantConstraintRow[];
  solveSeconds: number;
  goal?: {
    costTarget: number;
    transitTarget: number;
    costWeight: number;
    timeWeight: number;
    costOver: number;
    costUnder: number;
    transitOver: number;
    transitUnder: number;
  };
}

export interface SensitivityRow extends SolveSummary {
  scenarioId: string;
  /** Orders whose warehouse/port/carrier choice differs from the baseline plan. */
  routesChanged: number | null;
  /** Orders whose warehouse alone differs from the baseline plan. */
  plantsChanged: number | null;
}
