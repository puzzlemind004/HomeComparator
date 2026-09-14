# HomeComparator

## Agent skills

### Issue tracker

Issues live as GitHub issues on `puzzlemind004/HomeComparator`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, using their default label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Revue de code

`mattpocock-skills:code-review` est désactivé : ne pas le lancer en fin de `/implement`, ni
ailleurs de ta propre initiative. La revue passe par `/review-pr`, sur la pull request.
Pour le réactiver, supprimer cette section.

### Worktrees

Une issue = un worktree sous `.claude/worktrees/`, créé avant d'implémenter et supprimé une
fois la PR fusionnée. Jamais de `git add -A`. Voir `docs/agents/worktrees.md`.
