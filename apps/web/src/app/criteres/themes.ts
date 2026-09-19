import type { Critere } from './critere';
import type { Commentaire } from '../biens/commentaire';

/**
 * Les thèmes : ce qui rend les Appréciations comparables d'un Bien à l'autre
 * (#126).
 *
 * **Pourquoi un thème, et non l'étoile brute.** `CONTEXT.md` dit d'une
 * Appréciation qu'elle « porte sur ce que le Commentaire décrit — une pièce,
 * un détail, une impression — et non sur le Bien entier : elle ne se compare
 * pas d'un Bien à l'autre ». C'est exact, et la moyenne de toutes les étoiles
 * d'un Bien le prouve : deux étoiles sur un mur fissuré et deux étoiles sur
 * un quartier bruyant ne disent pas la même chose, et leur moyenne ne dit
 * rien du tout.
 *
 * Le thème est ce qui lève l'obstacle sans contredire la définition :
 * l'Appréciation reste locale à ce qu'elle décrit, et c'est le **thème** qui
 * se compare — la moyenne des étoiles du thème « Cuisine » se compare d'un
 * Bien à l'autre parce qu'elle porte des deux côtés sur la cuisine.
 *
 * Un thème n'est donc pas un Critère au sens d'ADR-0004 : il ne se saisit
 * dans aucun champ, n'a pas de colonne en base, et se calcule depuis les
 * Commentaires — c'est une Colonne calculée, du même genre que le Prix au
 * mètre carré (ADR-0013), à ceci près qu'elle est définie par l'acheteur.
 */

/** Un thème : le nom que l'acheteur lui donne, et de quoi le retrouver. */
export interface Theme {
  /**
   * L'identifiant sous lequel le poids et les rattachements se retrouvent.
   *
   * Distinct du libellé, qui se renomme : un thème renommé « Luminosité »
   * après avoir été « Lumière » garde ses Commentaires et son poids.
   */
  id: string;

  /** Ce que l'acheteur lit — « Luminosité », « Voisinage », « Cuisine ». */
  libelle: string;
}

/**
 * Le rattachement d'un Commentaire à un thème : quel Commentaire, de quel
 * Bien, sous quel thème.
 *
 * Le Bien est porté ici plutôt que retrouvé, parce que les Commentaires se
 * chargent Bien par Bien (`GET /biens/:id/commentaires`) et que le tableau
 * de bord tient les siens à plat : sans le Bien, un rattachement ne saurait
 * plus à quelle colonne il appartient.
 */
export interface Rattachement {
  commentaireId: number;
  bienId: number;
  themeId: string;
}

/**
 * Le Critère synthétique d'un thème : une note sur cinq, où plus est mieux.
 *
 * Il existe pour que le score n'ait pas à distinguer un thème d'un Critère
 * saisi (voir `CritereNotable` dans `score.ts`) : une fois ce Critère posé,
 * la moyenne d'un thème se normalise et se pondère exactement comme un prix.
 *
 * `decimal` parce qu'une moyenne d'étoiles tombe rarement juste : trois
 * Commentaires à 4, 5 et 3 étoiles font 4,0 mais 4, 5 et 4 font 4,33.
 */
export function critereDuTheme(theme: Theme): Critere {
  return {
    id: theme.id,
    libelle: theme.libelle,
    type: 'decimal',
    unite: '★',
    // Les thèmes ne se rangent dans aucun groupe de saisie : ils n'ont pas de
    // champ, et le formulaire ne les montre jamais. `confort` est le groupe
    // sous lequel l'écran les liste, faute d'un groupe qui leur soit propre.
    groupe: 'confort',
    ordre: 1000,
    sensComparaison: 'plusGrandEstMeilleur',
    valeurs: null,
  };
}

/**
 * La moyenne des Appréciations d'un Bien sur un thème, ou `null` quand il
 * n'y en a aucune.
 *
 * `null` et non zéro, pour la raison qui fait qu'une Appréciation ne descend
 * pas à zéro (`CONTEXT.md`) : l'absence d'avis se dit par l'absence, là où
 * zéro se lirait comme un jugement. Un Bien dont la cuisine n'a pas été
 * commentée n'a pas une mauvaise cuisine — il a une cuisine dont on n'a rien
 * dit, et le score l'écarte de son calcul plutôt que de l'en punir.
 *
 * Les Commentaires sans Appréciation ne comptent pas : un texte et une photo
 * décrivent sans juger, et les compter pour zéro ferait chuter un thème
 * abondamment documenté.
 */
export function moyenneDuTheme(
  themeId: string,
  bienId: number,
  commentaires: readonly Commentaire[],
  rattachements: readonly Rattachement[],
): number | null {
  const duTheme = new Set(
    rattachements
      .filter(
        (rattachement) => rattachement.themeId === themeId && rattachement.bienId === bienId,
      )
      .map((rattachement) => rattachement.commentaireId),
  );

  const notes = commentaires
    .filter((commentaire) => duTheme.has(commentaire.id) && commentaire.note !== null)
    .map((commentaire) => commentaire.note as number);

  if (notes.length === 0) {
    return null;
  }

  return notes.reduce((somme, note) => somme + note, 0) / notes.length;
}

/**
 * Un identifiant de thème, tiré du libellé et rendu unique.
 *
 * Préfixé, pour qu'un thème ne puisse jamais porter l'identifiant d'un
 * Critère saisi : les poids des deux vivent dans la même carte, et un thème
 * nommé « DPE » y écraserait autrement le poids du vrai DPE.
 */
export function identifiantDeTheme(libelle: string, existants: readonly Theme[]): string {
  const base = `theme:${libelle
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;

  const pris = new Set(existants.map((theme) => theme.id));

  if (!pris.has(base)) {
    return base;
  }

  // Deux thèmes peuvent porter le même nom — rien ne l'interdit, et
  // l'acheteur qui le fait sait ce qu'il fait ; c'est l'identifiant qui doit
  // les distinguer, sans quoi le second prendrait les Commentaires du premier.
  let suffixe = 2;

  while (pris.has(`${base}-${suffixe}`)) {
    suffixe += 1;
  }

  return `${base}-${suffixe}`;
}

/** Vrai quand ce libellé peut nommer un thème : il faut au moins un mot. */
export function libelleDeThemeValide(libelle: string): boolean {
  return libelle.trim().length > 0;
}
