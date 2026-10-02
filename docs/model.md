# Optimisation model

## Scope

Route all 9,215 orders through the outbound network at minimum company cost. The source dataset defines warehouse capacity as orders processed per day. A one-day plan is infeasible; a seven-day horizon is the shortest feasible horizon under the source constraints.

## Feasible routes

A route is generated only when its plant stocks the product, the plant permits the customer under VMI, the plant connects to the origin port, and (for DTD/DTP) an available freight lane contains the order weight.

VMI restricts a listed **plant** to listed customers. A plant absent from `VmiCustomers` may serve any customer. For CRF, the customer arranges freight: carrier and freight cost are outside the company decision.

## Variables

For each order $o$ and feasible route $r \in R_o$:

$$x_{or} \in \{0, 1\}$$

is one when the route is selected. The planning horizon is $H=7$ days.

## Objective

$$\min \sum_o \sum_{r \in R_o} c_{or}x_{or}$$

For DTD/DTP:

$$c_{or}=q_o h_{p(r)}+\max(m_r, w_o f_r)$$

For CRF:

$$c_{or}=q_o h_{p(r)}$$

where $q_o$ is unit quantity, $h_p$ is warehouse unit cost, $m_r$ is the minimum freight charge, $w_o$ is weight, and $f_r$ is freight rate.

## Constraints

Every order is routed once:

$$\sum_{r \in R_o}x_{or}=1 \quad \forall o$$

A plant processes no more than its daily order capacity across the horizon:

$$\sum_o \sum_{r:p(r)=p}x_{or}\leq H\,\mathrm{capacity}_p \quad \forall p$$

## Cost/time trade-off

The dashboard compares candidate-route cost with freight transit days. A goal-programming extension minimises normalised cost and transit-time overruns against user targets. CRF transit time is excluded because it is customer-controlled.

## Sensitivity analysis

The system re-solves the model after changing capacity, freight rates, warehouse unit costs, or demand. Integer-program assignments do not have stable LP shadow prices; each scenario is therefore independently re-optimised and compared by cost, route changes, utilisation, and minimum feasible horizon.
