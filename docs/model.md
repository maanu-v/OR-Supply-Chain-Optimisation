# Optimisation model

## Scope

Route all 9,215 orders through the outbound network. The source dataset defines warehouse capacity as orders processed per day. A one-day plan is infeasible; a seven-day horizon is the shortest feasible horizon under the source constraints (checked with a max-flow test).

## Feasible routes

A route is generated only when its plant stocks the product, the plant permits the customer under VMI, the plant connects to the origin port, and (for DTD/DTP) an available freight lane contains the order weight.

VMI restricts a listed **plant** to listed customers. A plant absent from `VmiCustomers` may serve any customer. For CRF, the customer arranges freight: carrier and freight cost are outside the company decision.

Capacity depends only on the plant, so for every (order, plant) pair routes that are no cheaper and no faster than another route are dropped before solving (`pruneDominated` in `src/lib/optimizer.ts`). Problem 1 keeps only the cheapest route per pair. This is exact.

## Problem 1: minimum-cost assignment (integer programme)

For each order $o$ and feasible route $r \in R_o$, $x_{or} \in \{0, 1\}$; horizon $H=7$ days.

$$\min \sum_o \sum_{r \in R_o} c_{or}x_{or}$$

with $c_{or}=q_o h_{p(r)}+\max(m_r, w_o f_r)$ for DTD/DTP and $c_{or}=q_o h_{p(r)}$ for CRF.

$$\sum_{r \in R_o}x_{or}=1 \quad \forall o \qquad \sum_o \sum_{r:p(r)=p}x_{or}\leq H\,\mathrm{capacity}_p \quad \forall p$$

## Problem 2: cost vs delivery time (weighted goal programme)

Same variables and constraints, plus two goals. $C^*$ is the Problem 1 optimum raised by a user budget %, $T^*$ the target average transit over the $N$ DTD/DTP orders:

$$\sum c_{or}x_{or} - d_C^+ \le C^* \qquad \sum t_r x_{or} - d_T^+ \le T^* N$$

$$\min\ w_C\frac{d_C^+}{C^*} + w_T\frac{d_T^+}{T^* N} + 10^{-3}\frac{\sum c_{or}x_{or}}{C^*}$$

Only over-achievement is penalised, so the textbook equality form with $d^-$ reduces to these inequalities ($d^-$ is the row slack). The small cost term picks the cheapest plan when both goals are met. The solver objective is multiplied through by $C^*$ so coefficients stay in currency units. Defaults: budget 5 %, $T^*=1$ day, $w_C=w_T=1$.

Both problems are solved with HiGHS (`highs` WebAssembly build) using a 0.1 % relative MIP gap and a 45 s time limit.

## Sensitivity analysis

Each scenario is re-solved independently (integer programmes have no reliable LP shadow prices) and compared with the unperturbed plan of the same problem: capacity ±10/20 %, freight +10/20 %, warehouse unit cost ±10 %, demand +10/20 % (order quantity and weight scaled, so weight bands are re-evaluated). Problem 2 also sweeps the transit target (0.25–3.5 days) to trace the cost/time trade-off. Scenario definitions live in `src/lib/scenarios.ts`.
