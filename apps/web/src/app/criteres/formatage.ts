import type { Critere } from './critere';
import type { ValeurCritere } from './comparaison';

/**
 * L'écriture des valeurs pour l'affichage. Les cinq écrans qui montrent des
 * Critères passent par ici plutôt que d'appeler `Intl` chacun de leur côté :
 * un prix doit s'écrire pareil dans le tableau, sur une carte et dans la
 * comparaison, sans quoi la comparaison d'un coup d'œil se paie à chaque
 * regard.
 *
 * Une valeur non renseignée rend toujours la chaîne vide, jamais un tiret ou
 * un « — » : c'est à l'écran de choisir comment marquer l'absence, et le
 * tableau (#10) doit pouvoir la distinguer d'un zéro autrement que par le
 * texte.
 */

const LOCALE = 'fr-FR';

const MONTANT = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'EUR',
  // Le centime n'a pas de sens sur un prix d'annonce ni sur une taxe
  // annuelle, et il allonge une colonne répétée quinze fois.
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Le dixième, quand il existe : « 72,5 m² » est ce qu'affiche l'annonce, et
 * « 88,0 m² » se lit moins bien que « 88 m² ». C'est le format des Critères
 * déclarés `decimal`, dont la surface habitable est aujourd'hui le seul.
 */
const NOMBRE_DECIMAL = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

/** Le format des Critères déclarés `entier` : un prix, un nombre de pièces. */
const NOMBRE_ENTIER = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

const DATE = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** Un montant en euros, arrondi à l'euro. Chaîne vide s'il est absent. */
export function formaterMontant(montant: number | null): string {
  return montant === null ? '' : MONTANT.format(montant);
}

/** Une surface en mètres carrés. Chaîne vide si elle est absente. */
export function formaterSurface(surface: number | null): string {
  return surface === null ? '' : `${NOMBRE_DECIMAL.format(surface)} m²`;
}

/**
 * Une date au format français. Chaîne vide si elle est absente ou invalide
 * — « Invalid Date » n'a rien à faire dans une colonne, et une conversion
 * ratée se voit mieux à la case vide qu'à ce texte.
 */
export function formaterDate(date: Date | null): string {
  return date === null || Number.isNaN(date.getTime()) ? '' : DATE.format(date);
}

/**
 * La valeur d'un Critère, écrite selon son type et son unité tels que la
 * définition les déclare. C'est la fonction que les écrans appellent : ils
 * n'ont pas à savoir qu'un prix est un montant et une surface non.
 */
export function formaterValeur(critere: Critere, valeur: ValeurCritere): string {
  if (valeur === null) {
    return '';
  }

  if (critere.valeurs) {
    const admise = critere.valeurs.find((candidate) => candidate.valeur === valeur);

    // Une valeur hors définition s'affiche telle quelle : montrer ce qui est
    // en base vaut mieux qu'une case vide, qui se lirait « non renseigné ».
    return admise ? admise.libelle : String(valeur);
  }

  // « true » n'est pas une réponse lisible : un oui/non s'écrit en français.
  if (typeof valeur === 'boolean') {
    return valeur ? 'Oui' : 'Non';
  }

  if (typeof valeur !== 'number') {
    return String(valeur);
  }

  /**
   * La précision vient du `type` déclaré, et l'unité s'accole telle quelle.
   *
   * Dispatcher sur l'unité — reconnaître « € » puis « m² » — reviendrait à
   * décider du format ailleurs que dans la définition : un Critère en
   * « €/trimestre » s'écrirait sans que rien ne le signale, et ajouter un
   * Critère demanderait de repasser ici. C'est précisément le geste de trop
   * qu'ADR-0004 cherche à éviter.
   */
  const nombre = critere.type === 'decimal' ? NOMBRE_DECIMAL : NOMBRE_ENTIER;

  return critere.unite === null
    ? nombre.format(valeur)
    : `${nombre.format(valeur)} ${critere.unite}`;
}
