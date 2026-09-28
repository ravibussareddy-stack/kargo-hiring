import RubricEditor from "@/components/RubricEditor";
import SetupError from "@/components/SetupError";
import { loadCriteria } from "@/lib/rubric";
import { db, must } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function Page() {
  try {
    const [criteria, ids] = await Promise.all([
      loadCriteria(),
      db().from("candidates").select("id").in("status", ["scored", "scoring_failed"]).then((r) => (must(r) as { id: string }[]).map((x) => x.id)),
    ]);
    return <RubricEditor criteria={criteria} rescoreIds={ids} />;
  } catch (e) {
    return <SetupError message={e instanceof Error ? e.message : String(e)} />;
  }
}
