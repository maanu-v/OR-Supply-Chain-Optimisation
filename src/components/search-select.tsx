"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const maxShown = 200;

/** Dropdown with a search box inside it; used for long ID lists (products, customers). */
export function SearchSelect({ value, options, onChange, width = 170, label }: { value: string; options: string[]; onChange: (value: string) => void; width?: number; label: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const text = query.trim().toLowerCase();
    return text ? options.filter((option) => option.toLowerCase().includes(text)) : options;
  }, [options, query]);

  // close when clicking anywhere outside the dropdown
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(option: string) {
    onChange(option);
    setOpen(false);
    setQuery("");
  }

  function toggle() {
    setQuery("");
    setActive(Math.max(options.indexOf(value), 0));
    setOpen(!open);
  }

  function onKey(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, Math.min(matches.length, maxShown) - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (matches[active]) choose(matches[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="search-select" ref={root} style={{ width }}>
      <button type="button" className="search-select-button" aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={toggle}>
        <span>{value || "Select..."}</span>
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="search-select-panel">
          <input
            autoFocus
            value={query}
            placeholder={`Search ${options.length} ${label.toLowerCase()}s...`}
            onChange={(event) => { setQuery(event.target.value); setActive(0); }}
            onKeyDown={onKey}
          />
          <ul ref={list} role="listbox">
            {matches.slice(0, maxShown).map((option, index) => (
              <li
                key={option}
                role="option"
                aria-selected={option === value}
                className={`${index === active ? "active" : ""} ${option === value ? "chosen" : ""}`}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => { event.preventDefault(); choose(option); }}
              >
                {option}
              </li>
            ))}
            {matches.length === 0 && <li className="empty">No match</li>}
            {matches.length > maxShown && <li className="empty">{matches.length - maxShown} more - keep typing to narrow down</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
