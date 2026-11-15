import Brief from "@/components/Brief";
import data from "@/data/brief.json";
import type { Brief as BriefT } from "@/lib/types";

export default function Home() {
  return <Brief data={data as unknown as BriefT} />;
}
