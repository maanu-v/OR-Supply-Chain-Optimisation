import * as XLSX from "xlsx";
import { sourceData } from "@/lib/analysis";
import { bulkColumns, bulkOrderLimit } from "@/lib/bulk-format";
import { solveNewOrders, type ExistingComparison, type PlanScope } from "@/lib/combined";
import { buildFeasibleRoutes } from "@/lib/routes";
import type { SolveSummary } from "@/lib/scenarios";
import type { Assignment, Order, ServiceLevel, SourceData } from "@/lib/types";

export interface BulkRejection {
  /** Spreadsheet row number (the header is row 1). */
  row: number;
  orderId: string;
  reason: string;
}

export interface BulkAssignment extends Assignment {
  productId: string;
  customer: string;
  serviceLevel: ServiceLevel;
  quantity: number;
  weight: number;
}

export interface BulkResult extends SolveSummary {
  scope: PlanScope;
  /** Set in combined scope: effect of the batch on the plan of the dataset orders. */
  comparison?: ExistingComparison;
  rowsRead: number;
  planned: number;
  rejected: BulkRejection[];
  assignments: BulkAssignment[];
}

const serviceLevels = new Set<string>(["DTD", "DTP", "CRF"]);

/** Header lookup that ignores case, spaces and underscores, so "unit_quantity" matches "Unit quantity". */
function reader(row: Record<string, unknown>) {
  const cells = new Map(Object.entries(row).map(([key, value]) => [key.toLowerCase().replace(/[\s_]/g, ""), String(value ?? "").trim()]));
  return (name: string) => cells.get(name.toLowerCase().replace(/[\s_]/g, "")) ?? "";
}

/** Reads the first sheet of a CSV or Excel file into orders, collecting the rows that cannot be used. */
export function parseBulkOrders(file: Buffer, destinationPort: string) {
  const workbook = XLSX.read(file, { type: "buffer", raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = sheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false }) : [];
  if (rows.length === 0) throw new Error("The file has no data rows.");
  if (rows.length > bulkOrderLimit) throw new Error(`The file has ${rows.length} rows; the limit is ${bulkOrderLimit}.`);
  const header = reader(Object.fromEntries(Object.keys(rows[0]).map((key) => [key, key])));
  const missing = bulkColumns.filter((column) => column.required && !header(column.name)).map((column) => column.name);
  if (missing.length > 0) throw new Error(`Missing required column(s): ${missing.join(", ")}.`);

  const orders: Order[] = [];
  const rowByOrder = new Map<string, number>();
  const rejected: BulkRejection[] = [];
  rows.forEach((raw, index) => {
    const cell = reader(raw);
    const row = index + 2;
    const orderId = cell("Order ID") || `ROW-${row}`;
    const reject = (reason: string) => rejected.push({ row, orderId, reason });
    const quantity = Number(cell("Unit quantity").replace(/,/g, ""));
    const weight = Number(cell("Weight").replace(/,/g, ""));
    const serviceLevel = cell("Service Level").toUpperCase();
    if (!cell("Product ID")) return reject("Product ID is blank");
    if (!cell("Customer")) return reject("Customer is blank");
    if (!serviceLevels.has(serviceLevel)) return reject(`Service Level "${cell("Service Level")}" is not DTD, DTP or CRF`);
    if (!Number.isFinite(quantity) || quantity <= 0) return reject("Unit quantity is not a positive number");
    if (!Number.isFinite(weight) || weight <= 0) return reject("Weight is not a positive number");
    if (rowByOrder.has(orderId)) return reject(`Order ID repeats row ${rowByOrder.get(orderId)}`);
    rowByOrder.set(orderId, row);
    orders.push({
      id: orderId,
      orderDate: "",
      destinationPort,
      historicalOriginPort: "",
      historicalCarrier: "",
      historicalPlant: "",
      historicalTransitDays: 0,
      customer: cell("Customer"),
      productId: cell("Product ID"),
      quantity,
      weight,
      serviceLevel: serviceLevel as ServiceLevel,
    });
  });
  return { rowsRead: rows.length, orders, rowByOrder, rejected };
}

/** Why an order has no feasible route, using the same filters as route generation. */
function infeasibleReason(data: SourceData, order: Order) {
  const stocking = [...data.productsByPlant].filter(([, products]) => products.has(order.productId)).map(([plant]) => plant);
  if (stocking.length === 0) return "Product is not stocked by any warehouse";
  const allowed = stocking.filter((plant) => {
    const vmi = data.vmiCustomersByPlant.get(plant);
    return !vmi || vmi.has(order.customer);
  });
  if (allowed.length === 0) return "Stocking warehouses are VMI-restricted to other customers";
  if (!allowed.some((plant) => data.portsByPlant.get(plant)?.size)) return "Stocking warehouses have no origin port";
  return `No carrier lane covers a ${order.weight} kg shipment`;
}

/**
 * Minimum-cost plan for an uploaded batch, using the same feasibility filters and integer
 * programme as Problem 1. In "new" scope the batch is planned on its own against the full
 * warehouse capacities; in "combined" scope it is appended to the dataset orders and everything
 * is re-planned together.
 */
export async function planBulkOrders(file: Buffer, scope: PlanScope): Promise<BulkResult> {
  const data = sourceData();
  const parsed = parseBulkOrders(file, data.orders[0]?.destinationPort ?? "");
  const rejected = [...parsed.rejected];
  let orders = parsed.orders;
  if (scope === "combined") {
    const existing = new Set(data.orders.map((order) => order.id));
    orders = orders.filter((order) => {
      if (!existing.has(order.id)) return true;
      rejected.push({ row: parsed.rowByOrder.get(order.id) ?? 0, orderId: order.id, reason: "Order ID already exists in OrderList" });
      return false;
    });
  }
  const generated = buildFeasibleRoutes({ ...data, orders });
  const orderById = new Map(orders.map((order) => [order.id, order]));
  for (const orderId of generated.diagnostics.zeroCandidateOrders) {
    rejected.push({ row: parsed.rowByOrder.get(orderId) ?? 0, orderId, reason: infeasibleReason(data, orderById.get(orderId)!) });
    generated.routesByOrder.delete(orderId);
  }
  rejected.sort((left, right) => left.row - right.row);

  const base = { scope, rowsRead: parsed.rowsRead, rejected };
  if (generated.routesByOrder.size === 0) {
    return { ...base, planned: 0, assignments: [], status: "infeasible", solveSeconds: 0, message: "None of the uploaded rows has a feasible route.", horizonDays: null, totalCost: null, warehouseCost: null, freightCost: null, averageTransitDays: null, modeSplit: [], carrierSplit: [], plantLoads: [], constraints: [] };
  }
  const { newAssignments, ...plan } = await solveNewOrders(generated.routesByOrder, scope);
  const assignments = newAssignments.map((assignment) => {
    const order = orderById.get(assignment.orderId)!;
    return { ...assignment, productId: order.productId, customer: order.customer, serviceLevel: order.serviceLevel, quantity: order.quantity, weight: order.weight };
  });
  return { ...base, ...plan, planned: assignments.length, assignments };
}
