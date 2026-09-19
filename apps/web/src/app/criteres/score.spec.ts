import { describe, expect, it } from 'vitest';
import { POIDS_PAR_DEFAUT, type CritereNotable, type PoidsPoses, scorer } from './score';
import { critere } from './critere.test-helper';
import type { ValeurCritere } from './comparaison';

/**
 * Un Critère pondérable bâti sur la définition réelle, dont les valeurs se
 * lisent dans une carte : c'est la forme sous laquelle le tableau de bord
 * les présente, et elle suffit à éprouver le calcul sans monter d'écran.
 */
function notable(id: string, valeurs: Record<number, ValeurCritere>): CritereNotable {
  const declare = critere(id);

  return {
    id,
    libelle: declare.libelle,
    critere: declare,
    valeurDe: (porteurId) => valeurs[porteurId] ?? null,
  };
}

/** Le score d'un porteur dans un classement, pour alléger les attentes. */
function scoreDe(classement: readonly { porteurId: number; score: number | null }[], id: number) {
  return classement.find((ligne) => ligne.porteurId === id)?.score ?? null;
}

describe('scorer', () => {
  it('donne 100 au meilleur du carnet et 0 au pire', () => {
    // Le carnet est l'échelle : personne ne sait dire dans l'abstrait qu'un
    // prix est bon, mais tout le monde voit qu'il est le plus bas des trois.
    const classement = scorer(
      [1, 2, 3],
      [notable('prixDemande', { 1: 200000, 2: 250000, 3: 300000 })],
      {},
    );

    expect(scoreDe(classement, 1)).toBe(100);
    expect(scoreDe(classement, 3)).toBe(0);
  });

  it('renverse l’échelle selon le sens de comparaison', () => {
    // Sur un prix, le minimum du carnet vaut 100 ; sur une surface, c'est le
    // maximum. C'est `sensComparaison` qui le dit, et rien d'autre.
    const parPrix = scorer([1, 2], [notable('prixDemande', { 1: 200000, 2: 300000 })], {});
    const parSurface = scorer([1, 2], [notable('surfaceHabitable', { 1: 60, 2: 90 })], {});

    expect(scoreDe(parPrix, 1)).toBe(100);
    expect(scoreDe(parSurface, 1)).toBe(0);
    expect(scoreDe(parSurface, 2)).toBe(100);
  });

  it('classe du meilleur score au moins bon', () => {
    const classement = scorer(
      [1, 2, 3],
      [notable('prixDemande', { 1: 300000, 2: 200000, 3: 250000 })],
      {},
    );

    expect(classement.map((ligne) => ligne.porteurId)).toEqual([2, 3, 1]);
  });

  it('pondère : un Critère lourd pèse plus qu’un léger', () => {
    // Le Bien 1 gagne sur le prix, le Bien 2 sur la surface. Le poids
    // décide, et c'est tout l'objet de l'écran.
    const notables = [
      notable('prixDemande', { 1: 200000, 2: 300000 }),
      notable('surfaceHabitable', { 1: 60, 2: 90 }),
    ];

    const prixDecisif: PoidsPoses = { prixDemande: 5, surfaceHabitable: 1 };
    const surfaceDecisive: PoidsPoses = { prixDemande: 1, surfaceHabitable: 5 };

    expect(scorer([1, 2], notables, prixDecisif)[0].porteurId).toBe(1);
    expect(scorer([1, 2], notables, surfaceDecisive)[0].porteurId).toBe(2);
  });

  it('ignore un Critère dont le poids est nul', () => {
    // À zéro, le Critère ne compte pas : le classement est alors celui de la
    // seule surface, où le Bien 2 l'emporte malgré son prix.
    const classement = scorer(
      [1, 2],
      [
        notable('prixDemande', { 1: 200000, 2: 300000 }),
        notable('surfaceHabitable', { 1: 60, 2: 90 }),
      ],
      { prixDemande: 0 },
    );

    expect(classement[0].porteurId).toBe(2);
    expect(classement[0].contributions.map((c) => c.critereId)).toEqual(['surfaceHabitable']);
  });

  it('ne met pas au dernier rang un Bien à moitié saisi', () => {
    // Un Bien dont on n'a rempli que le prix ne doit pas tomber au dernier
    // rang sans qu'aucun de ses mérites ait été jugé. Mais il ne doit pas
    // non plus égaler celui qui a tout rempli (#128) : sa surface manquante
    // prend le plancher, et il passe donc derrière.
    const classement = scorer(
      [1, 2],
      [
        notable('prixDemande', { 1: 200000, 2: 200000 }),
        notable('surfaceHabitable', { 1: 90, 2: null }),
      ],
      {},
    );

    expect(scoreDe(classement, 1)).toBeGreaterThan(scoreDe(classement, 2) as number);

    // Il garde un score : il n'est pas écarté du classement pour autant.
    expect(scoreDe(classement, 2)).not.toBeNull();
  });

  it('compte les Critères pondérés qu’un Bien ne renseigne pas', () => {
    const classement = scorer(
      [1],
      [
        notable('prixDemande', { 1: 200000 }),
        notable('surfaceHabitable', { 1: null }),
        notable('nombrePieces', { 1: null }),
      ],
      {},
    );

    expect(classement[0].manquants).toBe(2);
  });

  it('ne compte pas comme manquant un Critère dont le poids est nul', () => {
    // Un Critère à zéro ne compte pas : signaler qu'il manque ferait
    // s'inquiéter d'une absence sans conséquence.
    const classement = scorer(
      [1],
      [notable('prixDemande', { 1: 200000 }), notable('surfaceHabitable', { 1: null })],
      { surfaceHabitable: 0 },
    );

    expect(classement[0].manquants).toBe(0);
  });

  it('rend un score nul quand aucun Critère pondéré n’est renseigné', () => {
    // `null` et non zéro : un Bien qu'on n'a pas rempli n'est pas un mauvais
    // Bien, et le poser en bas ferait passer une saisie en retard pour un
    // défaut.
    const classement = scorer([1], [notable('prixDemande', { 1: null })], {});

    expect(classement[0].score).toBeNull();
  });

  it('range les Biens sans score après tous les autres', () => {
    const classement = scorer(
      [1, 2, 3],
      [notable('prixDemande', { 1: 300000, 2: null, 3: 200000 })],
      {},
    );

    expect(classement.map((ligne) => ligne.porteurId)).toEqual([3, 1, 2]);
    expect(classement[2].score).toBeNull();
  });

  it('donne le même score à tous quand une valeur est commune au carnet', () => {
    // Cinq Biens au même prix ne se départagent pas par le prix : les poser
    // tous à zéro annulerait silencieusement le poids qu'on lui a donné.
    const classement = scorer([1, 2], [notable('prixDemande', { 1: 250000, 2: 250000 })], {});

    expect(scoreDe(classement, 1)).toBe(100);
    expect(scoreDe(classement, 2)).toBe(100);
  });

  it('classe une énumération ordonnée sur son rang, pas sur sa valeur', () => {
    // A vaut mieux que G, et c'est l'ordre de la définition qui le dit.
    const classement = scorer([1, 2], [notable('dpe', { 1: 'G', 2: 'B' })], {});

    expect(classement[0].porteurId).toBe(2);
    expect(scoreDe(classement, 2)).toBe(100);
  });

  it('applique le poids par défaut à un Critère dont rien n’a été dit', () => {
    // Un poids absent vaut le défaut : c'est ce qui permet de ne rien écrire
    // tant que l'acheteur n'a touché à aucun curseur.
    const notables = [notable('prixDemande', { 1: 200000, 2: 300000 })];

    const sansRien = scorer([1, 2], notables, {});
    const avecLeDefaut = scorer([1, 2], notables, { prixDemande: POIDS_PAR_DEFAUT });

    expect(sansRien.map((l) => l.score)).toEqual(avecLeDefaut.map((l) => l.score));
  });

  it('détaille les contributions, du plus lourd au plus léger', () => {
    const classement = scorer(
      [1, 2],
      [
        notable('prixDemande', { 1: 200000, 2: 300000 }),
        notable('surfaceHabitable', { 1: 90, 2: 60 }),
      ],
      { prixDemande: 1, surfaceHabitable: 5 },
    );

    const gagnant = classement[0];

    expect(gagnant.porteurId).toBe(1);
    expect(gagnant.contributions[0].critereId).toBe('surfaceHabitable');
    expect(gagnant.contributions[0].poids).toBe(5);
  });

  it('rend un classement vide sur un carnet vide', () => {
    expect(scorer([], [notable('prixDemande', {})], {})).toEqual([]);
  });

  it('rend des scores nuls quand tous les poids sont à zéro', () => {
    // Plus rien ne pèse : il n'y a pas de classement, et l'écran le dit
    // plutôt que d'aligner des zéros qui se ressembleraient.
    const classement = scorer(
      [1, 2],
      [notable('prixDemande', { 1: 200000, 2: 300000 })],
      { prixDemande: 0 },
    );

    expect(classement.every((ligne) => ligne.score === null)).toBe(true);
  });

  it('écarte de l’échelle une valeur que la définition ne connaît pas', () => {
    // Un DPE « Z » n'a pas de rang : il ne compte pas comme témoin, et le
    // Bien 2 se retrouve seul à l'avoir réellement renseigné. Il l'emporte —
    // répondre vaut mieux que se taire —, et le Bien 1 prend le plancher.
    const classement = scorer([1, 2], [notable('dpe', { 1: 'Z', 2: 'B' })], {});

    expect(classement[0].porteurId).toBe(2);
    expect(scoreDe(classement, 2)).toBeGreaterThan(scoreDe(classement, 1) as number);
  });

  it('ne récompense pas un Bien qui tait une mauvaise valeur', () => {
    // Le défaut que #128 nommait : sorti du dénominateur, le Critère absent
    // avantageait celui qui ne l'avait pas rempli. Le Bien 2 porte la pire
    // surface du carnet ; la cacher ne doit rien lui rapporter.
    const prix = { 1: 250000, 2: 250000, 3: 250000 };

    const declaree = scorer(
      [1, 2, 3],
      [
        notable('prixDemande', prix),
        notable('surfaceHabitable', { 1: 120, 2: 60, 3: 90 }),
      ],
      {},
    );

    const tue = scorer(
      [1, 2, 3],
      [
        notable('prixDemande', prix),
        notable('surfaceHabitable', { 1: 120, 2: null, 3: 90 }),
      ],
      {},
    );

    expect(scoreDe(tue, 2)).toBeLessThanOrEqual(scoreDe(declaree, 2) as number);
  });

  it('ne fait pas gagner un Bien à moitié saisi contre un Bien complet', () => {
    // À prix égal, le Bien dont la surface manque ne doit pas passer devant
    // celui qui l'a renseignée au-dessus du pire du carnet (#128).
    const classement = scorer(
      [1, 2, 3],
      [
        notable('prixDemande', { 1: 250000, 2: 250000, 3: 250000 }),
        notable('surfaceHabitable', { 1: 120, 2: null, 3: 90 }),
      ],
      {},
    );

    // Le Bien 1 mène sur sa surface déclarée. Le Bien 2, qui n'en a pas,
    // prend le plancher : jamais mieux que la pire surface déclarée.
    expect(classement[0].porteurId).toBe(1);
    expect(scoreDe(classement, 2)).toBeLessThanOrEqual(scoreDe(classement, 3) as number);
  });

  it('garde son poids au Critère non renseigné', () => {
    // Le Critère reste au dénominateur : c'est ce qui empêche l'absence
    // d'améliorer la moyenne en la réduisant à ce qui va bien (#128). Sorti
    // du calcul, le Bien 1 n'aurait plus été jugé que sur le prix, qu'il
    // gagne — et serait passé de 50 à 100 en cachant sa surface.
    const complet = scorer(
      [1, 2],
      [
        notable('prixDemande', { 1: 200000, 2: 300000 }),
        notable('surfaceHabitable', { 1: 50, 2: 100 }),
      ],
      {},
    );

    const ampute = scorer(
      [1, 2],
      [
        notable('prixDemande', { 1: 200000, 2: 300000 }),
        notable('surfaceHabitable', { 1: null, 2: 100 }),
      ],
      {},
    );

    // Le Bien 1 gagne sur le prix et perd sur la surface. Taire sa mauvaise
    // surface ne doit pas le faire monter.
    expect(scoreDe(ampute, 1)).toBeLessThanOrEqual(scoreDe(complet, 1) as number);
    expect(scoreDe(ampute, 1)).toBeLessThan(100);
  });

  it('ne compte pas comme manquant un Critère que le Bien a renseigné', () => {
    // Un Critère que ce Bien porte mais qu'aucun autre ne renseigne n'a pas
    // de note (#129) sans être manquant : l'annoncer ainsi accuserait le seul
    // Bien qui a pris la peine de le remplir.
    const classement = scorer(
      [1, 2],
      [notable('prixDemande', { 1: 200000, 2: 250000 }), notable('capaciteStationnement', { 1: 2, 2: null })],
      {},
    );

    expect(classement.find((ligne) => ligne.porteurId === 1)?.manquants).toBe(0);
    expect(classement.find((ligne) => ligne.porteurId === 2)?.manquants).toBe(1);
  });

  it('fait gagner le seul Bien à renseigner un Critère', () => {
    // Un Bien qui répond vaut mieux qu'un Bien qui se tait : lui donner la
    // note neutre rendrait profitable d'être le dernier à répondre, et taire
    // une mauvaise valeur paierait (#128, #129). Les silencieux n'ont pas de
    // score du tout ici — ce Critère est le seul pondéré, et ils ne le
    // renseignent pas.
    const classement = scorer(
      [1, 2, 3],
      [notable('capaciteStationnement', { 1: 2, 2: null, 3: null })],
      {},
    );

    expect(classement[0].porteurId).toBe(1);
    expect(scoreDe(classement, 1)).toBe(100);
  });
});
