/**
 * Le cycle de vie d'un Bien : l'étape où il se trouve dans la recherche (#7).
 *
 * Le Statut n'est pas un Critère. Un Critère est renseigné pour tous les
 * Biens et se compare d'un Bien à l'autre ; le Statut, lui, décide de ce qui
 * est pertinent — certains champs n'existent qu'à partir d'une étape donnée
 * (ADR-0002). Il ne figure donc pas dans la définition centralisée des
 * Critères, et les écrans le traitent à part.
 *
 * Comme pour les énumérations de Critères, la liste vit aussi côté front
 * (ADR-0004, ADR-0010) et est recopiée ici. C'est la duplication qu'ADR-0010
 * assume, et les tests fonctionnels sont ce qui la tient : sans validateur,
 * un Statut inventé s'écrirait dans une colonne `string` nue et ressortirait
 * tel quel à l'écran.
 */

/**
 * Les six Statuts, dans l'ordre du cycle : les quatre étapes de la
 * recherche, puis les deux sorties.
 *
 * L'ordre porte du sens — c'est celui dont se déduit à partir de quelle
 * étape un champ devient pertinent — mais il ne contraint rien : aucune
 * transition n'est interdite (#7).
 */
export const STATUTS = [
  'aContacter',
  'aVisiter',
  'visite',
  'offreFaite',
  'ecarte',
  'vendu',
] as const

export type Statut = (typeof STATUTS)[number]

/**
 * Le Statut d'un Bien nouvellement créé : il vient d'être repéré, et
 * l'agence ou le vendeur n'a pas encore été contacté (#7).
 */
export const STATUT_INITIAL: Statut = 'aContacter'
