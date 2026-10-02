import { cn } from "@/lib/utils";

export function HorizontalBars({ data, valueKey, color = "bg-blue-700" }: { data: Record<string, string | number>[]; valueKey: string; color?: string }) {
  const maximum = Math.max(...data.map((row) => Number(row[valueKey])), 1);
  return <div className="space-y-3 py-2">{data.map((row) => { const value = Number(row[valueKey]); const label = String(row.plant ?? row.carrier ?? row.mode); return <div key={label} className="grid grid-cols-[68px_1fr_52px] items-center gap-3 text-xs"><span className="font-medium text-slate-600">{label}</span><span className="h-6 overflow-hidden rounded-sm bg-slate-100"><span className={cn("block h-full rounded-sm", color)} style={{ width: `${Math.max((value / maximum) * 100, 2)}%` }} /></span><span className="text-right text-slate-500">{value.toLocaleString()}</span></div>; })}</div>;
}

export function SensitivityLine({ data }: { data: { label: string; minimumHorizon: number | null }[] }) {
  const values = data.map((item) => item.minimumHorizon ?? 0);
  const maximum = Math.max(...values, 1);
  const minimum = Math.min(...values);
  const points = values.map((value, index) => `${18 + index * 65},${174 - ((value - minimum) / Math.max(maximum - minimum, 1)) * 120}`).join(" ");
  return <div><svg viewBox="0 0 300 200" className="h-56 w-full overflow-visible" role="img" aria-label="Minimum feasible days by capacity scenario"><line x1="18" y1="174" x2="282" y2="174" stroke="#cbd5e1" /><polyline points={points} fill="none" stroke="#1d4ed8" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />{values.map((value, index) => { const x = 18 + index * 65; const y = 174 - ((value - minimum) / Math.max(maximum - minimum, 1)) * 120; return <g key={data[index].label}><circle cx={x} cy={y} r="5" fill="#1d4ed8" /><text x={x} y="193" textAnchor="middle" className="fill-slate-500 text-[11px]">{data[index].label}</text><text x={x} y={y - 10} textAnchor="middle" className="fill-slate-700 text-[11px]">{value}d</text></g>; })}</svg></div>;
}
