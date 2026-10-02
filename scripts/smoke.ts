import { getDashboardAnalysis } from "../src/lib/analysis";

const analysis = getDashboardAnalysis();
if (analysis.feasibility.zeroCandidateOrders !== 0) {
  throw new Error(`Expected every order to have a feasible route; found ${analysis.feasibility.zeroCandidateOrders} failures.`);
}
if (analysis.feasibility.minimumHorizon !== 7) {
  throw new Error(`Expected a seven-day baseline horizon; received ${analysis.feasibility.minimumHorizon}.`);
}
console.log(JSON.stringify({ orders: analysis.source.orders, candidates: analysis.feasibility.candidateRoutes, minimumHorizon: analysis.feasibility.minimumHorizon, sensitivity: analysis.sensitivity }, null, 2));
