# Kargo Hiring Dashboard

Internal tool for Arjun Mehta (Founder, Kargo). Scores CVs for the **PM** and **SPM** roles against a written, weighted rubric, explains every score, drafts the follow-up email, and sends it only when Arjun clicks **Send** and confirms.

The system recommends. Arjun decides.

## How it works

1. **Upload** (`/upload`): CVs as .pdf, .docx or .txt, with the role applied for.
2. **Personal details removed in code, no AI** (`lib/pii.ts`):
   - Name, email, phones, profile links and street address go to `candidates.pii`.
   - The model only ever sees `cv_redacted`.
   - A guard checks every outgoing prompt. If a name can't be found or anything leaks, the candidate is marked `needs_review` and processing stops.
3. **Scoring** (`lib/ai.ts`):
   - One Gemini call per role, temperature 0, JSON output checked with zod, one retry. Every CV is scored against both rubrics.
   - The prompt is built from the `rubric_criteria` rows at call time.
   - Totals and subtotals are worked out in code (`lib/rubricMath.ts`). A score above 2 with no evidence is forced to 0.
4. **Fit brief**: 2 lines on fit and 2 on risk, per role. The top N applicants per role also get 3 interview questions.
5. **Ranking and drafts** (`recompute` in `lib/pipeline.ts`):
   - Applicants are ranked per role. The top N (the cut-off, default 5, set on the dashboard) get an invite draft, everyone else a rejection draft.
   - This re-runs after every upload, so ranks and drafts stay current. Candidates Arjun has manually switched, or already emailed, are left alone.
   - **Borderline — soft signal**: the candidate is inside the cut-off, but would fall outside it if B3 were removed from everyone's score.
6. **Send** (`lib/send.ts`):
   - Only after the confirmation dialog.
   - Blocked unless the recipient is in `ALLOWED_RECIPIENTS` or `ALLOWED_RECIPIENT_DOMAINS`, and refused if `[NAME]` or `[REDACTED]` is still in the email.
   - An idempotency key means a double-click can't send twice.

The dashboard is protected by HTTP Basic Auth (`proxy.ts`), because it shows candidate personal details and can send email.

## Setup

### 1. Supabase
1. Create a project at https://supabase.com.
2. Create the tables in one of two ways:
   - Put the **Session pooler** connection string (Supabase → Connect) in `SUPABASE_DB_URL` and run `npm run db:migrate`.
   - Or paste [`supabase/schema.sql`](supabase/schema.sql) into the **SQL Editor** and run it.
   - RLS is on with no policies, so the anon key can read nothing. All access goes through server code using the service role key.
   - The rubric is seeded automatically on first page load. The code source is `lib/rubricSeed.ts`.
3. Copy the project URL, anon key and service role key from **Project Settings → API**.

### 2. Keys
Fill in `.env.local`, which is git-ignored. `.env.example` lists every variable.

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey |
| `GEMINI_API_KEYS_BACKUP` | Optional backup keys, comma-separated, tried in order |
| `GEMINI_MODEL` | e.g. `gemini-3.8-flash`. Change without a code edit |
| `RESEND_API_KEY` | Leave blank to disable sending |
| `RESEND_FROM_ADDRESS` | A verified Resend sender, e.g. `Arjun Mehta <hiring@yourdomain>` |
| `ALLOWED_RECIPIENTS` | Exact test addresses, comma-separated (`+tags` ignored) |
| `ALLOWED_RECIPIENT_DOMAINS` | Whole test domains. Never a public domain like gmail.com |
| `DASHBOARD_USER`, `DASHBOARD_PASSWORD` | Login for the dashboard. Required in production |

Then run `npm run check`. It tests every key, the tables, that the anon key can't read personal details, a Gemini call, and the Resend sender domain.

### 3. Run locally
```bash
npm install
npm run dev
```
Open http://localhost:3000/upload.

### 4. Deploy to Vercel
1. At https://vercel.com/new, import this GitHub repo. The framework is detected as Next.js.
2. Add every variable from the table above under **Settings → Environment Variables** (Production and Preview).
3. Deploy, then open `https://<project>.vercel.app/upload` and log in with `DASHBOARD_USER` / `DASHBOARD_PASSWORD`.

API routes set `maxDuration = 60`. The upload page processes one file at a time, and `recompute` stops itself before the time limit and resumes, so everything fits Vercel's Hobby plan.

## Notes
- **PDF parsing** uses `unpdf` instead of `pdf-parse`, which breaks on Vercel. Scanned image-only PDFs have no text and are rejected.
- **Calibration examples** in the rubric are described without past hires' names, so employee names are never sent to the model.
- **Rubric edits** apply to the next scoring run. Use **Re-score all** on `/rubric` to apply them to existing candidates.
- **PII self-check:** `npm run test:pii`.
- **Test CVs:** `npm run fixtures -- <test-address>` writes 3 fictional CVs to `fixtures/` (git-ignored), with `+tag` variants of that inbox as their emails.
- **Resend sender:** with the default `onboarding@resend.dev`, Resend only delivers to the email address your Resend account is registered with. To reach any other test address, verify a domain in Resend and use it in `RESEND_FROM_ADDRESS`.
