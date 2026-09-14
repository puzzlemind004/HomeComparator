# Worktrees

Chaque issue s'implémente dans son propre worktree git, jamais directement dans le clone principal.

## Cycle de vie

1. **Avant d'implémenter**, créer le worktree depuis `main` à jour :
   `git worktree add .claude/worktrees/<slug>-<issue> -b <slug>-<issue>`
2. Implémenter, commiter et pousser **depuis ce worktree**.
3. Ouvrir la pull request, la faire relire via `/review-pr`, fusionner.
4. **À la fin**, supprimer le worktree et sa branche locale :
   `git worktree remove .claude/worktrees/<slug>-<issue>`

Le clone principal reste sur `main` et sert de point de départ propre.

## Règles

- **Jamais de `git add -A`.** Ajouter les fichiers explicitement, chemin par chemin. Un
  worktree contient des `node_modules` et des artefacts de build qu'un ajout global
  embarquerait sans qu'on s'en aperçoive.
- **Ne pas supprimer un worktree dont le travail n'est pas fusionné.** Vérifier avant :
  `git -C <worktree> log --oneline main..HEAD` doit être vide, ou la PR fusionnée.
- `.claude/worktrees/` est ignoré par git : les worktrees ne sont jamais committés.
