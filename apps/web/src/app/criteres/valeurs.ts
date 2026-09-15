import type { ValeurCritere } from './comparaison';
import { CRITERES_ORDONNES } from './definition';

/**
 * Les valeurs qu'un Bien porte sur ses Critères, indexées par identifiant.
 *
 * Une carte plutôt que quinze champs nommés : les écrans parcourent la
 * définition et lisent la valeur au passage, sans jamais énumérer les
 * Critères à la main (ADR-0004). Un Critère ajouté à la définition traverse
 * la fiche, le tableau et l'assistant sans qu'aucun soit retouché.
 *
 * C'est là que le front s'écarte de la forme de l'API, qui rend un objet
 * plat où les Critères voisinent avec l'`id` et les dates : l'adapter fait
 * la traduction au point d'entrée (ADR-0010).
 */
export type ValeursCriteres = Readonly<Record<string, ValeurCritere>>;

/**
 * Ce qu'un Critère non renseigné vaut : `null`, et jamais autre chose.
 *
 * `undefined` — la clé absente — dit la même chose, et les deux arrivent
 * réellement : l'API rend `null`, un objet construit à la main omet la clé.
 * La chaîne vide aussi, qu'un formulaire produit d'un champ effacé.
 *
 * Zéro, en revanche, est une valeur : zéro place de stationnement est une
 * information, et toute la fiche repose sur cette distinction — c'est elle
 * qui dit à l'acheteur ce qui reste à demander à l'agence (#6).
 */
export function estRenseigne(valeur: ValeurCritere | undefined): boolean {
  return valeur !== null && valeur !== undefined && valeur !== '';
}

/**
 * Les Critères d'un Bien restés sans valeur, dans l'ordre d'affichage.
 *
 * C'est ce que la fiche met en évidence — ce qu'il reste à demander — et ce
 * que l'assistant enchaîne en questions (#6).
 */
export function criteresNonRenseignes(valeurs: ValeursCriteres) {
  return CRITERES_ORDONNES.filter((critere) => !estRenseigne(valeurs[critere.id]));
}

/**
 * Où en est la saisie d'un Bien : combien de Critères sont renseignés, sur
 * combien, et la part que cela représente.
 *
 * La refonte le montre partout — une barre sous chaque carte du carnet, un
 * encart sur la fiche, une colonne du tableau, la progression de l'assistant
 * — parce que c'est la question que se pose l'acheteur en rouvrant son
 * carnet : non pas « qu'ai-je vu », mais « que me manque-t-il pour décider ».
 *
 * Le calcul vit ici, à côté de `criteresNonRenseignes` dont il est le
 * décompte, et non dans les écrans qui l'affichent. Quatre d'entre eux le
 * montrent : écrit quatre fois, un Critère ajouté à la définition aurait fait
 * dire « 11 / 16 » à l'un et « 11 / 15 » à l'autre sur le même Bien.
 *
 * Le total sort de `CRITERES_ORDONNES` et n'est pas un nombre écrit à la
 * main, pour la raison qu'ADR-0004 donne : ajouter un Critère ne doit
 * retoucher aucun écran.
 */
export interface Completude {
  /** Combien de Critères portent une valeur, zéro compris. */
  renseignes: number;

  /** Combien la définition en compte — le dénominateur affiché. */
  total: number;

  /**
   * La part renseignée, entre 0 et 1, dont la barre tire sa largeur.
   *
   * Un carnet sans aucun Critère défini rendrait 0 plutôt qu'une division
   * par zéro. Le cas ne se produit pas — la définition n'est jamais vide —
   * mais une barre de progression n'a pas à faire tomber l'écran si elle le
   * devenait.
   */
  part: number;
}

/** Où en est la saisie de ce Bien. */
export function completude(valeurs: ValeursCriteres): Completude {
  const total = CRITERES_ORDONNES.length;
  const renseignes = total - criteresNonRenseignes(valeurs).length;

  return {
    renseignes,
    total,
    part: total === 0 ? 0 : renseignes / total,
  };
}
