export type ServiceLevel = "DTD" | "DTP" | "CRF";

export interface Order {
  id: string;
  orderDate: string;
  destinationPort: string;
  customer: string;
  productId: string;
  quantity: number;
  weight: number;
  serviceLevel: ServiceLevel;
}

export interface FreightRate {
  id: string;
  carrier: string;
  originPort: string;
  destinationPort: string;
  minWeight: number;
  maxWeight: number;
  serviceLevel: string;
  minimumCost: number;
  rate: number;
  mode: string;
  transitDays: number;
}

export interface Warehouse {
  id: string;
  unitCost: number;
  dailyCapacity: number;
}

export interface SourceData {
  orders: Order[];
  rates: FreightRate[];
  warehouses: Warehouse[];
  productsByPlant: Map<string, Set<string>>;
  portsByPlant: Map<string, Set<string>>;
  vmiCustomersByPlant: Map<string, Set<string>>;
  duplicatesRemoved: number;
}

export interface Route {
  id: string;
  orderId: string;
  plant: string;
  originPort: string;
  carrier: string | null;
  mode: string | null;
  serviceLevel: string | null;
  transitDays: number | null;
  warehouseCost: number;
  freightCost: number;
  totalCost: number;
}

export interface Assignment {
  orderId: string;
  routeId: string;
}

export interface SolveResult {
  status: "optimal" | "feasible" | "infeasible" | "error";
  objectiveCost: number | null;
  assignments: Assignment[];
  plantLoads: Record<string, number>;
  message?: string;
}
