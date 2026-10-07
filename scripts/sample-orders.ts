import { writeFileSync } from "node:fs";
import path from "node:path";
import { loadSourceData } from "../src/lib/workbook";

// Builds data/sample-bulk-orders.csv for the Bulk Upload tab: every 37th order of OrderList
// under a new ID, followed by a few rows that the planner must reject.
const { orders } = loadSourceData();
const rows = orders.filter((_, index) => index % 37 === 0).map((order, index) => [
  `B-${String(index + 1).padStart(4, "0")}`, order.productId, order.customer, order.serviceLevel, order.quantity, order.weight,
]);
const [first] = rows;
rows.push(
  ["B-9001", "9999999", first[2], "DTP", 120, 4.5], // product not stocked anywhere
  ["B-9002", first[1], first[2], "EXPRESS", 120, 4.5], // unknown service level
  ["B-9003", first[1], first[2], "DTD", 120, ""], // missing weight
  ["B-9004", first[1], first[2], "DTD", 120, 250000], // heavier than any freight weight band
  ["B-0001", first[1], first[2], "DTP", 120, 4.5], // repeated order ID
);
const csv = [["Order ID", "Product ID", "Customer", "Service Level", "Unit quantity", "Weight"], ...rows].map((row) => row.join(",")).join("\n");
const target = path.join(process.cwd(), "data", "sample-bulk-orders.csv");
writeFileSync(target, `${csv}\n`);
console.log(`${rows.length} rows written to ${target}`);
