## Local completion workflow

- After implementing and validating code changes, run `codex review --uncommitted`.
- Evaluate the review findings, address the ones you agree are valid, and rerun the relevant build and tests.
- Once the review findings are resolved and validation passes, commit the completed code changes unless the user explicitly asks not to commit.
- Every new branch starts from `origin/main` and its PR targets `main`, unless the user says otherwise. Never stack on, or merge in, another open PR's branch: if two conflict, land one, then merge `main` into the other.
- Never push past a failing pre-push check (`.githooks/pre-push`, which runs `npm run check:cpu`) or with `--no-verify` (only a push with no code in it). A new probe goes in its `check:` script in `package.json`, which CI's jobs run, never in `check.yml` alone.

## Pull request writing

- Write PR titles and summaries in plain, natural language, as a colleague explaining the change to a reviewer.
- Lead with what changes and why it matters. Use short paragraphs and a few concrete bullets when useful; keep technical detail only when it helps review.
- Avoid inflated claims, AI-sounding phrases, elaborate mini-headings, revision diaries, abandoned approaches, raw commit lists and exhaustive test logs.
- Keep the final scope, relevant validation, real limitations, merge dependencies and useful evidence links clear. Do not hide incomplete checks or imply they passed.
- Do not append AI bylines or session links unless the user asks or the repository requires them.
