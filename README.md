# OR Supply Chain Optimisation

Capacitated semiconductor logistics optimisation dashboard. Routes ~9,215 customer orders through plants, warehouses, ports and carriers, minimising cost (Problem 1) and trading cost off against delivery time (Problem 2), with sensitivity analysis, a single-order route planner, and bulk-order upload.

## Stack

- Next.js and TypeScript
- SQLite with Prisma (immutable import/scenario/solve-result audit records)
- XLSX workbook parsing on the server
- In-memory candidate-route generation and HiGHS (`highs` WebAssembly) MIP solver
- Plain hand-written CSS and Recharts for figures

## Model

A route is generated only when its plant stocks the product, the plant permits the customer under VMI, the plant connects to the origin port, and (for DTD/DTP) a freight lane covers the order weight. Warehouse capacity is orders/day, so the shortest feasible horizon is checked with a max-flow test (7 days under the source dataset).

- **Problem 1** — minimum-cost integer assignment: each order picks exactly one feasible route, subject to per-plant capacity over the horizon.
- **Problem 2** — weighted goal programme: same variables/constraints plus cost and transit-time goals (user-editable budget % and target days), tie-broken by cost.
- **Sensitivity** — each scenario (capacity, freight, warehouse cost, demand ±%, Problem 2 transit sweep) is independently re-solved and compared against the unperturbed plan; custom one-parameter scenarios are also supported, optionally scoped to a plant/carrier.

Full formulation: [`docs/model.md`](docs/model.md). Module-by-module implementation notes: [`docs/implementation.md`](docs/implementation.md).

## Website

Five tabs, navigable via a pinned section bar:

- **Dataset Analysis** — tables, relationships, network scale, demand/warehouse/freight charts, constraints, feasibility funnel, capacity horizon.
- **Problem 1** — IP formulation, solve button, result summary, warehouse load, carrier mix, searchable order-level plan, sensitivity analysis.
- **Problem 2** — goal-programming formulation, editable targets/weights, goal attainment, comparison with Problem 1, sensitivity analysis, cost-vs-transit trade-off curve.
- **Route Planner** — enter a single order (product, customer, service level, quantity, weight), pick an objective (min cost, min transit, or cost + λ·days); see every feasible route ranked, filtered-out warehouses explained, and the optimal path drawn on the network.
- **Bulk Upload** — upload a CSV/XLSX of orders; validates rows, builds routes with the same filters, solves Problem 1 for the batch, and reports warehouse loads, a downloadable plan, and rejected rows with reasons.

Route Planner and Bulk Upload can plan new orders alone (empty network, full capacity) or combined with the existing 9,215 orders (re-solves everything, reports added cost, horizon change, and re-routed orders).

## Run locally

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

Open `http://localhost:3000`. The dashboard reads `data/Supply chain logistics problem.xlsx` on first request and caches parsed workbook/routes/recent plans on `globalThis`.

### Other scripts

```bash
npm run build   # production build
npm run start   # serve a production build
npm run lint    # tsc --noEmit
npm run smoke   # scripts/smoke.ts — end-to-end solve smoke test
npx tsx scripts/sample-orders.ts  # regenerate data/sample-bulk-orders.csv
```

## Deploy

```bash
docker build -t or-site .
docker run -p 3000:3000 or-site
```

The image creates its SQLite solve-history DB in `/tmp` on start (non-root-safe) and listens on `$PORT`. `render.yaml` is a Render Blueprint for the same image — give the service at least half a CPU; a full Problem 1 + Problem 2 sensitivity run peaks around 480 MB RAM.

## Project layout

```
src/app/            Next.js routes and API handlers (solve, sensitivity, plan, bulk, analysis)
src/components/     Dashboard tabs and shared UI
src/lib/            Workbook parsing, route feasibility, optimizer, analysis, planner, bulk, scenarios
prisma/             Schema for import/scenario/solve-result audit records
data/                Source workbook and sample bulk-order CSV
docs/                Model formulation and implementation notes
scripts/             Smoke test and sample-data generator
```
