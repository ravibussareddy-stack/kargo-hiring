import Dashboard from "@/components/Dashboard";
import SetupError from "@/components/SetupError";
import { loadDashboard } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  try {
    return <Dashboard data={await loadDashboard()} />;
  } catch (e) {
    return <SetupError message={e instanceof Error ? e.message : String(e)} />;
  }
}
