# Implementation

## Stack

- Next.js and TypeScript
- SQLite with Prisma
- XLSX workbook parsing on the server
- In-memory candidate-route generation and HiGHS (`highs` WebAssembly) optimiser
- Plain hand-written CSS (`src/app/globals.css`) and Recharts for figures

## Modules

- `src/lib/workbook.ts`: parses and validates the seven workbook sheets.
- `src/lib/routes.ts`: applies source-faithful feasibility rules and prices routes.
- `src/lib/optimizer.ts`: minimum-horizon max-flow check, dominated-route pruning, minimum-cost IP and weighted goal programme.
- `src/lib/analysis.ts`: dataset statistics, scenario solving (cached in memory) and sensitivity comparison.
- `src/lib/scenarios.ts`: shared scenario/goal definitions and result types (safe for the browser).
- `src/app/api/solve`, `src/app/api/sensitivity`: solve one plan / one sensitivity scenario.
- `src/components/site.tsx`: project website with five tabs (Dataset Analysis, Problem 1, Problem 2, Route Planner, Bulk Upload).
- `prisma/schema.prisma`: immutable import, scenario, and solve-result audit records.

## Run

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

Open `http://localhost:3000`. The dashboard reads the supplied workbook from `data/Supply chain logistics problem.xlsx` when running locally.

## Deploy

The `Dockerfile` builds a production image; it creates the SQLite solve history in `/tmp` on start and listens on `$PORT`.

```bash
docker build -t or-site .
docker run -p 3000:3000 or-site
```

`render.yaml` is a Render Blueprint for the same image. Measured in a container limited to 512 MB and 1 CPU, a full Problem 1 + Problem 2 sensitivity run peaks at about 480 MB with no restarts, and each re-solve takes 1 to 5 s. With 0.1 CPU (Render's free tier) the first Problem 2 request took about 200 s, so give the service at least half a CPU.

Caches (workbook, feasible routes, the 12 most recent solved plans) are kept on `globalThis` so the page and the API route bundles share one copy.

## Website

- **Dataset Analysis**: tables, relationships, network scale, demand/warehouse/freight charts, constraints, feasibility funnel and capacity horizon.
- **Problem 1**: IP formulation, solve button, result summary, warehouse load, carrier mix, searchable order-level plan, sensitivity analysis.
- **Problem 2**: goal-programming formulation, editable targets/weights, goal attainment, comparison with Problem 1, sensitivity analysis and cost vs transit trade-off curve.
- **Route Planner**: user enters product, customer, service level, quantity and weight and picks an objective (min cost, min transit, or cost + λ·days). `src/lib/planner.ts` enumerates every feasible route for that single order (capacity cannot bind for one order, so this is exact), ranks them, explains which warehouses were filtered out and why, and draws the feasible network with the optimal path highlighted (`/api/plan`).
- **Bulk Upload**: user uploads a CSV or Excel file of orders (`Product ID`, `Customer`, `Service Level`, `Unit quantity`, `Weight`, optional `Order ID`). `src/lib/bulk.ts` validates the rows, builds feasible routes with the same filters, and solves the Problem 1 model for the batch against full warehouse capacity over its shortest feasible horizon (`POST /api/bulk`). The tab shows the batch summary, warehouse loads, a downloadable order-level plan and the rejected rows with the reason for each. `GET /api/bulk` serves `data/sample-bulk-orders.csv`, which `npx tsx scripts/sample-orders.ts` regenerates.
- **Custom sensitivity** (section 5 of both problem tabs): pick a parameter (capacity, warehouse cost, freight, demand; Problem 2 also transit target and cost budget), a % change or new value, and optionally one or more warehouses or carriers. `/api/sensitivity` with a `custom` body re-solves and returns baseline vs scenario measures, warehouse/carrier load changes and example re-routed orders.
- **Navigation**: the tab bar and a section bar stay pinned at the top. The section bar is built from each tab's numbered `h2` headings, jumps to them, and highlights the section being read.

Sensitivity runs one request per scenario so the page can show progress; each re-solve takes a few seconds. A solve that hits the 45 s time limit with a plan is reported as `feasible` (best plan found) rather than `optimal`.

## Data safeguards

- VMI is plant-to-customer eligibility, not customer-to-plant exclusivity.
- CRF carries warehouse cost only.
- Duplicate freight rows are deduplicated before candidate construction.
- Orders without valid routes and infeasible horizons are reported instead of silently dropped.
