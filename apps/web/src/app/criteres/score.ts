import type { Critere } from './critere';
import { type ValeurCritere, rang } from './comparaison';

/**
 * Le classement pondéré du carnet (#126) : de quoi dire non pas « lequel de
 * ces deux-là », ce que fait le face-à-face, mais « lesquels, parmi les
 * douze, méritent une seconde visite ».
 *
 * Ce module ne connaît ni Angular ni les Biens : il classe des porteurs de
 * valeurs sur des Critères pondérés, et rend des scores. C'est ce qui permet
 * de l'éprouver sans monter un composant, comme `comparaison.ts` dont il
 * reprend l'échelle — le `rang`, et lui seul, place une valeur sur son axe.
 *
 * **Le score n'est pas une vérité sur un Bien**, c'est la lecture d'un
 * carnet à un instant : il est relatif au carnet (voir `echelle`) et aux
 * poids posés. Deux carnets différents donnent deux scores au même Bien, et
 * c'est voulu — il répond à « lequel parmi ceux-ci », pas à « celui-ci
 * est-il bon ».
 */

/** Le poids d'un Critère : de 0 (ignoré) à 5 (décisif). */
export type Poids = 0 | 1 | 2 | 3 | 4 | 5;

/** Le poids par défaut : tout compte pareil tant que rien n'a été dit. */
export const POIDS_PAR_DEFAUT: Poids = 3;

/** Le poids maximal, qui borne les curseurs et sert de repère à l'écran. */
export const POIDS_MAXIMUM: Poids = 5;

/** Les poids posés, indexés par identifiant de Critère pondérable. */
export type PoidsPoses = Readonly<Record<string, Poids>>;

/**
 * Un Critère tel que le classement le pondère : sa définition, et la façon
 * d'en lire la valeur sur un Bien.
 *
 * C'est ce qui met les Critères saisis et les thèmes de Commentaires sur le
 * même pied (#126). Les premiers se lisent dans `criteres`, les seconds se
 * calculent depuis les Appréciations — mais une fois ici, plus rien ne les
 * distingue, et le score n'a pas à savoir lequel il additionne.
 */
export interface CritereNotable {
  /** L'identifiant sous lequel le poids se retrouve. */
  id: string;

  /** Ce que l'acheteur lit à côté du curseur. */
  libelle: string;

  /**
   * Le sens et l'échelle, portés par un Critère — celui de la définition
   * pour un Critère saisi, un Critère synthétique pour un thème.
   */
  critere: Critere;

  /** Ce que ce porteur vaut sur ce Critère, ou `null` s'il ne le porte pas. */
  valeurDe: (porteurId: number) => ValeurCritere;
}

/** Ce qu'un Critère pèse dans le score d'un Bien, une fois normalisé. */
export interface Contribution {
  critereId: string;
  libelle: string;

  /** La note de 0 à 1 : 1 au meilleur du carnet, 0 au pire. */
  note: number;

  poids: Poids;

  /** La valeur brute, telle que l'écran la réaffiche. */
  valeur: ValeurCritere;
}

/** Le score d'un Bien, et le détail dont il se compose. */
export interface ScoreBien {
  porteurId: number;

  /**
   * Le score sur 100, ou `null` quand il ne se calcule pas : aucun Critère
   * pondéré n'est renseigné sur ce Bien.
   *
   * `null` et non zéro : un Bien qu'on n'a pas encore rempli n'est pas un
   * mauvais Bien, et le poser en bas du classement ferait passer une saisie
   * en retard pour un défaut — la même raison qui fait qu'un Critère absent
   * ne compte ni pour ni contre (voir `scorer`).
   */
  score: number | null;

  /** Ce qui a fait le score, du plus lourd au plus léger. */
  contributions: readonly Contribution[];

  /**
   * Combien de Critères pondérés ce Bien ne renseigne pas. L'écran s'en sert
   * pour dire qu'un score repose sur peu de choses.
   */
  manquants: number;
}

/**
 * Les bornes d'un Critère sur le carnet : ce qui sert d'échelle au min-max.
 *
 * `null` quand il n'y a rien à échelonner — aucune valeur classable, ou une
 * seule valeur distincte, cas où `maximum === minimum` et où la division
 * n'aurait pas de sens.
 */
interface Echelle {
  minimum: number;
  maximum: number;
}

/**
 * L'échelle d'un Critère sur ces porteurs, ou `null` s'il n'y en a pas.
 *
 * **Le carnet est l'échelle**, et non une borne absolue : personne ne sait
 * dire dans l'abstrait qu'un prix de 240 000 € est bon, mais tout le monde
 * voit qu'il est le plus bas des cinq du carnet. C'est ce qui rend le score
 * lisible sans demander à l'acheteur de définir ses bornes, et ce qui fait
 * qu'ajouter un Bien très cher reclasse les autres — ils deviennent
 * meilleurs marché *relativement*, ce qui est exactement ce qu'on veut dire.
 *
 * Une seule valeur distincte ne fait pas une échelle : cinq Biens au même
 * prix ne se départagent pas par le prix, et la note s'en déduit à `1` pour
 * tous plutôt que par une division par zéro (voir `note`).
 */
function echelle(critere: Critere, valeurs: readonly ValeurCritere[]): Echelle | null {
  const rangs = valeurs
    .map((valeur) => rang(critere, valeur))
    .filter((r): r is number => r !== null);

  if (rangs.length === 0) {
    return null;
  }

  return { minimum: Math.min(...rangs), maximum: Math.max(...rangs) };
}

/**
 * La note de 0 à 1 d'une valeur sur son échelle, ou `null` si elle n'en a
 * pas — Critère non renseigné, ou valeur hors définition.
 *
 * Le sens de comparaison décide du haut : sur un prix, le minimum du carnet
 * vaut 1 ; sur une surface, c'est le maximum. Un Critère `aucun` n'arrive
 * jamais ici — il n'est pas pondérable, et `criteresNotables` l'écarte.
 *
 * Quand l'échelle est plate — tous les Biens à la même valeur — la note vaut
 * 1 partout : aucun ne se distingue, et les départager par ce Critère
 * reviendrait à inventer un écart. Les poser tous à 0 serait pire encore :
 * un carnet où tous les Biens ont le même DPE verrait ce Critère annuler
 * silencieusement le poids qu'on lui a donné.
 */
function note(critere: Critere, valeur: ValeurCritere, bornes: Echelle): number | null {
  const position = rang(critere, valeur);

  if (position === null) {
    return null;
  }

  const etendue = bornes.maximum - bornes.minimum;

  if (etendue === 0) {
    return 1;
  }

  const normalisee = (position - bornes.minimum) / etendue;

  return critere.sensComparaison === 'plusPetitEstMeilleur' ? 1 - normalisee : normalisee;
}

/**
 * Le score de chaque porteur, du meilleur au moins bon.
 *
 * **Un Critère non renseigné ne compte ni pour ni contre.** Il sort du
 * calcul du Bien, son poids avec lui : c'est une moyenne pondérée sur ce qui
 * est connu, et non sur tout ce qui aurait pu l'être. Lui donner 0 ferait
 * passer une saisie incomplète pour un défaut — un Bien visité hier, dont on
 * n'a rempli que le prix, tomberait au dernier rang sans qu'aucun de ses
 * mérites ait été jugé. C'est `manquants` qui porte cette information à
 * l'écran, plutôt que le score qui la porterait en mentant.
 *
 * Les poids nuls sont écartés d'emblée : un Critère à 0 ne compte pas, et
 * ses valeurs manquantes n'ont donc pas à être signalées.
 *
 * Le tri place les scores absents en fin, quel que soit leur rang : un Bien
 * sans score n'est pas dernier, il est à part, et l'écran le montre à la
 * suite plutôt qu'au milieu.
 */
export function scorer(
  porteurIds: readonly number[],
  notables: readonly CritereNotable[],
  poids: PoidsPoses,
): readonly ScoreBien[] {
  const pesants = notables.filter((notable) => (poids[notable.id] ?? POIDS_PAR_DEFAUT) > 0);

  // L'échelle de chaque Critère est calculée une fois pour tout le carnet,
  // et non par Bien : c'est le carnet entier qui la définit, et la recalculer
  // à chaque porteur la rendrait fausse autant que coûteuse.
  const echelles = new Map<string, Echelle | null>(
    pesants.map((notable) => [
      notable.id,
      echelle(
        notable.critere,
        porteurIds.map((porteurId) => notable.valeurDe(porteurId)),
      ),
    ]),
  );

  const scores = porteurIds.map((porteurId): ScoreBien => {
    const contributions: Contribution[] = [];
    let manquants = 0;
    let total = 0;
    let sommePoids = 0;

    for (const notable of pesants) {
      const poidsCritere = poids[notable.id] ?? POIDS_PAR_DEFAUT;
      const bornes = echelles.get(notable.id) ?? null;
      const valeur = notable.valeurDe(porteurId);
      const notee = bornes === null ? null : note(notable.critere, valeur, bornes);

      if (notee === null) {
        manquants += 1;
        continue;
      }

      contributions.push({
        critereId: notable.id,
        libelle: notable.libelle,
        note: notee,
        poids: poidsCritere,
        valeur,
      });

      total += notee * poidsCritere;
      sommePoids += poidsCritere;
    }

    return {
      porteurId,
      score: sommePoids === 0 ? null : Math.round((total / sommePoids) * 100),
      // Du plus lourd au plus léger : ce qui a fait le score se lit en
      // premier. À poids égal, la meilleure note d'abord.
      contributions: [...contributions].sort(
        (a, b) => b.poids * b.note - a.poids * a.note || b.note - a.note,
      ),
      manquants,
    };
  });

  return [...scores].sort((a, b) => {
    if (a.score === null && b.score === null) {
      return 0;
    }

    if (a.score === null) {
      return 1;
    }

    if (b.score === null) {
      return -1;
    }

    return b.score - a.score;
  });
}
