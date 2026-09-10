import type { Bien } from '../biens/bien';
import { colonneParId, type Colonne } from './colonnes';
import type { ValeurCritere } from './comparaison';

/**
 * Le tri du tableau desktop (#10) : sur quelle colonne, dans quel sens, et
 * ce que cela donne comme ordre des lignes.
 *
 * Le module ne fait aucune entrée-sortie et ne dépend pas d'Angular, comme
 * la définition et la comparaison à côté desquelles il vit. C'est ce qui
 * permet de vérifier sans monter d'écran la règle qui fait tout l'intérêt du
 * tri : **un Critère non renseigné n'est pas zéro**, il se range en fin de
 * liste dans les deux sens.
 *
 * L'état est une valeur, jamais mutée : chaque clic en rend un nouveau,
 * comme le fait l'assistant. Le tableau n'a donc qu'un signal à remplacer.
 */

/** Le sens d'un tri. Deux sens, et pas de troisième état « non trié ». */
export type SensTri = 'croissant' | 'decroissant';

/**
 * L'état du tri : la colonne sur laquelle il porte, ou `null` quand aucune
 * n'a été choisie.
 *
 * Le sens est porté même sans colonne plutôt que d'être optionnel : deux
 * champs toujours présents se lisent et se comparent sans garde, et le sens
 * d'un tri qui n'a pas lieu n'a de toute façon aucun effet.
 */
export interface Tri {
  colonne: string | null;
  sens: SensTri;
}

/**
 * Le tri d'un tableau qu'on vient d'ouvrir : aucun, et les Biens classés par
 * Libellé.
 *
 * Le carnet ne s'ouvre pas sur un tri par prix, qui laisserait croire à un
 * classement qu'on n'a pas demandé, ni sur l'ordre d'arrivée de l'API, qui
 * n'a rien à dire à l'acheteur.
 */
export const TRI_INITIAL: Tri = { colonne: null, sens: 'croissant' };

/**
 * Le tri après un clic sur l'en-tête de cette colonne.
 *
 * Une colonne déjà triée se renverse ; une autre repart du croissant, qui
 * est l'ordre le plus attendu — le moins cher d'abord, le plus petit
 * d'abord. Le cycle ne repasse jamais par « pas de tri » : un troisième clic
 * qui rendrait leur ordre initial aux lignes les ferait sauter sans qu'on
 * l'ait demandé.
 */
export function basculer(tri: Tri, colonne: string): Tri {
  if (tri.colonne !== colonne) {
    return { colonne, sens: 'croissant' };
  }

  return { colonne, sens: tri.sens === 'croissant' ? 'decroissant' : 'croissant' };
}

/**
 * La comparaison des textes, localisée : « Élancourt » se range à E et non
 * après « Zola ». Une comparaison brute par `<` classerait sur les points de
 * code, où tous les accents suivent le Z.
 */
const TEXTES = new Intl.Collator('fr-FR', { sensitivity: 'base', numeric: true });

/**
 * Les Biens dans l'ordre demandé, sans toucher à la liste reçue.
 *
 * Trois règles s'appliquent dans cet ordre, et la première est celle qui
 * compte :
 *
 * 1. Les Biens dont le Critère n'est pas renseigné se regroupent **en fin de
 *    liste**, quel que soit le sens. C'est ce qui distingue « pas de valeur »
 *    de « la plus petite valeur » : rabattus sur zéro, les Biens qu'il reste
 *    à renseigner occuperaient la tête d'un tri par prix comme s'ils étaient
 *    les moins chers du carnet (#10).
 * 2. Les valeurs se comparent sur leur rang — la position dans la définition
 *    pour une énumération, le nombre lui-même sinon —, jamais sur le texte
 *    affiché : « 1 000 » et « 900 » se trieraient à l'envers.
 * 3. Les ex æquo se départagent par Libellé, **sans se renverser avec le
 *    sens** : deux Biens au même prix n'ont pas à échanger leur place parce
 *    qu'on a cliqué une seconde fois.
 */
export function trier(biens: readonly Bien[], tri: Tri): Bien[] {
  const colonne = tri.colonne === null ? undefined : colonneParId(tri.colonne);

  // Une colonne qui ne désigne rien laisse l'ordre par défaut plutôt que de
  // lever : le tableau doit rester affichable, et le Libellé est une réponse
  // suffisante.
  if (!colonne) {
    return [...biens].sort(parLibelle);
  }

  const sens = tri.sens === 'croissant' ? 1 : -1;

  return [...biens].sort((gauche, droite) => {
    const rangGauche = rang(colonne, colonne.valeur(gauche));
    const rangDroite = rang(colonne, colonne.valeur(droite));

    // Le non renseigné passe après, dans les deux sens : le `sens` n'est
    // appliqué qu'à la comparaison des valeurs, plus bas.
    if (rangGauche === null || rangDroite === null) {
      if (rangGauche === rangDroite) {
        return parLibelle(gauche, droite);
      }

      return rangGauche === null ? 1 : -1;
    }

    const ecart =
      typeof rangGauche === 'string' && typeof rangDroite === 'string'
        ? TEXTES.compare(rangGauche, rangDroite)
        : Number(rangGauche) - Number(rangDroite);

    return ecart === 0 ? parLibelle(gauche, droite) : ecart * sens;
  });
}

/**
 * Ce sur quoi la valeur se compare, ou `null` quand elle ne se compare pas :
 * un nombre pour ce qui se classe sur une échelle, un texte pour ce qui se
 * classe alphabétiquement.
 *
 * Une énumération rend sa **position dans la définition** et non sa valeur :
 * c'est ce qui fait qu'un DPE se classe de A à G sans que le tri connaisse
 * les lettres du DPE, exactement comme le fait la comparaison (#12). Une
 * valeur absente de la définition n'a pas de rang, et se range donc avec les
 * non renseignés plutôt qu'au hasard entre deux DPE.
 */
function rang(colonne: Colonne, valeur: ValeurCritere): number | string | null {
  if (valeur === null) {
    return null;
  }

  const admises = colonne.critere?.valeurs;

  if (admises) {
    const position = admises.findIndex((admise) => admise.valeur === valeur);

    return position === -1 ? null : position;
  }

  // Un oui/non se classe comme 1 et 0, le sens du tri décidant lequel vient
  // en premier.
  if (typeof valeur === 'boolean') {
    return valeur ? 1 : 0;
  }

  if (typeof valeur === 'number') {
    // `NaN` et les infinis ne se placent nulle part : les laisser passer
    // rendrait `NaN - x`, qui vaut `NaN`, et un comparateur qui rend `NaN`
    // laisse l'ordre indéfini sur toute la liste.
    return Number.isFinite(valeur) ? valeur : null;
  }

  return valeur;
}

/**
 * L'ordre de repli : le Libellé, qui est ce sous quoi l'acheteur reconnaît
 * un Bien. Il ne dépend pas du sens du tri — c'est ce qui rend l'ordre des
 * ex æquo stable d'un clic à l'autre.
 */
function parLibelle(gauche: Bien, droite: Bien): number {
  return TEXTES.compare(gauche.libelle, droite.libelle);
}
