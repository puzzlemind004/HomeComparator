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
