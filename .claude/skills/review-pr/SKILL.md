---
name: review-pr
description: Fait relire une pull request par un agent indépendant qui commente et ouvre des issues.
---

# Relire une PR

Un relecteur qui a écrit le code est un relecteur complaisant : il connaît les
raisons de chaque choix, donc il les excuse. Cette skill dépêche un **sous-agent
en contexte vierge** sur une PR, avec pour mandat de trouver ce que les revues
précédentes ont manqué, puis de publier lui-même son verdict et ses issues.

Elle ne corrige rien. Elle relit.

## 0. Annoncer avant de lancer

Cette skill publie vers l'extérieur : elle commente une PR et ouvre des issues
sur le dépôt. L'agent peut la déclencher lui-même, mais **jamais en silence** —
il annonce qu'il s'apprête à lancer la relecture et attend le feu vert. Ce qui
part sur GitHub reste une décision du développeur, même quand le geste est
délégué.

## 1. Identifier la PR

L'argument est un numéro de PR. Sans argument, prendre la PR de la branche
courante :

```bash
gh pr view --json number,title,url --jq '"\(.number) \(.title)"'
```

Sans PR sur la branche courante, le dire et s'arrêter là.

## 2. Rassembler ce que le relecteur ne peut pas deviner

Le sous-agent part froid : tout ce qu'il ignore et qui compte doit figurer dans
son prompt. Rassembler :

- **L'état de la CI** : `gh pr checks <n>` — verte, rouge, ou en cours.
- **Les vérifications déjà faites** : ce qui a été exécuté et observé (pile
  démarrée, tests passés, comportement constaté de visu).
- **Les revues déjà passées** et leurs correctifs appliqués, pour qu'il cherche
  ailleurs plutôt que de refaire le même chemin.
- **Les décisions assumées** qui pourraient passer pour des défauts — en
  précisant qu'il a le droit de les contester.

Ce dernier point est ce qui sépare une revue utile d'une approbation polie.

## 3. Dépêcher le relecteur

Un seul sous-agent, en contexte vierge, avec ce mandat :

**Ce qu'il relit** : le diff de la PR (`gh pr diff <n>`). Lui nommer les
fichiers écrits à la main et lui dire d'ignorer le squelette généré — sans
quoi il dépense son attention sur du code que personne n'a écrit.

**Les références qui font autorité**, à lire lui-même :
`CONTEXT.md` (glossaire du domaine, dont les termes sont contraignants),
`docs/adr/` (les décisions que le code ne doit pas contredire), le ticket
d'origine et ses critères d'acceptation, et `gh issue list --state open` pour
distinguer *manquant* de *prévu ailleurs*.

**Ce qu'il cherche** : les failles de sécurité, les erreurs de configuration,
les contradictions avec les ADR, le respect du glossaire, les pièges de
portabilité, et ce qui rendrait la vie difficile aux tickets suivants.

**Ce qu'il produit**, lui-même, sur GitHub :

1. **Un commentaire sur la PR** (`gh pr comment <n> --body "..."`), en français,
   ouvert par un verdict net — **approuvé**, **approuvé avec réserves**, ou
   **changements demandés** — puis ses constats du plus grave au plus anodin,
   chacun avec fichier, ligne, et *pourquoi* c'est un problème. Il dit aussi ce
   qu'il a vérifié et jugé correct, pour que son silence ne passe pas pour un
   angle mort.

2. **Une issue par problème qui mérite un ticket**, et seulement ceux-là
   (`gh issue create --label "needs-triage"`, voir `docs/agents/triage-labels.md`).
   Un détail de style se dit en commentaire. Un problème qui appartient à un
   ticket existant se commente sur ce ticket. **Aucune issue s'il ne trouve
   rien de significatif** : une issue creuse coûte plus qu'elle ne rapporte.

**Ses garde-fous** : citer fichier et ligne pour chaque constat, distinguer un
défaut avéré d'un jugement de goût, employer le vocabulaire de `CONTEXT.md`, et
laisser l'arbre de travail intact — il relit, il ne corrige pas.

## 4. Vérifier avant de relayer

Les constats du relecteur sont des hypothèses jusqu'à vérification. Reproduire
soi-même ceux qui commandent une décision — casser volontairement ce qu'il dit
non couvert, lancer la commande qu'il dit cassée — puis rapporter ce qui a été
confirmé et ce qui ne l'a pas été.

Un constat relayé sans vérification est une rumeur.

## 5. Rendre compte

Le verdict, les issues ouvertes avec leurs numéros, et la recommandation : ce
qui se corrige sur la branche avant de fusionner, et ce qui part en ticket
séparé. Un défaut qui casse un critère d'acceptation du ticket d'origine se
corrige maintenant ; ce qui relève d'un périmètre non encore ouvert attend son
propre ticket.
