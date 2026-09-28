# Git workflow

## Branches

```
main                 protected; no direct pushes
├── app/*            Flutter client changes
├── backend/*        backend-only changes
├── feature/*        cross-cutting feature work
├── fix/*            bug fixes
└── chore/*          infra, docs, dependency bumps
```

Choose the prefix that matches your change. A backend refactor is `backend/*`, a shared docs edit is `chore/*`.

## Flow

```
create branch → commit → push → open PR → review → merge
```

- Rebase or merge `main` into your branch before opening the PR.
- Keep PRs small and single-purpose. If it grew large, split it.
- Every PR runs the CI (`.github/workflows/*`). It must be green before merge.
- Squash-merge by default. The PR title becomes the commit message.

## Commit messages

Use Conventional Commits:

```
<type>(<scope>): <summary>
```

Common types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`.

Examples:

```
feat(backend): add /health endpoint
fix(app): correct RTL padding on message list
chore: bump vite to 8.3.1
```

## Rules

- Never push directly to `main`.
- Never force-push a branch someone else works on.
- Never commit `.env` or any secret. Rotate immediately if you do.
- A change that alters the API contract must edit `docs/api-contract.md` in the same PR.
- Do not touch the other workspace unless the PR is explicitly cross-cutting; the code owner reviews their own workspace.

## Reviews

- Author requests review from at least one other contributor.
- Reviewer reads the diff, runs the branch locally when the change is non-trivial, and either approves, requests changes, or leaves comments.
- Author addresses every unresolved comment before merging.

## After merge

- Delete the merged branch.
- Pull `main` locally before starting the next task.
