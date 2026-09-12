import { meilleureSurEchelle, rang, type ValeurCritere } from './comparaison';
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
 * Les deux partagent l'algorithme (`meilleureSurEchelle`) et ne diffèrent
 * que par l'échelle qu'elles lui donnent : écrit deux fois, il aurait fini
 * par diverger, et l'un des deux écrans aurait désigné un meilleur que
 * l'autre ignore.
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
  return meilleureSurEchelle(colonne.sensComparaison, valeurs, (valeur) =>
    rangSurColonne(colonne, valeur),
  );
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
 * Vrai quand ces deux rangs désignent la même place sur l'échelle de la
 * Colonne — donc quand les deux Biens sont à égalité.
 *
 * Une Colonne calculée se compare **à la précision où elle s'affiche**, et
 * non au bit près. Son rang est un quotient : 250 000 / 20,2 et
 * 750 000 / 60,6 valent le même prix au mètre carré, et la division les
 * sépare pourtant au dernier bit. Comparés par `===`, ces deux Biens
 * seraient déclarés différents et un seul serait mis en évidence — le
 * gagnant arbitraire que le ticket interdit (#12).
 *
 * L'arrondi n'est pas une tolérance choisie au hasard : c'est l'unité sous
 * laquelle la valeur est écrite, l'euro (`formaterPrixAuMetreCarre`). Deux
 * cases qui affichent le même chiffre se mettent ainsi en évidence
 * ensemble, ce qui est la seule règle qu'un lecteur puisse vérifier des
 * yeux — et qui ne réclame aucun epsilon à justifier.
 *
 * Les rangs d'un Critère, eux, se comparent exactement : une position dans
 * la définition est un entier, et un nombre saisi se compare tel qu'il a été
 * saisi.
 */
function memeRang(colonne: Colonne, gauche: number, droite: number): boolean {
  if (colonne.critere) {
    return gauche === droite;
  }

  return Math.round(gauche) === Math.round(droite);
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

    // La mise en évidence se décide sur le **rang** et non sur la valeur :
    // c'est la même échelle que celle qui a désigné le meilleur, et c'est
    // `memeRang` qui dit ce qu'« être à égalité » veut dire sur cette
    // Colonne — au bit près pour un Critère, à la précision d'affichage pour
    // une Colonne calculée.
    const rangMeilleur = meilleure === null ? null : rangSurColonne(colonne, meilleure);

    return {
      colonne,
      cases: valeursParBien.map((valeursDuBien, rangBien) => {
        const rangDuBien = rangSurColonne(colonne, valeurs[rangBien]);

        return {
          ...caseDe(colonne, valeursDuBien),
          // Une case sans rang ne gagne jamais : c'est ce qui tient la règle
          // « un Critère non renseigné ne gagne ni ne perd ».
          meilleure:
            rangMeilleur !== null &&
            rangDuBien !== null &&
            memeRang(colonne, rangDuBien, rangMeilleur),
        };
      }),
      compare: meilleure !== null,
    };
  });
}
