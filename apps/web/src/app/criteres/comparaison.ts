import type { Critere } from './critere';

/**
 * Ce qui permet de départager plusieurs Biens sur un Critère : la fonction
 * dont la vue de comparaison (#12) tire sa mise en évidence, et le tableau
 * (#10) son tri.
 *
 * Une valeur de Critère telle qu'un écran la détient : un nombre, un texte,
 * une valeur d'énumération, ou l'absence de saisie.
 */
export type ValeurCritere = number | string | boolean | null;

/**
 * La meilleure valeur portée par ces Biens sur ce Critère, ou `null` quand
 * il n'y en a pas.
 *
 * Il n'y en a pas dans trois cas, qui se ressemblent à l'écran — rien n'est
 * mis en évidence — mais pas au raisonnement : le Critère ne se classe pas
 * (une adresse), aucun Bien ne l'a renseigné, ou aucune valeur ne figure
 * dans la définition.
 *
 * La fonction rend une valeur et non un rang de Bien : à égalité, plusieurs
 * Biens la portent, et c'est à l'écran de les mettre tous en évidence plutôt
 * qu'à cette fonction d'en désigner un arbitrairement (#12).
 */
export function meilleureValeur(
  critere: Critere,
  valeurs: readonly ValeurCritere[],
): ValeurCritere {
  if (critere.sensComparaison === 'aucun') {
    return null;
  }

  const plusPetitEstMeilleur = critere.sensComparaison === 'plusPetitEstMeilleur';

  // Chaque valeur est ramenée à un rang comparable, ce qui met les nombres
  // et les énumérations ordonnées sur le même pied : un DPE se classe par sa
  // place dans la définition, pas par sa lettre.
  const classables = valeurs
    .map((valeur) => ({ valeur, rang: rang(critere, valeur) }))
    .filter((candidat): candidat is { valeur: ValeurCritere; rang: number } => candidat.rang !== null);

  if (classables.length === 0) {
    return null;
  }

  const meilleur = classables.reduce((meilleur, candidat) =>
    plusPetitEstMeilleur
      ? candidat.rang < meilleur.rang
        ? candidat
        : meilleur
      : candidat.rang > meilleur.rang
        ? candidat
        : meilleur,
  );

  return meilleur.valeur;
}

/**
 * Le rang d'une valeur sur l'échelle du Critère, ou `null` quand elle n'en a
 * pas : Critère non renseigné, valeur d'énumération absente de la
 * définition, ou nombre attendu là où l'écran tient autre chose.
 *
 * Pour une énumération, le rang est la position dans la définition, où la
 * liste est écrite dans l'ordre : c'est ce qui fait que A vaut mieux que G
 * sans qu'aucun écran n'ait à connaître les lettres du DPE.
 *
 * Exporté parce que le tri du tableau (#10) classe sur la même échelle que
 * la mise en évidence de la comparaison (#12) : deux façons de ranger qui
 * divergeraient feraient désigner comme meilleur un Bien que le tri ne met
 * pas en tête. Le tri y ajoute seulement le cas des textes, qui ne se
 * classent pas sur une échelle mais alphabétiquement.
 */
export function rang(critere: Critere, valeur: ValeurCritere): number | null {
  if (valeur === null) {
    return null;
  }

  if (critere.valeurs) {
    const position = critere.valeurs.findIndex((admise) => admise.valeur === valeur);

    return position === -1 ? null : position;
  }

  // Un oui/non se classe comme 1 et 0 : « avec ascenseur » vaut mieux que
  // « sans », et le sens déclaré dit dans quel ordre.
  //
  // Le `type` déclaré commande, et non le `typeof` reçu : sans cette
  // condition, un booléen arrivé par erreur sur un Critère numérique
  // prendrait le rang 1 et gagnerait contre n'importe quel prix.
  if (critere.type === 'booleen') {
    return typeof valeur === 'boolean' ? (valeur ? 1 : 0) : null;
  }

  // `NaN` et les infinis se rangent avec les Critères non renseignés : une
  // valeur qu'on ne sait pas placer ne doit pas gagner, et elle fausserait
  // toute comparaison qui la rencontrerait.
  return typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : null;
}

/**
 * Le prix au mètre carré, ou `null` quand il ne se calcule pas.
 *
 * La valeur qui permet de comparer des Biens de surfaces différentes (#10).
 * Ce n'est pas un Critère mais une Colonne calculée : elle ne se saisit ni
 * ne se stocke, et ne figure donc pas dans `CRITERES`, dont chaque entrée a
 * une colonne en base (ADR-0013). C'est le tableau et la comparaison qui
 * l'ajoutent à leurs lignes, en appelant cette fonction sur `prixDemande` et
 * `surfaceHabitable`.
 *
 * Une surface nulle ou négative rend `null` plutôt qu'un infini ou un prix
 * négatif : c'est une saisie erronée, et l'écran a déjà de quoi afficher une
 * valeur absente.
 */
export function prixAuMetreCarre(prix: number | null, surface: number | null): number | null {
  if (prix === null || surface === null) {
    return null;
  }

  // `Number.isFinite` avant toute comparaison : `NaN <= 0` vaut `false`, donc
  // un garde qui ne testerait que le signe laisserait passer un `NaN` — et un
  // prix au m² à `NaN` s'écrirait « NaN » dans le tableau (#10) tout en
  // disparaissant silencieusement de la comparaison (#12).
  if (!Number.isFinite(prix) || !Number.isFinite(surface)) {
    return null;
  }

  // Un prix négatif est une saisie erronée, pas une bonne affaire : sur un
  // Critère où le plus petit est le meilleur, il serait désigné comme le
  // meilleur prix au m² du carnet.
  if (prix < 0 || surface <= 0) {
    return null;
  }

  return prix / surface;
}
