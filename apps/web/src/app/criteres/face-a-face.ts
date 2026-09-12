import { rang, type ValeurCritere } from './comparaison';
import { COLONNES, caseDe, type CaseColonne, type Colonne } from './colonnes';
import type { ValeursCriteres } from './valeurs';

/**
 * La comparaison face-à-face (#12) : les Critères en lignes, un Bien par
 * colonne, la meilleure valeur mise en évidence sur chaque ligne.
 *
 * C'est la fonction qui donne son nom au produit. Elle sert à départager des
 * finalistes, là où le tableau (#10) sert à parcourir toute la recherche.
 *
 * Le module ne fait aucune entrée-sortie et ne dépend pas d'Angular, comme
 * la définition, la comparaison et le tri à côté desquels il vit : la règle
 * qui fait tout l'intérêt de l'écran — **un Critère non renseigné ne gagne
 * ni ne perd** — se vérifie sans monter de composant.
 *
 * Ce qu'il ne fait pas : **aucun score pondéré, aucun classement des Biens
 * entre eux**. Ligne par ligne, et rien de plus. Un total donnerait une
 * fausse impression d'objectivité sur une décision largement affective, et
 * conduirait à bricoler les poids jusqu'à retrouver son intuition de départ
 * (#12).
 */

/**
 * La meilleure valeur portée par ces Biens sur cette Colonne, ou `null`
 * quand il n'y en a pas.
 *
 * C'est `meilleureValeur` de `comparaison.ts` portée du Critère à la
 * **Colonne**, ce qui est précisément ce que ce ticket devait trancher :
 * `meilleureValeur` exige un `Critere`, que la Colonne calculée n'a pas, et
 * le prix au mètre carré doit pourtant se mettre en évidence comme les
 * autres — le critère d'acceptation le demande nommément (#12).
 *
 * La Colonne déclare son `sensComparaison`, calculée ou non (ADR-0013) :
 * c'est ce qui suffit à la comparer, et l'écran n'a donc jamais à se
 * demander laquelle des deux sortes il tient. Le rang, lui, a besoin du
 * Critère quand il y en a un — un DPE se classe par sa place dans la
 * définition, pas par sa lettre — et se rabat sur le nombre sinon, un prix
 * au m² n'étant rien d'autre.
 *
 * La fonction rend une valeur et non un rang de Bien : à égalité, plusieurs
 * Biens la portent, et c'est à l'écran de les mettre tous en évidence plutôt
 * qu'à cette fonction d'en désigner un arbitrairement (#12).
 */
export function meilleureValeurColonne(
  colonne: Colonne,
  valeurs: readonly ValeurCritere[],
): ValeurCritere {
  if (colonne.sensComparaison === 'aucun') {
    return null;
  }

  const plusPetitEstMeilleur = colonne.sensComparaison === 'plusPetitEstMeilleur';

  const classables = valeurs
    .map((valeur) => ({ valeur, rang: rangSurColonne(colonne, valeur) }))
    .filter(
      (candidat): candidat is { valeur: ValeurCritere; rang: number } => candidat.rang !== null,
    );

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
 * Le rang d'une valeur sur l'échelle de la Colonne, ou `null` quand elle n'y
 * a pas de place.
 *
 * C'est la même échelle que celle du tri (#10) et de la comparaison des
 * Critères : deux façons de ranger qui divergeraient feraient désigner comme
 * meilleur un Bien que le tri ne met pas en tête.
 *
 * Une Colonne calculée n'a pas de Critère : sa valeur est un nombre, qui se
 * range comme tel. `NaN` et les infinis se rangent avec les non renseignés,
 * pour la raison que dit `rang` : une valeur qu'on ne sait pas placer ne
 * doit pas gagner.
 */
function rangSurColonne(colonne: Colonne, valeur: ValeurCritere): number | null {
  if (!colonne.critere) {
    return typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : null;
  }

  return rang(colonne.critere, valeur);
}

/**
 * Ce qu'un Bien porte sur une ligne du face-à-face : la case du tableau,
 * augmentée de ce que cet écran ajoute — porte-t-elle la meilleure valeur.
 */
export interface CaseFaceAFace extends CaseColonne {
  /**
   * Vrai quand ce Bien porte la meilleure valeur de la ligne.
   *
   * Plusieurs cases d'une même ligne peuvent le porter : c'est ainsi qu'une
   * égalité se traite, en mettant tous les ex æquo en évidence plutôt qu'en
   * désignant arbitrairement un gagnant (#12).
   *
   * Une case non renseignée ne le porte jamais, même seule sur sa ligne :
   * l'absence n'est pas une petite valeur.
   */
  meilleure: boolean;
}

/** Une ligne du face-à-face : une Colonne, et ce que chaque Bien y porte. */
export interface LigneFaceAFace {
  colonne: Colonne;

  /** Une case par Bien comparé, dans l'ordre où les Biens ont été reçus. */
  cases: CaseFaceAFace[];

  /**
   * Vrai quand la ligne met quelque chose en évidence.
   *
   * Faux dans trois cas qui se ressemblent à l'écran — rien n'est mis en
   * évidence — mais pas au raisonnement : la Colonne ne se compare pas (une
   * ville), aucun Bien ne l'a renseignée, ou aucune valeur ne se place sur
   * l'échelle.
   *
   * C'est de là que l'écran tire ce qu'il annonce au lecteur d'écran : sans
   * ce drapeau, il faudrait relire les cases pour savoir si la ligne porte
   * une mise en évidence à annoncer (ADR-0005).
   */
  compare: boolean;
}

/**
 * Les lignes du face-à-face : une par Colonne, dans l'ordre du tableau.
 *
 * Les Colonnes sont celles de `COLONNES` et non une liste écrite ici. Les
 * deux écrans montrent les mêmes Biens (ADR-0006), et le prix au mètre carré
 * s'y lit donc juste après le prix dont il sort, comme dans le tableau. Un
 * Critère ajouté à la définition paraît ici sans que l'écran soit retouché
 * (ADR-0004).
 *
 * **Toutes les Colonnes, sans en retirer aucune.** Le face-à-face sert à
 * départager deux ou trois finalistes, pas à parcourir la recherche : il n'y
 * a que quelques colonnes en largeur, et le débordement se fait en hauteur,
 * où il ne coûte rien. C'est ce qui le distingue du tableau, où seize
 * Colonnes affichées d'un coup feraient défiler de côté (#49, ADR-0006) —
 * les groupes pliables n'ont donc pas lieu d'être ici.
 *
 * La fonction lit des `ValeursCriteres` et non des `Bien` : le module reste
 * ainsi sans dépendance vers `biens/`, comme ses voisins de `criteres/`, et
 * une ligne n'a de toute façon rien à faire du Libellé ni du Statut — c'est
 * l'en-tête de colonne qui les porte, à l'écran.
 */
export function lignesFaceAFace(
  valeursParBien: readonly ValeursCriteres[],
): readonly LigneFaceAFace[] {
  return COLONNES.map((colonne) => {
    const valeurs = valeursParBien.map((valeurs) => colonne.valeur(valeurs));
    const meilleure = meilleureValeurColonne(colonne, valeurs);

    return {
      colonne,
      cases: valeursParBien.map((valeursDuBien, rangBien) => ({
        ...caseDe(colonne, valeursDuBien),
        // La comparaison porte sur la valeur et non sur le texte : « 1 000 »
        // et « 900 » se compareraient à l'envers. Et une case non renseignée
        // ne gagne jamais, quand bien même `meilleure` vaudrait `null` sur
        // une ligne que personne ne renseigne.
        meilleure: meilleure !== null && valeurs[rangBien] === meilleure,
      })),
      compare: meilleure !== null,
    };
  });
}
