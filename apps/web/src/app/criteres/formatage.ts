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

const SURFACE = new Intl.NumberFormat(LOCALE, {
  // Le dixième de mètre carré, quand il existe : « 72,5 m² » est ce
  // qu'affiche l'annonce, et « 88,0 m² » se lit moins bien que « 88 m² ».
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const NOMBRE = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });

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
  return surface === null ? '' : `${SURFACE.format(surface)} m²`;
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

  if (typeof valeur !== 'number') {
    return String(valeur);
  }

  if (critere.unite === '€' || critere.unite === '€/an' || critere.unite === '€/mois') {
    // L'unité d'un montant porte sa périodicité — « €/an » pour la taxe
    // foncière — que le format monétaire ne connaît pas : on écrit le
    // montant sans symbole, puis l'unité déclarée.
    return critere.unite === '€'
      ? formaterMontant(valeur)
      : `${NOMBRE.format(valeur)} ${critere.unite}`;
  }

  if (critere.unite === 'm²') {
    return formaterSurface(valeur);
  }

  return critere.unite === null
    ? NOMBRE.format(valeur)
    : `${NOMBRE.format(valeur)} ${critere.unite}`;
}
