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
 * La note d'un Critère que personne ne départage : le milieu de l'échelle.
 *
 * Elle ne sert qu'au cas où le Critère ne classe rien du tout — aucun Bien ne
 * l'a renseigné, ou tous l'ont fait et aucun ne s'est tu, ce qui ne laisse
 * personne à qui donner le plancher. Ni récompense ni punition : il n'y a
 * rien à récompenser ni à punir.
 *
 * Un Critère **non renseigné** alors que d'autres ont répondu ne passe pas
 * par ici : il prend le plancher (voir `notePlancher`), sans quoi taire une
 * mauvaise valeur paierait encore.
 */
const NOTE_NEUTRE = 0.5;

/**
 * La note d'un Critère que ce Bien ne renseigne pas : celle du pire Bien qui
 * l'a renseigné (#128).
 *
 * **Ni écarté du calcul, ni mis à zéro, ni mis au milieu** — les trois se
 * trompent, et les deux premiers ont été essayés :
 *
 * - *Écarté du dénominateur* : l'absence devenait un avantage franc. Un Bien
 *   à 300 000 € pour 120 m² obtenait 50 quand un Bien à 200 000 € sans
 *   surface obtenait 100, sa moyenne n'étant plus faite que de son meilleur
 *   Critère.
 * - *À mi-échelle* : mieux, mais taire une mauvaise valeur payait encore —
 *   le Bien le plus petit du carnet gagnait des points à cacher sa surface,
 *   0,5 valant mieux que le 0 qu'il méritait.
 * - *À zéro* : une saisie en retard prise pour un défaut, ce que le carnet ne
 *   doit pas faire — il est fait pour être rempli au fil des visites.
 *
 * Le plancher est le seul point qui ne récompense jamais le silence : au
 * mieux, ne pas répondre vaut autant que la pire réponse connue. Il ne punit
 * pas pour autant — le Bien n'est pas mis sous le pire, il est mis à son
 * niveau, et toute valeur réelle qu'il finira par porter ne pourra que le
 * faire monter ou le laisser où il est.
 *
 * C'est une note et non un poids : le poids reste celui que l'acheteur a
 * posé, et ignorer un Critère décisif pèse donc plus lourd qu'ignorer un
 * Critère accessoire.
 */
function notePlancher(bornes: Echelle, porteurs: number): number {
  // Personne n'a répondu : il n'y a rien à quoi se comparer, et le Critère
  // ne départage personne. La note neutre ne récompense ni ne punit.
  if (bornes.temoins === 0 || bornes.temoins === porteurs) {
    return NOTE_NEUTRE;
  }

  // Au moins un Bien a répondu et au moins un s'est tu : ne pas répondre vaut
  // la pire réponse connue — jamais mieux, sans quoi taire une mauvaise
  // valeur paierait (#128).
  return 0;
}

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
 * Vrai quand ce Bien porte une valeur sur ce Critère, quelle qu'elle vaille.
 *
 * Distinct d'« avoir une note » : une valeur peut être saisie sans être
 * classable — seul Bien à la renseigner (#129), ou valeur hors définition.
 * C'est la saisie que `manquants` compte, pas la classabilité.
 */
function estRenseignee(valeur: ValeurCritere): boolean {
  return valeur !== null && valeur !== undefined && valeur !== '';
}

/**
 * Les bornes d'un Critère sur le carnet : ce qui sert d'échelle au min-max.
 *
 * `null` quand aucun Bien ne renseigne le Critère — il n'y a alors rien à
 * échelonner du tout.
 */
interface Echelle {
  minimum: number;
  maximum: number;

  /**
   * Combien de Biens renseignent ce Critère.
   *
   * Porté parce que `maximum === minimum` recouvre deux situations que rien
   * d'autre ne distingue, et qui n'appellent pas la même note (#129) : cinq
   * Biens au même prix — une égalité réelle —, et un seul Bien à l'avoir
   * renseigné — un témoin unique, qui n'a battu personne.
   */
  temoins: number;
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
 *
 * Le nombre de témoins est compté ici plutôt que déduit des bornes : une
 * étendue nulle ne dit pas si cinq Biens sont à égalité ou si un seul a
 * répondu, et les deux ne valent pas la même note (#129).
 */
function echelle(critere: Critere, valeurs: readonly ValeurCritere[]): Echelle | null {
  const rangs = valeurs
    .map((valeur) => rang(critere, valeur))
    .filter((r): r is number => r !== null);

  if (rangs.length === 0) {
    return null;
  }

  return {
    minimum: Math.min(...rangs),
    maximum: Math.max(...rangs),
    temoins: rangs.length,
  };
}

/**
 * La note de 0 à 1 d'une valeur sur son échelle, ou `null` si elle n'en a
 * pas — Critère non renseigné, ou valeur hors définition.
 *
 * Le sens de comparaison décide du haut : sur un prix, le minimum du carnet
 * vaut 1 ; sur une surface, c'est le maximum. Un Critère `aucun` n'arrive
 * jamais ici — il n'est pas pondérable, et `criteresNotables` l'écarte.
 *
 * Quand l'échelle est plate, deux situations se ressemblent et ne valent pas
 * la même note (#129) :
 *
 * - **Plusieurs Biens à la même valeur** — une égalité réelle. La note vaut
 *   1 partout : aucun ne se distingue, et les départager reviendrait à
 *   inventer un écart. Les poser tous à 0 serait pire : un carnet où tous
 *   les Biens ont le même DPE verrait ce Critère annuler silencieusement le
 *   poids qu'on lui a donné.
 * - **Un seul Bien à l'avoir renseigné** — un témoin unique. Il prend 1, et
 *   les silencieux le plancher : répondre vaut mieux que se taire, sans quoi
 *   il suffirait d'être le dernier à répondre pour qu'un Critère cesse de
 *   classer qui que ce soit, et cacher une mauvaise valeur paierait (#128,
 *   #129). Sa valeur ne se mesure à rien de déclaré, mais elle se mesure au
 *   silence des autres.
 */
function note(critere: Critere, valeur: ValeurCritere, bornes: Echelle): number | null {
  const position = rang(critere, valeur);

  if (position === null) {
    return null;
  }

  const etendue = bornes.maximum - bornes.minimum;

  if (etendue === 0) {
    // Toutes les valeurs connues sont égales. Plusieurs témoins : égalité
    // réelle, tous à 1. Un seul : sa valeur ne se mesure à rien de déclaré,
    // mais elle se mesure au silence des autres — un Bien qui répond vaut
    // mieux qu'un Bien qui se tait, sans quoi répondre serait toujours
    // désavantageux (#128). Il prend donc 1, et les silencieux le plancher.
    return 1;
  }



  const normalisee = (position - bornes.minimum) / etendue;

  return critere.sensComparaison === 'plusPetitEstMeilleur' ? 1 - normalisee : normalisee;
}

/**
 * Le score de chaque porteur, du meilleur au moins bon.
 *
 * **Un Critère non renseigné vaut la note neutre, et garde son poids** (#128).
 *
 * La première version le sortait du calcul, poids compris, en se réclamant
 * d'un principe juste — « ni pour ni contre » — qu'elle appliquait mal. Sortir
 * du dénominateur n'est pas neutre : c'est avantageux. Un Bien à 300 000 €
 * pour 120 m² obtenait 50, quand un Bien à 200 000 € dont la surface manquait
 * obtenait 100 et passait devant, sa moyenne n'étant plus faite que de son
 * meilleur Critère. Un carnet en cours de recherche est majoritairement fait
 * de Biens à moitié saisis : c'était le cas ordinaire, pas un cas limite.
 *
 * Lui donner 0 serait l'erreur inverse — une saisie en retard prise pour un
 * défaut, un Bien visité hier relégué au dernier rang sans qu'aucun de ses
 * mérites ait été jugé.
 *
 * Le **plancher** est la sortie de ce faux choix : le Critère reste au
 * dénominateur — donc l'ignorance ne rapporte rien — et il y entre à la note
 * du pire Bien qui a répondu — donc taire une mauvaise valeur ne rapporte
 * rien non plus. Au mieux, ne pas répondre vaut autant que la pire réponse
 * connue, jamais mieux. C'est `manquants` qui dit sur quoi le score repose.
 *
 * Les poids nuls sont écartés d'emblée : un Critère à 0 ne compte pas, et
 * ses valeurs manquantes n'ont donc pas à être signalées.
 *
 * Un Bien dont **aucun** Critère pondéré n'est renseigné n'a pas de score :
 * une moyenne entièrement faite de planchers le dirait mauvais alors qu'on
 * n'en sait rien, et `null` le met à part (voir `ScoreBien`).
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
    let renseignes = 0;
    let total = 0;
    let sommePoids = 0;

    for (const notable of pesants) {
      const poidsCritere = poids[notable.id] ?? POIDS_PAR_DEFAUT;
      const bornes = echelles.get(notable.id) ?? null;
      const valeur = notable.valeurDe(porteurId);
      const notee = bornes === null ? null : note(notable.critere, valeur, bornes);

      if (estRenseignee(valeur)) {
        renseignes += 1;
      }

      if (notee === null) {
        // Le Critère n'a pas de note, mais son poids reste au dénominateur :
        // c'est ce qui empêche l'ignorance de rapporter (#128). La note est
        // celle du pire Bien qui a répondu, jamais mieux.
        total += (bornes === null ? NOTE_NEUTRE : notePlancher(bornes, porteurIds.length)) * poidsCritere;
        sommePoids += poidsCritere;

        // `manquants` compte ce que **ce Bien** ne renseigne pas, et non ce
        // que le carnet ne sait pas classer : un Critère que ce Bien porte
        // mais qu'aucun autre ne renseigne n'a pas de note (#129) sans être
        // manquant pour autant, et l'annoncer ainsi accuserait le seul Bien
        // qui a pris la peine de le remplir.
        if (!estRenseignee(valeur)) {
          manquants += 1;
        }

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
      // Aucun Critère pondéré renseigné : le Bien n'a pas de score. Une
      // moyenne faite de seuls planchers le dirait mauvais alors qu'on n'en
      // sait rien. C'est la **saisie** qui compte
      // ici et non la classabilité : un Bien qui a tout rempli garde son
      // score même si le carnet ne sait rien en classer (#129).
      score: renseignes === 0 ? null : Math.round((total / sommePoids) * 100),
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
