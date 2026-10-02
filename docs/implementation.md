# Implementation

## Stack

- Next.js and TypeScript
- SQLite with Prisma
- XLSX workbook parsing on the server
- In-memory candidate-route generation and optimiser
- Tailwind CSS and shadcn-style Radix primitives for the dashboard

## Modules

- `src/lib/workbook.ts`: parses and validates the seven workbook sheets.
- `src/lib/routes.ts`: applies source-faithful feasibility rules and prices routes.
- `src/lib/optimizer.ts`: capacity feasibility, minimum-horizon, and minimum-cost assignment.
- `src/lib/analysis.ts`: scenario construction and dashboard aggregates.
- `prisma/schema.prisma`: immutable import, scenario, and solve-result audit records.

## Run

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

Open `http://localhost:3000`. The dashboard reads the supplied workbook from `data/Supply chain logistics problem.xlsx` when running locally.

## Dashboard results

The optimisation tab offers a small fixed scenario library: baseline, freight +20%, warehouse cost +20%, capacity −20%, and time-focused routing. Every completed solve exposes all selected order routes with plant, port, carrier/mode, transit time, warehouse cost, freight cost, and total company cost. The assignment table supports search and 50-row pagination.

## Data safeguards

- VMI is plant-to-customer eligibility, not customer-to-plant exclusivity.
- CRF carries warehouse cost only.
- Duplicate freight rows are deduplicated before candidate construction.
- Orders without valid routes and infeasible horizons are reported instead of silently dropped.
