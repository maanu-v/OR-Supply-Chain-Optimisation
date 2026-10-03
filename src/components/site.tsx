"use client";

import { useEffect, useState } from "react";
import { DatasetTab } from "@/components/dataset-tab";
import { ProblemOneTab } from "@/components/problem-one-tab";
import { ProblemTwoTab } from "@/components/problem-two-tab";
import type { DashboardAnalysis } from "@/lib/analysis";

const tabs = [
  { id: "dataset", label: "Dataset Analysis" },
  { id: "problem-1", label: "Problem 1: Minimum-Cost Assignment" },
  { id: "problem-2", label: "Problem 2: Cost vs Delivery Time" },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function Site({ analysis }: { analysis: DashboardAnalysis }) {
  const [tab, setTab] = useState<TabId>("dataset");

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

  function open(id: TabId) {
    setTab(id);
    history.replaceState(null, "", `#${id}`);
  }

  return (
    <>
      <header className="wrap masthead">
        <h1>Optimization of Semiconductor Supply Chain Networks</h1>
        <p className="sub">Integer programming and goal programming for the outbound logistics of a global microchip producer</p>
        <nav className="tabbar">
          {tabs.map((item) => (
            <button key={item.id} className={tab === item.id ? "on" : undefined} onClick={() => open(item.id)}>{item.label}</button>
          ))}
        </nav>
      </header>

      {/* all tabs stay mounted so solver results survive switching tabs */}
      <main className="wrap">
        <section hidden={tab !== "dataset"}><DatasetTab analysis={analysis} /></section>
        <section hidden={tab !== "problem-1"}><ProblemOneTab analysis={analysis} /></section>
        <section hidden={tab !== "problem-2"}><ProblemTwoTab analysis={analysis} /></section>
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
