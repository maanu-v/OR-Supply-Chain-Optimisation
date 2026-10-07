// Upload format of the Bulk Upload tab. Kept free of server imports so the client can use it.
export const bulkColumns = [
  { name: "Order ID", required: false, example: "B-0001", note: "generated from the row number when blank" },
  { name: "Product ID", required: true, example: "1700106", note: "must be stocked in ProductsPerPlant" },
  { name: "Customer", required: true, example: "V55555_53", note: "checked against VmiCustomers" },
  { name: "Service Level", required: true, example: "DTP", note: "DTD, DTP or CRF" },
  { name: "Unit quantity", required: true, example: "808", note: "positive number" },
  { name: "Weight", required: true, example: "14.3", note: "kg, positive number" },
] as const;

export const bulkOrderLimit = 10000;
