import type { Route, SourceData } from "@/lib/types";

function freightKey(originPort: string, destinationPort: string) {
  return `${originPort}|${destinationPort}`;
}

export interface RouteGeneration {
  routesByOrder: Map<string, Route[]>;
  diagnostics: { zeroCandidateOrders: string[]; crfOrders: number; candidateRoutes: number };
}

export function buildFeasibleRoutes(data: SourceData): RouteGeneration {
  const warehouseById = new Map(data.warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const ratesByLane = new Map<string, typeof data.rates>();
  for (const rate of data.rates) {
    const key = freightKey(rate.originPort, rate.destinationPort);
    const rates = ratesByLane.get(key) ?? [];
    rates.push(rate);
    ratesByLane.set(key, rates);
  }

  const routesByOrder = new Map<string, Route[]>();
  const diagnostics = { zeroCandidateOrders: [] as string[], crfOrders: 0, candidateRoutes: 0 };

  for (const order of data.orders) {
    const routes: Route[] = [];
    for (const [plant, stockedProducts] of data.productsByPlant) {
      if (!stockedProducts.has(order.productId)) continue;
      const vmiCustomers = data.vmiCustomersByPlant.get(plant);
      if (vmiCustomers && !vmiCustomers.has(order.customer)) continue;
      const warehouse = warehouseById.get(plant);
      if (!warehouse) continue;
      const warehouseCost = order.quantity * warehouse.unitCost;
      const ports = data.portsByPlant.get(plant) ?? new Set<string>();

      for (const originPort of ports) {
        if (order.serviceLevel === "CRF") {
          diagnostics.crfOrders += 1;
          routes.push({
            id: `${order.id}|${plant}|${originPort}|crf`,
            orderId: order.id,
            plant,
            originPort,
            carrier: null,
            mode: null,
            serviceLevel: null,
            transitDays: null,
            warehouseCost,
            freightCost: 0,
            totalCost: warehouseCost,
          });
          continue;
        }

        const lane = ratesByLane.get(freightKey(originPort, order.destinationPort)) ?? [];
        for (const rate of lane) {
          if (order.weight < rate.minWeight || order.weight > rate.maxWeight) continue;
          const freightCost = Math.max(rate.minimumCost, order.weight * rate.rate);
          routes.push({
            id: `${order.id}|${plant}|${originPort}|${rate.id}`,
            orderId: order.id,
            plant,
            originPort,
            carrier: rate.carrier,
            mode: rate.mode,
            serviceLevel: rate.serviceLevel,
            transitDays: rate.transitDays,
            warehouseCost,
            freightCost,
            totalCost: warehouseCost + freightCost,
          });
        }
      }
    }
    if (routes.length === 0) diagnostics.zeroCandidateOrders.push(order.id);
    diagnostics.candidateRoutes += routes.length;
    routesByOrder.set(order.id, routes);
  }

  return { routesByOrder, diagnostics };
}

export function eligiblePlantsByOrder(routesByOrder: Map<string, Route[]>) {
  const plantsByOrder = new Map<string, Set<string>>();
  for (const [orderId, routes] of routesByOrder) {
    plantsByOrder.set(orderId, new Set(routes.map((route) => route.plant)));
  }
  return plantsByOrder;
}
