"use client";

import { useMemo, useState, type ReactNode } from "react";

type Cell = string | number | null | undefined;

export interface DataColumn<T> {
  id: string;
  header: string;
  /** Plain value used for sorting, filtering and search; defaults to what the cell displays. */
  value: (row: T) => Cell;
  /** Rendered cell content; falls back to the plain value. */
  cell?: (row: T) => ReactNode;
  /** Right-aligned, sorted as a number and filtered with a min / max range. */
  numeric?: boolean;
  /** Column holds a decision made by the solver (blue shading, as in the other tables). */
  solver?: boolean;
  /** Extra class for a body cell. */
  className?: (row: T) => string | undefined;
  /** Left out of the free-text search box. */
  noSearch?: boolean;
}

interface Props<T> {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  rowClass?: (row: T) => string | undefined;
  /** Name of one row, used in the row counter ("orders", "routes", ...). */
  unit?: string;
  /** Rows per page; every row is shown on one page when omitted. */
  pageSize?: number;
  /** Shows a free-text search box over the text columns. */
  searchPlaceholder?: string;
  /** Per-column filter row below the headers (default on). */
  filters?: boolean;
}

type Sort = { id: string; descending: boolean } | null;
type Range = { min: string; max: string };

const SELECT_LIMIT = 20;
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const num = (value: number) => value.toLocaleString("en-US");
const isBlank = (value: Cell): value is null | undefined | "" => value === null || value === undefined || value === "";

/** Sort and filter a table of records: click a header to sort, use the row under it to filter. */
export function DataTable<T>({ columns, rows, rowKey, rowClass, unit = "rows", pageSize, searchPlaceholder, filters = true }: Props<T>) {
  const [sort, setSort] = useState<Sort>(null);
  const [text, setText] = useState<Record<string, string>>({});
  const [ranges, setRanges] = useState<Record<string, Range>>({});
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  // numeric columns get a range, text columns a drop-down when they have few distinct values
  const kinds = useMemo(() => {
    const result: Record<string, { kind: "range" } | { kind: "select"; options: string[] } | { kind: "text" }> = {};
    for (const column of columns) {
      if (column.numeric) {
        result[column.id] = { kind: "range" };
        continue;
      }
      const distinct = new Set<string>();
      for (const row of rows) {
        const value = column.value(row);
        if (!isBlank(value)) distinct.add(String(value));
        if (distinct.size > SELECT_LIMIT) break;
      }
      result[column.id] = distinct.size <= SELECT_LIMIT ? { kind: "select", options: [...distinct].sort(collator.compare) } : { kind: "text" };
    }
    return result;
  }, [columns, rows]);

  const active = query.trim() !== "" || Object.values(text).some((value) => value !== "") || Object.values(ranges).some((range) => range.min !== "" || range.max !== "");

  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (search && !columns.some((column) => !column.numeric && !column.noSearch && String(column.value(row) ?? "").toLowerCase().includes(search))) return false;
      for (const column of columns) {
        const wanted = text[column.id];
        if (wanted) {
          const value = String(column.value(row) ?? "");
          const kind = kinds[column.id];
          if (kind.kind === "select" ? value !== wanted : !value.toLowerCase().includes(wanted.trim().toLowerCase())) return false;
        }
        const range = ranges[column.id];
        if (range && (range.min !== "" || range.max !== "")) {
          const value = column.value(row);
          if (typeof value !== "number") return false;
          if (range.min !== "" && value < Number(range.min)) return false;
          if (range.max !== "" && value > Number(range.max)) return false;
        }
      }
      return true;
    });
    const column = sort ? columns.find((candidate) => candidate.id === sort.id) : undefined;
    if (!sort || !column) return filtered;
    const direction = sort.descending ? -1 : 1;
    return [...filtered].sort((left, right) => {
      const a = column.value(left);
      const b = column.value(right);
      if (isBlank(a) || isBlank(b)) return isBlank(a) === isBlank(b) ? 0 : isBlank(a) ? 1 : -1; // blanks always last
      return direction * (typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b)));
    });
  }, [rows, columns, kinds, text, ranges, query, sort]);

  const pages = pageSize ? Math.max(1, Math.ceil(visible.length / pageSize)) : 1;
  const current = Math.min(page, pages - 1);
  const shown = pageSize ? visible.slice(current * pageSize, (current + 1) * pageSize) : visible;

  function toggleSort(id: string) {
    // ascending, then descending, then back to the original order
    setSort((previous) => (previous?.id !== id ? { id, descending: false } : previous.descending ? null : { id, descending: true }));
    setPage(0);
  }

  function reset() {
    setText({});
    setRanges({});
    setQuery("");
    setSort(null);
    setPage(0);
  }

  return (
    <>
      <div className="table-tools">
        {searchPlaceholder ? (
          <input className="search" value={query} placeholder={searchPlaceholder} aria-label="Search the table" onChange={(event) => { setQuery(event.target.value); setPage(0); }} />
        ) : <span />}
        <div className="pager">
          <span>
            {visible.length === rows.length ? num(rows.length) : `${num(visible.length)} of ${num(rows.length)}`} {unit}
            {pageSize ? ` · page ${current + 1} of ${pages}` : ""}
          </span>
          {(active || sort !== null) && <button onClick={reset}>Reset</button>}
          {pageSize !== undefined && (
            <>
              <button disabled={current === 0} onClick={() => setPage(current - 1)}>Prev</button>
              <button disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Next</button>
            </>
          )}
        </div>
      </div>
      <div className="scroll">
        <table className="data sortable">
          <thead>
            <tr>
              {columns.map((column) => {
                const sorted = sort?.id === column.id ? (sort.descending ? "descending" : "ascending") : "none";
                return (
                  <th key={column.id} className={[column.numeric ? "num" : "", column.solver ? "solver" : ""].filter(Boolean).join(" ") || undefined} aria-sort={sorted}>
                    <button className="sort-button" onClick={() => toggleSort(column.id)} title="Click to sort">
                      {column.header}
                      <span className={`sort-mark${sorted === "none" ? "" : " on"}`} aria-hidden>{sorted === "ascending" ? "▲" : sorted === "descending" ? "▼" : "↕"}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
            {filters && (
              <tr className="filters">
                {columns.map((column) => {
                  const kind = kinds[column.id];
                  return (
                    <th key={column.id} className={column.numeric ? "num" : undefined}>
                      {kind.kind === "range" ? (
                        <span className="range">
                          <input inputMode="decimal" placeholder="min" aria-label={`${column.header} minimum`} value={ranges[column.id]?.min ?? ""} onChange={(event) => { setRanges({ ...ranges, [column.id]: { min: event.target.value, max: ranges[column.id]?.max ?? "" } }); setPage(0); }} />
                          <input inputMode="decimal" placeholder="max" aria-label={`${column.header} maximum`} value={ranges[column.id]?.max ?? ""} onChange={(event) => { setRanges({ ...ranges, [column.id]: { min: ranges[column.id]?.min ?? "", max: event.target.value } }); setPage(0); }} />
                        </span>
                      ) : kind.kind === "select" ? (
                        <select aria-label={`Filter ${column.header}`} value={text[column.id] ?? ""} onChange={(event) => { setText({ ...text, [column.id]: event.target.value }); setPage(0); }}>
                          <option value="">All</option>
                          {kind.options.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      ) : (
                        <input placeholder="contains…" aria-label={`Filter ${column.header}`} value={text[column.id] ?? ""} onChange={(event) => { setText({ ...text, [column.id]: event.target.value }); setPage(0); }} />
                      )}
                    </th>
                  );
                })}
              </tr>
            )}
          </thead>
          <tbody>
            {shown.map((row, index) => (
              <tr key={rowKey(row, index)} className={rowClass?.(row)}>
                {columns.map((column) => {
                  const shading = column.className ? column.className(row) : column.solver ? "solver" : undefined;
                  const classes = [column.numeric ? "num" : "", shading ?? ""].filter(Boolean).join(" ");
                  return <td key={column.id} className={classes || undefined}>{column.cell ? column.cell(row) : (column.value(row) ?? "-")}</td>;
                })}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={columns.length} style={{ textAlign: "center", color: "var(--muted)" }}>No {unit} match the current filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
