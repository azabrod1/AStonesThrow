## Local completion workflow

- After implementing and validating code changes, run `codex review --uncommitted`.
- Evaluate the review findings, address the ones you agree are valid, and rerun the relevant build and tests.
- Once the review findings are resolved and validation passes, commit the completed code changes unless the user explicitly asks not to commit.

## Pull request writing

- Write PR titles and summaries in plain, natural language, as a colleague explaining the change to a reviewer.
- Lead with what changes and why it matters. Use short paragraphs and a few concrete bullets when useful; keep technical detail only when it helps review.
- Avoid inflated claims, AI-sounding phrases, elaborate mini-headings, revision diaries, abandoned approaches, raw commit lists and exhaustive test logs.
- Keep the final scope, relevant validation, real limitations, merge dependencies and useful evidence links clear. Do not hide incomplete checks or imply they passed.
- Do not append AI bylines or session links unless the user asks or the repository requires them.
