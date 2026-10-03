import { Site } from "@/components/site";
import { getDashboardAnalysis } from "@/lib/analysis";

export const dynamic = "force-dynamic";

export default function Home() {
  return <Site analysis={getDashboardAnalysis()} />;
}
