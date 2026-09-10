import type { Critere, SensComparaison, TypeCritere } from './critere';
import { prixAuMetreCarre, type ValeurCritere } from './comparaison';
import { CRITERES_ORDONNES } from './definition';
import { formaterPrixAuMetreCarre, formaterValeur } from './formatage';
import { estRenseigne, type ValeursCriteres } from './valeurs';

/**
 * Les colonnes du tableau desktop (#10) : ce que le tableau affiche, dans
 * l'ordre où il l'affiche.
 *
 * La liste dérive de la définition des Critères (ADR-0004) — le tableau
 * n'énumère rien à la main — augmentée du prix au mètre carré, qui n'est pas
 * un Critère mais se lit comme une colonne. C'est ici que se fait cette
 * jonction, plutôt que dans le composant : « quelles colonnes, dans quel
 * ordre, avec quelle valeur » se vérifie sans monter d'écran.
 *
 * Le Statut n'y figure pas. Il est visible sur chaque ligne du tableau, mais
 * il ne se compare pas d'un Bien à l'autre — il décide de ce qui est
 * pertinent (ADR-0002) : lui donner une colonne de cette liste le ferait
 * passer pour un Critère de la définition.
 */

/**
 * Une colonne du tableau : de quoi écrire un en-tête, lire une valeur dans
 * les Critères d'un Bien et l'écrire.
 *
 * La colonne est un objet et non un simple identifiant parce que la valeur
 * ne se lit pas partout de la même façon : un Critère se lit dans la carte
 * des valeurs, le prix au m² se calcule. Le tableau appelle `valeur` sans
 * savoir laquelle des deux il tient, ce qui lui évite d'avoir un cas
 * particulier pour l'unique colonne calculée d'aujourd'hui — et un deuxième
 * le jour où une autre s'ajoute.
 *
 * Elle lit des `ValeursCriteres` et non un `Bien` : le module reste ainsi
 * sans dépendance vers `biens/`, comme le sont ses voisins de `criteres/`,
 * et une colonne n'a de toute façon rien à faire du Libellé ni du Statut.
 */
export interface Colonne {
  /** L'identifiant, qui est celui du Critère quand la colonne en porte un. */
  id: string;

  /** L'en-tête de la colonne. */
  libelle: string;

  /** La nature de la valeur, dont l'alignement de la colonne se déduit. */
  type: TypeCritere;

  /**
   * Le sens dans lequel la colonne se compare, repris du Critère ou déclaré
   * par la colonne calculée. Le tri s'en sert pour savoir dans quel sens
   * partir.
   *
   * Il ne suffit pas encore à la comparaison (#12) : `meilleureValeur` exige
   * un `Critere`, que la colonne calculée n'a pas. Le prix au m² devra donc
   * lui être présenté autrement — c'est à ce ticket de trancher, et le tri
   * s'en tire ici par une branche à part.
   */
  sensComparaison: SensComparaison;

  /**
   * Le Critère dont la colonne sort, ou `null` pour une colonne calculée.
   *
   * Le tri s'en sert pour classer une énumération par son rang dans la
   * définition : sans le Critère, un DPE se trierait par sa lettre, et « A
   * vaut mieux que G » deviendrait un ordre alphabétique qui n'a de sens
   * que par accident.
   */
  critere: Critere | null;

  /**
   * La valeur portée par ce Bien, ou `null` quand elle est absente. C'est
   * sur elle que porte le tri, jamais sur le texte affiché : trier « 1 000 »
   * et « 900 » comme des chaînes mettrait le plus cher en premier.
   */
  valeur: (valeurs: ValeursCriteres) => ValeurCritere;

  /** La valeur telle qu'elle s'écrit, ou la chaîne vide si elle est absente. */
  texte: (valeurs: ValeursCriteres) => string;
}

/**
 * L'identifiant de la Colonne calculée. Il ne peut désigner aucun Critère,
 * puisqu'aucun n'a de colonne en base à ce nom (ADR-0004) — c'est ce qui
 * permet de le mêler aux identifiants de Critères sans risque de collision.
 */
export const ID_COLONNE_PRIX_METRE_CARRE = 'prixAuMetreCarre';

/**
 * Le Critère qu'une colonne de Critère affiche, présenté en colonne.
 *
 * La valeur passe par `estRenseigne` avant d'être rendue : un champ effacé
 * produit la chaîne vide, et le tri doit la ranger avec les Critères non
 * renseignés plutôt que de la classer entre deux textes (#6).
 */
function colonneDeCritere(critere: Critere): Colonne {
  const valeur = (valeurs: ValeursCriteres): ValeurCritere => {
    const brute = valeurs[critere.id];

    return estRenseigne(brute) ? brute : null;
  };

  return {
    id: critere.id,
    libelle: critere.libelle,
    type: critere.type,
    sensComparaison: critere.sensComparaison,
    critere,
    valeur,
    texte: (valeurs) => formaterValeur(critere, valeur(valeurs)),
  };
}

/**
 * La seule Colonne calculée du carnet : le prix rapporté à la surface, qui
 * permet de comparer des Biens de surfaces différentes (#10). Codée en dur
 * plutôt qu'entrée d'une liste générique, faute d'une deuxième instance
 * (ADR-0013).
 *
 * Elle reste vide dès que l'un des deux Critères manque — c'est ce que rend
 * `prixAuMetreCarre` —, et se trie donc comme n'importe quelle colonne dont
 * la valeur est absente : en fin de tri, jamais comme un zéro.
 */
function colonnePrixAuMetreCarre(): Colonne {
  const valeur = (valeurs: ValeursCriteres): number | null =>
    prixAuMetreCarre(nombre(valeurs, 'prixDemande'), nombre(valeurs, 'surfaceHabitable'));

  return {
    id: ID_COLONNE_PRIX_METRE_CARRE,
    libelle: 'Prix au m²',
    type: 'entier',
    // Moins cher au mètre carré est meilleur, comme l'est le prix dont il
    // sort : c'est ce qui permet à la comparaison (#12) de le mettre en
    // évidence sans savoir qu'il est calculé.
    sensComparaison: 'plusPetitEstMeilleur',
    critere: null,
    valeur,
    // L'écriture vit dans `formatage.ts` avec celle du prix : les deux
    // colonnes se lisent côte à côte, et deux `Intl` montés séparément
    // divergeaient déjà sur leur séparateur de milliers.
    texte: (valeurs) => formaterPrixAuMetreCarre(valeur(valeurs)),
  };
}

/**
 * La valeur numérique d'un Critère, ou `null` si elle n'en est pas une. Le
 * garde n'est pas décoratif : le modèle d'affichage tient ce que l'adapter y
 * a mis, et un texte arrivé sur un Critère numérique doit rendre une colonne
 * vide plutôt qu'un calcul sur `NaN`.
 */
function nombre(valeurs: ValeursCriteres, id: string): number | null {
  const valeur = valeurs[id];

  return typeof valeur === 'number' ? valeur : null;
}

/**
 * Les colonnes du tableau, dans l'ordre d'affichage : les Critères tels que
 * la définition les ordonne, et le prix au mètre carré inséré à la suite du
 * prix demandé.
 *
 * Le calcul se lit à côté de ce dont il sort. En fin de tableau, comparer un
 * prix à son prix au m² demanderait de traverser l'écran — et c'est
 * précisément la comparaison d'un coup d'œil qui fait l'intérêt d'un tableau
 * (ADR-0006).
 */
export const COLONNES: readonly Colonne[] = CRITERES_ORDONNES.flatMap((critere) =>
  critere.id === 'prixDemande'
    ? [colonneDeCritere(critere), colonnePrixAuMetreCarre()]
    : [colonneDeCritere(critere)],
);

/** La colonne portant cet identifiant, ou `undefined` s'il n'en désigne aucune. */
export function colonneParId(id: string): Colonne | undefined {
  return COLONNES.find((colonne) => colonne.id === id);
}
