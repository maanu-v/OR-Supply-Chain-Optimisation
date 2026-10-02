import { Dashboard } from "@/components/dashboard";
import { getDashboardAnalysis } from "@/lib/analysis";

export const dynamic = "force-dynamic";


export default function Home() {
  return <Dashboard initialAnalysis={getDashboardAnalysis()} />;
}
