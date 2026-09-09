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
 */
function rang(critere: Critere, valeur: ValeurCritere): number | null {
  if (valeur === null) {
    return null;
  }

  if (critere.valeurs) {
    const position = critere.valeurs.findIndex((admise) => admise.valeur === valeur);

    return position === -1 ? null : position;
  }

  // Un oui/non se classe comme 1 et 0 : « avec ascenseur » vaut mieux que
  // « sans », et le sens déclaré dit dans quel ordre.
  if (typeof valeur === 'boolean') {
    return valeur ? 1 : 0;
  }

  // `NaN` et les infinis se rangent avec les Critères non renseignés : une
  // valeur qu'on ne sait pas placer ne doit pas gagner, et elle fausserait
  // toute comparaison qui la rencontrerait.
  return typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : null;
}

/**
 * Le prix au mètre carré, ou `null` quand il ne se calcule pas.
 *
 * C'est le Critère calculé qui permet de comparer des Biens de surfaces
 * différentes (#10). Il n'est pas stocké : le dériver évite qu'il puisse
 * contredire le prix et la surface dont il sort.
 *
 * Il ne figure donc pas dans `CRITERES`, dont chaque entrée a une colonne :
 * l'y mettre obligerait la définition à porter deux sortes d'entrées, et
 * ferait chercher une colonne qui n'existe pas. C'est le tableau et la
 * comparaison qui l'ajoutent à leurs lignes, en appelant cette fonction sur
 * `prixDemande` et `surfaceHabitable`.
 *
 * Une surface nulle ou négative rend `null` plutôt qu'un infini ou un prix
 * négatif : c'est une saisie erronée, et l'écran a déjà de quoi afficher une
 * valeur absente.
 */
export function prixAuMetreCarre(prix: number | null, surface: number | null): number | null {
  if (prix === null || surface === null || surface <= 0) {
    return null;
  }

  return prix / surface;
}
