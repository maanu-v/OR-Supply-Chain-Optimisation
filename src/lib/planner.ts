import { buildFeasibleRoutes } from "@/lib/routes";
import type { Order, Route, ServiceLevel, SourceData } from "@/lib/types";

export type PlannerObjective = "cost" | "time" | "weighted";

export interface PlannerInput {
  productId: string;
  customer: string;
  serviceLevel: ServiceLevel;
  quantity: number;
  weight: number;
  objective: PlannerObjective;
  /** $ per transit day, only for the weighted objective. */
  dayValue: number;
}

export interface PlannerRoute {
  plant: string;
  originPort: string;
  carrier: string | null;
  mode: string | null;
  serviceLevel: string | null;
  transitDays: number | null;
  warehouseCost: number;
  freightCost: number;
  totalCost: number;
  score: number;
}

export interface PlannerResult {
  destinationPort: string;
  /** Feasible routes ranked by the chosen objective; the first one is optimal. */
  routes: PlannerRoute[];
  /** How the 19 warehouses were filtered for this order. */
  warehouses: { plant: string; status: "feasible" | "no stock" | "VMI restricted" | "no port" | "no freight lane" }[];
}

function score(route: Route, input: PlannerInput) {
  const transit = route.transitDays ?? 0;
  if (input.objective === "time") return transit;
  if (input.objective === "weighted") return route.totalCost + input.dayValue * transit;
  return route.totalCost;
}

/**
 * Optimal route for one order. With a single order the warehouse capacity constraint can
 * never bind (every plant handles at least one order a day), so the assignment model reduces
 * to choosing the best element of the feasible set; we enumerate it exactly.
 */
export function planRoute(data: SourceData, input: PlannerInput): PlannerResult {
  const destinationPort = data.orders[0]?.destinationPort ?? "";
  const order: Order = {
    id: "planner",
    orderDate: "",
    destinationPort,
    historicalOriginPort: "",
    historicalCarrier: "",
    historicalPlant: "",
    historicalTransitDays: 0,
    customer: input.customer,
    productId: input.productId,
    quantity: input.quantity,
    weight: input.weight,
    serviceLevel: input.serviceLevel,
  };
  const routes = buildFeasibleRoutes({ ...data, orders: [order] }).routesByOrder.get("planner") ?? [];
  const ranked = routes
    .map((route) => ({ route, score: score(route, input) }))
    // ties on the objective are broken by cost, then by transit time
    .sort((left, right) => left.score - right.score || left.route.totalCost - right.route.totalCost || (left.route.transitDays ?? 0) - (right.route.transitDays ?? 0))
    .map(({ route, score: value }) => ({
      plant: route.plant,
      originPort: route.originPort,
      carrier: route.carrier,
      mode: route.mode,
      serviceLevel: route.serviceLevel,
      transitDays: route.transitDays,
      warehouseCost: route.warehouseCost,
      freightCost: route.freightCost,
      totalCost: route.totalCost,
      score: value,
    }));

  const routedPlants = new Set(ranked.map((route) => route.plant));
  const warehouses = data.warehouses.map((warehouse) => {
    const plant = warehouse.id;
    let status: PlannerResult["warehouses"][number]["status"] = "feasible";
    if (!routedPlants.has(plant)) {
      const vmi = data.vmiCustomersByPlant.get(plant);
      if (!data.productsByPlant.get(plant)?.has(input.productId)) status = "no stock";
      else if (vmi && !vmi.has(input.customer)) status = "VMI restricted";
      else if (!data.portsByPlant.get(plant)?.size) status = "no port";
      else status = "no freight lane";
    }
    return { plant, status };
  }).sort((left, right) => left.plant.localeCompare(right.plant, "en", { numeric: true }));

  return { destinationPort, routes: ranked, warehouses };
}
