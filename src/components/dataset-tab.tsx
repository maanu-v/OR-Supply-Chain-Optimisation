"use client";

import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardAnalysis } from "@/lib/analysis";
import { axisStyle, Caption, ChartBox, colours, num } from "@/components/common";

const constraints = [
  "Every order must be assigned to exactly one warehouse, origin port and carrier.",
  "Warehouse daily capacity is limited and varies widely (WhCapacities).",
  "Not every warehouse stocks every product (ProductsPerPlant).",
  "Some customers may only be served by specific warehouses (VmiCustomers).",
  "Not every warehouse is connected to every origin port (PlantPorts).",
  "Not every carrier operates on every shipping lane (FreightRates).",
  "Freight cost depends on the weight band into which the shipment falls.",
  "A minimum freight charge applies when the computed cost falls below it.",
  "Service levels (DTD, DTP, CRF) and modes (air, ground) differ in cost and transit time.",
];

export function DatasetTab({ analysis }: { analysis: DashboardAnalysis }) {
  const { feasibility } = analysis;
  const ports = analysis.scale.find((row) => row.label.startsWith("Origin ports"))?.value.split(" / ") ?? [];
  const carriers = analysis.scale.find((row) => row.label === "Carriers available")?.value ?? "";
  const busiest = [...analysis.warehouses].sort((left, right) => right.singlePlantOrders / right.dailyCapacity - left.singlePlantOrders / left.dailyCapacity)[0];
  const costs = analysis.warehouses.map((row) => row.unitCost);

  return (
    <>
      <h2>1. Introduction</h2>
      <p className="lead">
        A global microchip producer needs to fulfil thousands of customer orders through its outbound logistics network. Orders can be routed
        through multiple warehouses, origin ports and transportation carriers. Each warehouse has limited capacity, product availability and
        customer-specific restrictions. Transportation options differ in cost, weight-based pricing, service level and transportation mode.
      </p>
      <p>
        The key challenge is to find cost-effective and feasible logistics decisions while satisfying all customer demand and operational
        constraints. This page summarises the dataset we used; the next two tabs contain the two optimisation problems.
      </p>

      <h2>2. Dataset Overview</h2>
      <p>
        <b>Supply Chain Logistics Dataset</b> - a publicly available real-world dataset of a global microchip producer&apos;s outbound
        logistics (<a href="https://www.kaggle.com/datasets/anisseezzebdi/supply-chain-logistics-problem" target="_blank" rel="noreferrer">Kaggle</a>,
        originally published by Brunel University). It covers one month of customer orders across the company&apos;s full warehouse and port
        network. Seven related tables describe demand, freight rates, warehouse economics and connectivity.
      </p>
      <div className="numbers">
        <div><b>{num(analysis.source.orders)}</b><span>Customer orders</span></div>
        <div><b>{analysis.source.warehouses}</b><span>Warehouses / plants</span></div>
        <div><b>{ports[0]}</b><span>Origin ports</span></div>
        <div><b>{ports[1]}</b><span>Destination port</span></div>
        <div><b>{carriers}</b><span>Carriers (air + ground)</span></div>
      </div>

      <div className="scroll">
        <table className="data">
          <thead><tr><th>Dataset table</th><th className="num">Rows</th><th className="num">Columns</th><th>What it describes</th></tr></thead>
          <tbody>
            {analysis.tables.map((table) => (
              <tr key={table.name}><td><code>{table.name}</code></td><td className="num">{num(table.rows)}</td><td className="num">{table.columns}</td><td>{table.role}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <Caption>Table 1: Size and role of each table in the supply chain logistics dataset</Caption>
      <p>
        <code>OrderList</code> alone cannot be optimised: cost, feasibility and capacity information live in the other six tables.
        While loading we found {analysis.source.duplicateFreightRowsRemoved} exact duplicate rows in <code>FreightRates</code>; these are removed before building routes.
      </p>

      <h2>3. Dataset Relationships</h2>
      <figure>
        <div className="joins">
          <span className="hub">OrderList | {num(analysis.source.orders)} orders</span>
          <div className="stem" />
          <div className="spokes">
            <div>ProductsPerPlant<small>join on Product ID</small></div>
            <div>VmiCustomers<small>join on Customer</small></div>
            <div>WhCapacities + WhCosts<small>join on Plant Code</small></div>
            <div>PlantPorts<small>join on Plant Code</small></div>
            <div>FreightRates<small>join on Port + Carrier</small></div>
          </div>
        </div>
        <Caption>Figure 1: Relationships between the seven dataset tables</Caption>
      </figure>
      <p>
        Every join acts as a feasibility filter, removing routes an order is not allowed to take. A warehouse is usable only if it stocks the
        product and is permitted for that customer. Only warehouse-port pairs listed in <code>PlantPorts</code> are physically connected. Only
        carrier-lane-service combinations present in <code>FreightRates</code> can be priced and selected.
      </p>

      <h3>Scale of the network</h3>
      <table className="data">
        <thead><tr><th>Network attribute</th><th className="num">Value</th><th>Source table</th></tr></thead>
        <tbody>
          {analysis.scale.map((row) => <tr key={row.label}><td>{row.label}</td><td className="num">{row.value}</td><td><code>{row.source}</code></td></tr>)}
        </tbody>
      </table>
      <Caption>Table 2: Scale of the outbound logistics network</Caption>
      <p>With 19 warehouses, 11 ports and 9 carriers, an order can have hundreds of possible routes, so manual selection is not practical.</p>

      <h2>4. Demand Analysis</h2>
      <div className="two-col">
        <figure>
          <ChartBox height={240}>
            <BarChart data={analysis.serviceLevels} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
              <CartesianGrid stroke="#e3e3e3" vertical={false} />
              <XAxis dataKey="name" tick={axisStyle} />
              <YAxis tick={axisStyle} />
              <Tooltip />
              <Bar dataKey="orders" name="Orders">
                {analysis.serviceLevels.map((row, index) => <Cell key={row.name} fill={[colours.blue, colours.orange, colours.green][index]} />)}
              </Bar>
            </BarChart>
          </ChartBox>
          <Caption>Figure 2: Orders by service level</Caption>
        </figure>
        <figure>
          <ChartBox height={240}>
            <BarChart data={analysis.weightBands} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
              <CartesianGrid stroke="#e3e3e3" vertical={false} />
              <XAxis dataKey="band" tick={{ ...axisStyle, fontSize: 11 }} interval={0} />
              <YAxis tick={axisStyle} />
              <Tooltip />
              <Bar dataKey="orders" name="Orders" fill={colours.blue} />
            </BarChart>
          </ChartBox>
          <Caption>Figure 3: Distribution of order weight</Caption>
        </figure>
      </div>
      <table className="data">
        <thead><tr><th>Service level</th><th className="num">Orders</th><th>Meaning</th></tr></thead>
        <tbody>{analysis.serviceLevels.map((row) => <tr key={row.name}><td>{row.name}</td><td className="num">{num(row.orders)}</td><td>{row.meaning}</td></tr>)}</tbody>
      </table>
      <Caption>Table 3: Service levels in OrderList</Caption>
      <p>
        Most orders are light (under 10 kg). For {((analysis.minimumChargeRoutes.binding / analysis.minimumChargeRoutes.total) * 100).toFixed(0)}% of
        the feasible freight routes ({num(analysis.minimumChargeRoutes.binding)} of {num(analysis.minimumChargeRoutes.total)}) the carrier&apos;s
        <b> minimum charge</b> is higher than weight × rate, so the minimum charge is what gets paid. CRF orders ({num(analysis.source.crfOrders)})
        only incur warehouse cost because the customer arranges the freight.
      </p>

      <h2>5. Warehouse Analysis</h2>
      <div className="two-col">
        <figure>
          <ChartBox height={260}>
            <BarChart data={analysis.warehouses} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid stroke="#e3e3e3" vertical={false} />
              <XAxis dataKey="plant" tick={{ ...axisStyle, fontSize: 10 }} interval={0} angle={-50} textAnchor="end" height={48} />
              <YAxis tick={axisStyle} />
              <Tooltip />
              <Bar dataKey="dailyCapacity" name="Orders / day" fill={colours.blue} />
            </BarChart>
          </ChartBox>
          <Caption>Figure 4: Daily order capacity of each warehouse</Caption>
        </figure>
        <figure>
          <ChartBox height={260}>
            <BarChart data={analysis.warehouses} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid stroke="#e3e3e3" vertical={false} />
              <XAxis dataKey="plant" tick={{ ...axisStyle, fontSize: 10 }} interval={0} angle={-50} textAnchor="end" height={48} />
              <YAxis tick={axisStyle} />
              <Tooltip formatter={(value) => `$${Number(value).toFixed(2)}`} />
              <Bar dataKey="unitCost" name="Cost per unit" fill={colours.orange} />
            </BarChart>
          </ChartBox>
          <Caption>Figure 5: Storage cost per unit at each warehouse</Caption>
        </figure>
      </div>
      <p>
        Cost per unit varies from ${Math.min(...costs).toFixed(2)} to ${Math.max(...costs).toFixed(2)} across the warehouses, so warehouse choice
        alone changes the bill a lot. Capacity is also very uneven - a few plants can handle over a thousand orders a day while others handle
        only a handful.
      </p>
      <div className="scroll">
        <table className="data">
          <thead>
            <tr><th>Plant</th><th className="num">Cost / unit</th><th className="num">Capacity / day</th><th className="num">Products stocked</th><th>Origin ports</th><th>VMI</th><th className="num">Historical orders</th><th className="num">Orders only this plant can serve</th></tr>
          </thead>
          <tbody>
            {analysis.warehouses.map((row) => (
              <tr key={row.plant}>
                <td>{row.plant}</td>
                <td className="num">{row.unitCost.toFixed(2)}</td>
                <td className="num">{num(row.dailyCapacity)}</td>
                <td className="num">{num(row.products)}</td>
                <td>{row.ports.join(", ") || "-"}</td>
                <td>{row.vmi ? "yes" : ""}</td>
                <td className="num">{num(row.historicalOrders)}</td>
                <td className="num">{num(row.singlePlantOrders)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Caption>Table 4: Warehouse economics and connectivity (from WhCosts, WhCapacities, ProductsPerPlant, PlantPorts, VmiCustomers)</Caption>

      <h2>6. Freight Rates</h2>
      <div className="two-col">
        <div>
          <table className="data">
            <thead><tr><th>Carrier</th><th className="num">Air rate lines</th><th className="num">Ground rate lines</th><th className="num">Transit (days)</th></tr></thead>
            <tbody>
              {analysis.rateCarriers.map((row) => (
                <tr key={row.carrier}><td>{row.carrier}</td><td className="num">{row.air || "-"}</td><td className="num">{row.ground || "-"}</td><td className="num">{row.minTransit === row.maxTransit ? row.minTransit : `${row.minTransit}-${row.maxTransit}`}</td></tr>
              ))}
            </tbody>
          </table>
          <Caption>Table 5: Freight rate lines per carrier</Caption>
        </div>
        <figure style={{ marginTop: 8 }}>
          <ChartBox height={260}>
            <BarChart data={analysis.transitDays} margin={{ top: 8, right: 12, bottom: 14, left: 4 }}>
              <CartesianGrid stroke="#e3e3e3" vertical={false} />
              <XAxis dataKey="days" tick={axisStyle} label={{ value: "transit days", position: "insideBottom", offset: -8, fontSize: 12 }} />
              <YAxis tick={axisStyle} />
              <Tooltip />
              <Bar dataKey="rateLines" name="Rate lines" fill={colours.green} />
            </BarChart>
          </ChartBox>
          <Caption>Figure 6: Freight rate lines by transit time</Caption>
        </figure>
      </div>
      <p>
        Transit times in the freight data range from {analysis.transitDays[0]?.days} to {analysis.transitDays.at(-1)?.days} days, so for the
        same order a cheap route and a fast route are often different. This is the trade-off studied in Problem 2.
      </p>
      <table className="data">
        <thead><tr><th>Mode</th><th className="num">Rate lines</th><th className="num">Avg rate ($/kg)</th><th className="num">Avg minimum charge ($)</th><th className="num">Avg transit (days)</th></tr></thead>
        <tbody>
          {analysis.modeStats.map((row) => (
            <tr key={row.mode}><td>{row.mode}</td><td className="num">{num(row.rateLines)}</td><td className="num">{row.averageRate.toFixed(2)}</td><td className="num">{row.averageMinimum.toFixed(2)}</td><td className="num">{row.averageTransit.toFixed(2)}</td></tr>
          ))}
        </tbody>
      </table>
      <Caption>Table 6: Average freight terms by transport mode</Caption>
      <p>
        Interestingly, in this dataset the few ground lines are on average both more expensive and faster than air - the usual
        &quot;air is fast, ground is cheap&quot; rule does not hold, which is another reason the routes have to be compared by the model.
      </p>

      <h2>7. Constraints in the Problem</h2>
      <ul className="plain">{constraints.map((item) => <li key={item}>{item}</li>)}</ul>
      <p className="question">
        These restrictions eliminate most warehouse-port-carrier combinations, so the cheapest feasible route cannot be read off the data and
        must be found by optimisation.
      </p>

      <h3>Effect of the feasibility filters</h3>
      <div className="two-col">
        <div className="funnel">
          <div><b>{num(feasibility.unfilteredCombinations)}</b> order × warehouse × port × carrier combinations</div>
          <div style={{ marginLeft: 30 }}><b>{num(feasibility.candidateRoutes)}</b> feasible routes after all joins</div>
          <div style={{ marginLeft: 60 }}><b>{feasibility.averageRoutesPerOrder.toFixed(1)}</b> feasible routes per order on average</div>
          <div style={{ marginLeft: 90 }}><b>{num(feasibility.ordersWithOnePlant)}</b> orders that have only one possible warehouse</div>
          <Caption>Figure 7: Narrowing the solution space before optimisation</Caption>
        </div>
        <figure style={{ marginTop: 0 }}>
          <ChartBox height={230}>
            <BarChart data={analysis.routesPerOrder} margin={{ top: 8, right: 12, bottom: 14, left: 4 }}>
              <CartesianGrid stroke="#e3e3e3" vertical={false} />
              <XAxis dataKey="bucket" tick={axisStyle} label={{ value: "feasible routes", position: "insideBottom", offset: -8, fontSize: 12 }} />
              <YAxis tick={axisStyle} />
              <Tooltip />
              <Bar dataKey="orders" name="Orders" fill={colours.purple} />
            </BarChart>
          </ChartBox>
          <Caption>Figure 8: Number of feasible routes per order</Caption>
        </figure>
      </div>

      <h3>Capacity check</h3>
      <p>
        Warehouse capacity is given in <i>orders per day</i>. If only the total capacity mattered, {feasibility.lowerBoundHorizon} days would be
        enough for all orders. But {num(feasibility.ordersWithOnePlant)} orders can only go to one warehouse. For example {busiest?.plant} is the only
        option for {num(busiest?.singlePlantOrders ?? 0)} orders but can process only {num(busiest?.dailyCapacity ?? 0)} orders per day.
        Using a max-flow check we found that the shortest horizon in which every order can be served is <b>{feasibility.minimumHorizon} days</b>,
        so both optimisation models plan over this horizon.
      </p>
      <table className="data">
        <thead><tr><th>Capacity scenario</th><th className="num">Total orders / day</th><th className="num">Minimum feasible horizon</th></tr></thead>
        <tbody>
          {analysis.capacityHorizon.map((row) => (
            <tr key={row.label} className={row.label === "Baseline" ? "base" : undefined}><td>{row.label}</td><td className="num">{num(row.dailyCapacity)}</td><td className="num">{row.minimumHorizon ?? "> 14"} days</td></tr>
          ))}
        </tbody>
      </table>
      <Caption>Table 7: Shortest planning horizon for different warehouse capacities</Caption>
    </>
  );
}
