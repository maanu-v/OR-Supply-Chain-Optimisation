import path from "node:path";
import * as XLSX from "xlsx";
import { z } from "zod";
import type { FreightRate, Order, SourceData, Warehouse } from "@/lib/types";

const workbookPath = path.join(process.cwd(), "data", "Supply chain logistics problem.xlsx");

const asString = (value: unknown) => String(value ?? "").trim();

function asNumber(value: unknown, field: string, sheet: string, row: number) {
  const parsed = Number(String(value ?? "").replace(/[$,]/g, "").trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`${sheet} row ${row}: ${field} must be numeric`);
  }
  return parsed;
}

function sheetRows(workbook: XLSX.WorkBook, name: string) {
  const sheet = workbook.Sheets[name];
  if (!sheet) {
    throw new Error(`Missing required workbook sheet: ${name}`);
  }
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
}

const serviceLevel = z.enum(["DTD", "DTP", "CRF"]);

export function loadSourceData(filePath = workbookPath): SourceData {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const orderRows = sheetRows(workbook, "OrderList");
  const freightRows = sheetRows(workbook, "FreightRates");
  const costRows = sheetRows(workbook, "WhCosts");
  const capacityRows = sheetRows(workbook, "WhCapacities");
  const productRows = sheetRows(workbook, "ProductsPerPlant");
  const vmiRows = sheetRows(workbook, "VmiCustomers");
  const portRows = sheetRows(workbook, "PlantPorts");

  const orders: Order[] = orderRows.map((row, index) => ({
    id: asString(row["Order ID"]),
    orderDate: row["Order Date"] instanceof Date ? row["Order Date"].toISOString().slice(0, 10) : asString(row["Order Date"]),
    destinationPort: asString(row["Destination Port"]),
    historicalOriginPort: asString(row["Origin Port"]),
    historicalCarrier: asString(row.Carrier),
    historicalPlant: asString(row["Plant Code"]),
    historicalTransitDays: asNumber(row.TPT, "TPT", "OrderList", index + 2),
    customer: asString(row.Customer),
    productId: asString(row["Product ID"]),
    quantity: asNumber(row["Unit quantity"], "Unit quantity", "OrderList", index + 2),
    weight: asNumber(row.Weight, "Weight", "OrderList", index + 2),
    serviceLevel: serviceLevel.parse(asString(row["Service Level"])),
  }));

  const uniqueFreight = new Map<string, FreightRate>();
  freightRows.forEach((row, index) => {
    const rate: FreightRate = {
      id: `rate-${index + 2}`,
      carrier: asString(row.Carrier),
      originPort: asString(row.orig_port_cd),
      destinationPort: asString(row.dest_port_cd),
      minWeight: asNumber(row.minm_wgh_qty, "minm_wgh_qty", "FreightRates", index + 2),
      maxWeight: asNumber(row.max_wgh_qty, "max_wgh_qty", "FreightRates", index + 2),
      serviceLevel: asString(row.svc_cd),
      minimumCost: asNumber(row["minimum cost"], "minimum cost", "FreightRates", index + 2),
      rate: asNumber(row.rate, "rate", "FreightRates", index + 2),
      mode: asString(row.mode_dsc),
      transitDays: asNumber(row.tpt_day_cnt, "tpt_day_cnt", "FreightRates", index + 2),
    };
    const key = [rate.carrier, rate.originPort, rate.destinationPort, rate.minWeight, rate.maxWeight, rate.serviceLevel, rate.minimumCost, rate.rate, rate.mode, rate.transitDays].join("|");
    uniqueFreight.set(key, rate);
  });

  const costs = new Map<string, number>();
  costRows.forEach((row, index) => {
    costs.set(asString(row.WH), asNumber(row["Cost/unit"], "Cost/unit", "WhCosts", index + 2));
  });

  const warehouses: Warehouse[] = capacityRows.map((row, index) => {
    const id = asString(row["Plant ID"]);
    const unitCost = costs.get(id);
    if (unitCost === undefined) {
      throw new Error(`WhCapacities row ${index + 2}: missing WhCosts entry for ${id}`);
    }
    return { id, unitCost, dailyCapacity: asNumber(row["Daily Capacity "], "Daily Capacity", "WhCapacities", index + 2) };
  });

  const productsByPlant = new Map<string, Set<string>>();
  productRows.forEach((row) => {
    const plant = asString(row["Plant Code"]);
    const products = productsByPlant.get(plant) ?? new Set<string>();
    products.add(asString(row["Product ID"]));
    productsByPlant.set(plant, products);
  });

  const portsByPlant = new Map<string, Set<string>>();
  portRows.forEach((row) => {
    const plant = asString(row["Plant Code"]);
    const ports = portsByPlant.get(plant) ?? new Set<string>();
    ports.add(asString(row.Port));
    portsByPlant.set(plant, ports);
  });

  const vmiCustomersByPlant = new Map<string, Set<string>>();
  vmiRows.forEach((row) => {
    const plant = asString(row["Plant Code"]);
    const customers = vmiCustomersByPlant.get(plant) ?? new Set<string>();
    customers.add(asString(row.Customers));
    vmiCustomersByPlant.set(plant, customers);
  });

  return {
    orders,
    rates: [...uniqueFreight.values()],
    warehouses,
    productsByPlant,
    portsByPlant,
    vmiCustomersByPlant,
    duplicatesRemoved: freightRows.length - uniqueFreight.size,
  };
}
