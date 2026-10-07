"use client";

import { useEffect, useRef, useState } from "react";
import { BulkTab } from "@/components/bulk-tab";
import { DatasetTab } from "@/components/dataset-tab";
import { PlannerTab } from "@/components/planner-tab";
import { ProblemOneTab } from "@/components/problem-one-tab";
import { ProblemTwoTab } from "@/components/problem-two-tab";
import type { DashboardAnalysis } from "@/lib/analysis";

const tabs = [
  { id: "dataset", label: "Dataset Analysis" },
  { id: "problem-1", label: "Problem 1: Minimum-Cost Assignment" },
  { id: "problem-2", label: "Problem 2: Cost vs Delivery Time" },
  { id: "planner", label: "Route Planner" },
  { id: "bulk", label: "Bulk Upload" },
] as const;

type TabId = (typeof tabs)[number]["id"];

interface SectionLink {
  id: string;
  label: string;
}

export function Site({ analysis }: { analysis: DashboardAnalysis }) {
  const [tab, setTab] = useState<TabId>("dataset");
  const [sections, setSections] = useState<SectionLink[]>([]);
  const [current, setCurrent] = useState<string>();
  const panels = useRef<Partial<Record<TabId, HTMLElement | null>>>({});

  // keep the open tab in the URL hash so a section can be linked directly
  useEffect(() => {
    const fromHash = () => {
      const hash = window.location.hash.slice(1);
      if (tabs.some((item) => item.id === hash)) setTab(hash as TabId);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  // build the "jump to section" links from the numbered h2 headings of the open tab;
  // re-read when the tab content changes (e.g. results appear on the planner tab)
  useEffect(() => {
    const panel = panels.current[tab];
    if (!panel) return;
    const collect = () => {
      const headings = [...panel.querySelectorAll<HTMLHeadingElement>("h2")];
      const links = headings.map((heading, index) => {
        heading.id ||= `${tab}-section-${index + 1}`;
        return { id: heading.id, label: (heading.textContent ?? "").replace(/^\d+\.\s*/, "") };
      });
      setSections((previous) => (JSON.stringify(previous) === JSON.stringify(links) ? previous : links));
    };
    collect();
    const observer = new MutationObserver(collect);
    observer.observe(panel, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [tab]);

  // highlight the section currently under the sticky bar; a clicked section stays highlighted
  // while it is on screen, because short last sections can never scroll up to the bar
  const clicked = useRef<{ id: string; at: number } | undefined>(undefined);
  useEffect(() => {
    const update = () => {
      const pin = clicked.current;
      const box = pin && document.getElementById(pin.id)?.getBoundingClientRect();
      // smooth scrolling takes a moment, so the click wins for the first second
      if (pin && box && (Date.now() - pin.at < 1000 || (box.top >= 0 && box.top < window.innerHeight))) {
        setCurrent(pin.id);
        return;
      }
      clicked.current = undefined;
      const passed = sections.filter((section) => (document.getElementById(section.id)?.getBoundingClientRect().top ?? Infinity) < 140);
      setCurrent(passed.at(-1)?.id ?? sections[0]?.id);
    };
    // the user scrolling by hand releases the clicked highlight
    const release = () => {
      if (clicked.current && Date.now() - clicked.current.at >= 1000) {
        clicked.current = undefined;
        update();
      }
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    for (const event of ["wheel", "touchmove", "keydown"]) window.addEventListener(event, release, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      for (const event of ["wheel", "touchmove", "keydown"]) window.removeEventListener(event, release);
    };
  }, [sections]);

  function open(id: TabId) {
    clicked.current = undefined;
    setTab(id);
    history.replaceState(null, "", `#${id}`);
    window.scrollTo({ top: 0 });
  }

  function jump(id: string) {
    clicked.current = { id, at: Date.now() };
    setCurrent(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <header className="wrap masthead">
        <h1>Optimization of Semiconductor Supply Chain Networks</h1>
        <p className="sub">Integer programming and goal programming for the outbound logistics of a global microchip producer</p>
      </header>

      <div className="sticky-nav">
        <div className="wrap">
          <nav className="tabbar">
            {tabs.map((item) => (
              <button key={item.id} className={tab === item.id ? "on" : undefined} onClick={() => open(item.id)}>{item.label}</button>
            ))}
          </nav>
          {sections.length > 1 && (
            <nav className="section-nav" aria-label="Sections on this page">
              {sections.map((section, index) => (
                <button key={section.id} className={current === section.id ? "on" : undefined} onClick={() => jump(section.id)}>
                  {index + 1}. {section.label}
                </button>
              ))}
              {current !== sections[0].id && (
                <button className="top" onClick={() => { clicked.current = undefined; window.scrollTo({ top: 0, behavior: "smooth" }); }}>↑ Top</button>
              )}
            </nav>
          )}
        </div>
      </div>

      {/* all tabs stay mounted so solver results survive switching tabs */}
      <main className="wrap">
        <section ref={(element) => { panels.current.dataset = element; }} hidden={tab !== "dataset"}><DatasetTab analysis={analysis} /></section>
        <section ref={(element) => { panels.current["problem-1"] = element; }} hidden={tab !== "problem-1"}><ProblemOneTab analysis={analysis} /></section>
        <section ref={(element) => { panels.current["problem-2"] = element; }} hidden={tab !== "problem-2"}><ProblemTwoTab analysis={analysis} /></section>
        <section ref={(element) => { panels.current.planner = element; }} hidden={tab !== "planner"}><PlannerTab analysis={analysis} /></section>
        <section ref={(element) => { panels.current.bulk = element; }} hidden={tab !== "bulk"}><BulkTab /></section>
      </main>

      <footer>
        <div className="wrap">
          Team AA06 · 23MNG336 Operations Research. Data: Supply Chain Logistics Problem dataset (Kaggle / Brunel University).
          Models built in TypeScript and solved with the HiGHS solver.
        </div>
      </footer>
    </>
  );
}
