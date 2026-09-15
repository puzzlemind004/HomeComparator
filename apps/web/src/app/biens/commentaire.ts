/**
 * Une observation datée portée sur un Bien pendant la visite, telle que
 * l'écran l'affiche.
 *
 * Distincte des **Notes**, le texte unique du Bien (ADR-0012) : celles-ci se
 * relisent et se réécrivent, un Commentaire se prend sur place devant ce
 * qu'il décrit et le suivant ne touche pas au précédent.
 *
 * Le modèle ne porte **que ce qu'un écran montre** (ADR-0010) : le texte, les
 * deux adresses de la photo, l'appréciation, et la date en clair. Ni
 * `photoId`, ni `bienId`, ni horodatage brut — rien à l'écran ne les
 * affiche.
 */
export interface Commentaire {
  id: number;

  /** Ce que l'acheteur a écrit, ou `null`. */
  texte: string | null;

  /**
   * La photo qui illustre le Commentaire, ou `null`.
   *
   * Deux adresses et non une taille à choisir : le carrousel affiche la
   * vignette, et l'agrandissement la version consultable — c'est l'endroit
   * qui sait de laquelle il a besoin (#13).
   */
  photo: { url: string; urlVignette: string } | null;

  /** L'appréciation, de 1 à 5 étoiles, ou `null` quand il n'y en a pas. */
  note: number | null;

  /**
   * Quand le Commentaire a été pris, écrit pour être lu.
   *
   * La date compte ici plus qu'ailleurs : deux visites du même Bien à un
   * mois d'intervalle donnent deux séries d'observations, et « le mur était
   * déjà comme ça » ne se répond que par une date.
   */
  date: string;
}

/**
 * Ce que l'acheteur saisit : les trois champs, tous facultatifs — mais au
 * moins l'un des trois.
 *
 * Une photo d'un mur fissuré se passe de texte, trois étoiles sur une
 * chambre se passent de photo. Exiger un champ ferait inventer une valeur
 * pour pouvoir enregistrer, alors que le geste doit rester d'une seconde.
 */
export interface AjoutCommentaire {
  texte: string;
  photo: File | null;
  note: number | null;
}

/** Les cinq étoiles, dans l'ordre où le sélecteur les pose. */
export const ETOILES: readonly number[] = [1, 2, 3, 4, 5];

/** Vrai quand il y a quelque chose à enregistrer : sinon, rien n'est parti. */
export function estRenseigne({ texte, photo, note }: AjoutCommentaire): boolean {
  return texte.trim() !== '' || photo !== null || note !== null;
}
