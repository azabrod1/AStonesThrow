// Points git at the repository's own hooks (.githooks/: pre-push runs CI's
// CPU checks before a push), as npm install's `prepare` step. It does so only
// where this package is the top of its git checkout (a copy of it inside
// another repository would otherwise turn that repository's hooks off), only
// when no hooks path is set already (someone's own, a hook manager's, or this
// one's from an earlier install), and it never fails the install: without
// git, outside a checkout, or on any error from git it leaves things as they
// are. It is plain node, not a shell line, so it runs the same under Windows'
// cmd.exe, which npm uses for scripts there, as under a POSIX shell.
//
//   node tools/install-hooks.mjs   (package.json's prepare)
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...gitArguments) => execFileSync('git', gitArguments, { cwd: packageRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

try {
  // An empty prefix: the package's folder is the top of its checkout (or of a worktree of it).
  if (git('rev-parse', '--show-prefix') === '') {
    let hooksPath = '';
    try { hooksPath = git('config', '--get', 'core.hooksPath'); } catch { /* unset: git config exits with 1 */ }
    if (!hooksPath) git('config', 'core.hooksPath', '.githooks');
  }
} catch {
  // No git, not a checkout, or git refused: npm install goes on without the hook.
}
