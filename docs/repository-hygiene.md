# Repository hygiene

Source, tests, build scripts, product documentation, licenses and intentional
design documents belong in Git. Local agent scratch work, machine-specific
deployment reports, research exports, validation captures and Python bytecode
remain on the developer's machine and are excluded by `.gitignore`.

Run `node scripts/check-repository-hygiene.mjs` before committing. CI runs the
same check without installing dependencies. It detects tracked files matching
ignore rules, including files added with `git add -f`. It checks paths only;
it does not replace a secret scanner or inspect earlier commits.

When removing already tracked local files, use `git rm --cached -- <path>`.
This stages their removal from the repository while preserving the local copy.
Review `git diff --cached --stat` before committing. A later ordinary commit
removes these files from the current tree, but earlier commits still contain them.

## Cleaning earlier commits

Decide whether the goal is file removal or commit consolidation before rewriting
history. Preserve the upstream author's history and attribution by default.
Cosmetic commit titles alone do not require a rewrite.

1. Pause writers, inventory remote branches/tags and check for open pull requests.
2. Back up all local refs, uncommitted work and the affected remote refs outside
   the repository. Work on a disposable clone, not the active development checkout.
3. Use `git-filter-repo` with an explicit reviewed list of paths and refs. Remove
   historical spellings too if files were renamed. Do not filter source, tests,
   product assets or upstream attribution as part of scratch-file cleanup.
4. Verify the resulting tree and focused checks, and review the commit/ref mapping.
5. Obtain explicit approval before replacing remote history. Update only reviewed
   branches with an explicit expected old SHA (`--force-with-lease`); handle tags
   separately. Do not use a blanket mirror force-push.
6. Coordinate other checkouts so they cannot merge the old history back in.

If a live credential is discovered, revoke or rotate it first. Rewriting Git
history cannot remove copies in other clones, forks or GitHub cached references.
See [GitHub's sensitive data removal guide](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).
