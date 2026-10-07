import { baseRoutes, countChanges, solveScenario, sourceData, summarise } from "@/lib/analysis";
import { findMinimumHorizon, solveAssignment } from "@/lib/optimizer";
import { planRoute, plannerOrderId, plannerRoutes, type PlannerInput, type PlannerResult } from "@/lib/planner";
import { eligiblePlantsByOrder } from "@/lib/routes";
import { baseFactors, type SolveSummary } from "@/lib/scenarios";
import type { Assignment, Route } from "@/lib/types";

/** "new": plan only the new orders on an empty network. "combined": re-plan them together with the dataset orders. */
export type PlanScope = "new" | "combined";

/** How adding the new orders changes the Problem 1 plan of the dataset orders. */
export interface ExistingComparison {
  existingOrders: number;
  baselineCost: number;
  baselineHorizon: number;
  combinedCost: number;
  combinedHorizon: number;
  /** Combined total cost minus the baseline cost: what the new orders really cost the network. */
  addedCost: number;
  /** Cost of the routes given to the new orders themselves. */
  newOrdersCost: number;
  /** Dataset orders whose warehouse, port or carrier differs from the baseline plan. */
  existingRerouted: number;
  existingPlantChanged: number;
}

export interface ScopedPlan extends SolveSummary {
  /** Assignments of the new orders only; in combined scope the summary still covers every order. */
  newAssignments: Assignment[];
  comparison?: ExistingComparison;
}

/**
 * Minimum-cost assignment (Problem 1 model) for a set of new orders, either on their own or
 * appended to the dataset orders so that all of them compete for the same warehouse capacity.
 */
export async function solveNewOrders(newRoutes: Map<string, Route[]>, scope: PlanScope): Promise<ScopedPlan> {
  const started = Date.now();
  const { warehouses } = sourceData();
  const seconds = () => (Date.now() - started) / 1000;
  const empty = { horizonDays: null, totalCost: null, warehouseCost: null, freightCost: null, averageTransitDays: null, modeSplit: [], carrierSplit: [], plantLoads: [], constraints: [], newAssignments: [] };

  const baseline = scope === "combined" ? await solveScenario({ ...baseFactors, problem: "minimum-cost" }) : undefined;
  if (baseline && (baseline.totalCost === null || baseline.horizonDays === null)) {
    return { ...empty, status: "infeasible", solveSeconds: seconds(), message: "The dataset orders have no feasible plan to extend." };
  }
  const routes = baseline ? new Map([...baseRoutes().routesByOrder, ...newRoutes]) : newRoutes;
  const horizonDays = findMinimumHorizon(eligiblePlantsByOrder(routes), warehouses, 30);
  if (!horizonDays) {
    return { ...empty, status: "infeasible", solveSeconds: seconds(), message: "Capacity cannot serve every order within 30 days." };
  }
  const solved = await solveAssignment(routes, warehouses, horizonDays);
  if (solved.status === "infeasible" || solved.status === "error") {
    return { ...empty, status: solved.status, horizonDays, solveSeconds: seconds(), message: solved.message };
  }

  const summary = summarise(solved.assignments, warehouses, horizonDays, solved.plantLoads);
  const newAssignments = solved.assignments.filter((assignment) => newRoutes.has(assignment.orderId));
  const changes = baseline ? countChanges(baseline.assignments, solved.assignments) : undefined;
  return {
    ...summary,
    status: solved.status,
    horizonDays,
    solveSeconds: seconds(),
    newAssignments,
    comparison: baseline && {
      existingOrders: baseline.assignments.length,
      baselineCost: baseline.totalCost!,
      baselineHorizon: baseline.horizonDays!,
      combinedCost: summary.totalCost,
      combinedHorizon: horizonDays,
      addedCost: summary.totalCost - baseline.totalCost!,
      newOrdersCost: newAssignments.reduce((sum, assignment) => sum + assignment.totalCost, 0),
      existingRerouted: changes?.routesChanged ?? 0,
      existingPlantChanged: changes?.plantsChanged ?? 0,
    },
  };
}

/**
 * Route planner for one order. In combined scope the order is added to the dataset orders and the
 * whole Problem 1 model is re-solved, so the route can differ from the order's own cheapest route
 * when that warehouse is already full.
 */
export async function planSingleOrder(input: PlannerInput, scope: PlanScope): Promise<PlannerResult> {
  const data = sourceData();
  const result = planRoute(data, scope === "combined" ? { ...input, objective: "cost" } : input);
  if (scope !== "combined" || result.routes.length === 0) return result;
  const plan = await solveNewOrders(new Map([[plannerOrderId, plannerRoutes(data, input)]]), "combined");
  if (!plan.comparison) throw new Error(plan.message ?? "The combined plan could not be solved.");
  return { ...result, combined: { ...plan.comparison, routeId: plan.newAssignments[0]?.routeId ?? null } };
}
