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
- `src/components/site.tsx`: project website with three tabs (Dataset Analysis, Problem 1, Problem 2).
- `prisma/schema.prisma`: immutable import, scenario, and solve-result audit records.

## Run

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

Open `http://localhost:3000`. The dashboard reads the supplied workbook from `data/Supply chain logistics problem.xlsx` when running locally.

## Website

- **Dataset Analysis**: tables, relationships, network scale, demand/warehouse/freight charts, constraints, feasibility funnel and capacity horizon.
- **Problem 1**: IP formulation, solve button, result summary, warehouse load, carrier mix, searchable order-level plan, sensitivity analysis.
- **Problem 2**: goal-programming formulation, editable targets/weights, goal attainment, comparison with Problem 1, sensitivity analysis and cost vs transit trade-off curve.
- **Route Planner**: user enters product, customer, service level, quantity and weight and picks an objective (min cost, min transit, or cost + λ·days). `src/lib/planner.ts` enumerates every feasible route for that single order (capacity cannot bind for one order, so this is exact), ranks them, explains which warehouses were filtered out and why, and draws the feasible network with the optimal path highlighted (`/api/plan`).
- **Custom sensitivity** (section 5 of both problem tabs): pick a parameter (capacity, warehouse cost, freight, demand; Problem 2 also transit target and cost budget), a % change or new value, and optionally one warehouse or carrier. `/api/sensitivity` with a `custom` body re-solves and returns baseline vs scenario measures, warehouse/carrier load changes and example re-routed orders.

Sensitivity runs one request per scenario so the page can show progress; each re-solve takes a few seconds. A solve that hits the 45 s time limit with a plan is reported as `feasible` (best plan found) rather than `optimal`.

## Data safeguards

- VMI is plant-to-customer eligibility, not customer-to-plant exclusivity.
- CRF carries warehouse cost only.
- Duplicate freight rows are deduplicated before candidate construction.
- Orders without valid routes and infeasible horizons are reported instead of silently dropped.
