import Alerts from "@/components/Alerts";
import data from "@/data/brief.json";
import type { Brief } from "@/lib/types";

export default function Page() {
  return <Alerts data={data as unknown as Brief} />;
}
