import { describe, expect, it } from 'vitest';
import { ComparaisonBiens } from './comparaison-biens';
import { unBien } from './bien.test-helper';
import type { Bien } from './bien';
import { COLONNES, ID_COLONNE_PRIX_METRE_CARRE } from '../criteres/colonnes';

/**
 * `Intl` insère des espaces insécables autour des unités et des séparateurs
 * de milliers, comme le relève déjà `formatage.spec.ts`. Les comparer tels
 * quels rendrait l'attente dépendante du caractère exact que produit la
 * version d'ICU du moment.
 */
function normaliser(texte: string): string {
  return texte.replace(/[\u00a0\u202f]/g, ' ');
}

/**
 * Le composant est construit sans TestBed, comme les autres écrans : les
 * Biens se posent sur son signal, et les assertions portent sur ce qu'il
 * calcule plutôt que sur le DOM rendu.
 */
function creerComparaison(biens: Bien[]) {
  const comparaison = new ComparaisonBiens();

  comparaison.biens.set(biens);

  return comparaison;
}

/** Ce que la ligne de cette colonne met en évidence, un booléen par Bien. */
function misEnEvidence(comparaison: ComparaisonBiens, id: string): boolean[] {
  const ligne = comparaison.lignes().find((candidate) => candidate.colonne.id === id);

  if (!ligne) {
    throw new Error(`Aucune ligne pour la colonne « ${id} ».`);
  }

  return ligne.cases.map((donnee) => donnee.meilleure);
}

describe('ComparaisonBiens', () => {
  it('pose une colonne par Bien, dans l’ordre reçu', () => {
    // L'ordre est celui dans lequel l'acheteur les a choisis : c'est le seul
    // qu'il a demandé, et le seul qui ne fasse pas bouger les colonnes déjà
    // posées (#12).
    const comparaison = creerComparaison([
      unBien({ id: 7, libelle: 'zébulon' }),
      unBien({ id: 3, libelle: 'anatole' }),
    ]);

    expect(comparaison.colonnes().map((colonne) => colonne.bien.libelle)).toEqual([
      'zébulon',
      'anatole',
    ]);
  });

  it('porte le Libellé et le Statut de chaque Bien en tête de colonne', () => {
    // Ce sous quoi l'acheteur reconnaît le Bien dont il lit les valeurs, et
    // où il en est. Le Statut n'a pas de ligne : il ne se compare pas d'un
    // Bien à l'autre (ADR-0002).
    const comparaison = creerComparaison([unBien({ libelle: 'le T3', statut: 'visite' })]);
    const [colonne] = comparaison.colonnes();

    expect(colonne.bien.libelle).toBe('le T3');
    expect(colonne.statut).toBe('visite');
    expect(colonne.libelleStatut).toBe('Visité');
  });

  it('pose une ligne par Colonne, dans l’ordre du tableau', () => {
    // Les deux écrans montrent les mêmes Biens (ADR-0006), et un Critère
    // ajouté à la définition y paraît sans que l'écran soit retouché
    // (ADR-0004).
    const comparaison = creerComparaison([unBien(), unBien({ id: 2 })]);

    expect(comparaison.lignes().map((ligne) => ligne.colonne.id)).toEqual(
      COLONNES.map((colonne) => colonne.id),
    );
  });

  it('compte le prix au mètre carré parmi ses lignes', () => {
    // Le critère d'acceptation le demande nommément (#12).
    const comparaison = creerComparaison([unBien()]);

    expect(
      comparaison.lignes().some((ligne) => ligne.colonne.id === ID_COLONNE_PRIX_METRE_CARRE),
    ).toBe(true);
  });

  it('met en évidence la meilleure valeur selon le sens de comparaison', () => {
    // Le prix le plus bas gagne, la surface la plus haute aussi : c'est le
    // sens déclaré dans la définition (#5), et rien d'autre.
    const comparaison = creerComparaison([
      unBien({ id: 1, criteres: { prixDemande: 250000, surfaceHabitable: 60 } }),
      unBien({ id: 2, criteres: { prixDemande: 190000, surfaceHabitable: 95 } }),
    ]);

    expect(misEnEvidence(comparaison, 'prixDemande')).toEqual([false, true]);
    expect(misEnEvidence(comparaison, 'surfaceHabitable')).toEqual([false, true]);
  });

  it('ne désigne jamais un Critère non renseigné comme meilleur', () => {
    // Un Critère non renseigné ne gagne ni ne perd, il est simplement
    // absent (#12) : un prix absent n'est pas le moins cher du carnet.
    const comparaison = creerComparaison([
      unBien({ id: 1, criteres: { prixDemande: null } }),
      unBien({ id: 2, criteres: { prixDemande: 250000 } }),
    ]);

    expect(misEnEvidence(comparaison, 'prixDemande')).toEqual([false, true]);
  });

  it('met tous les ex æquo en évidence, sans en désigner un arbitrairement', () => {
    // Une égalité se traite en les mettant tous en évidence : départager
    // deux Biens au même prix serait une préférence inventée (#12).
    const comparaison = creerComparaison([
      unBien({ id: 1, criteres: { prixDemande: 190000 } }),
      unBien({ id: 2, criteres: { prixDemande: 250000 } }),
      unBien({ id: 3, criteres: { prixDemande: 190000 } }),
    ]);

    expect(misEnEvidence(comparaison, 'prixDemande')).toEqual([true, false, true]);
  });

  it('ne met rien en évidence sur un Critère qui ne se compare pas', () => {
    // Une ville n'est pas meilleure qu'une autre : `aucun` est le sens
    // déclaré, et la ligne paraît sans mise en évidence.
    const comparaison = creerComparaison([
      unBien({ id: 1, criteres: { villeQuartier: 'Nantes' } }),
      unBien({ id: 2, criteres: { villeQuartier: 'Rennes' } }),
    ]);

    expect(misEnEvidence(comparaison, 'villeQuartier')).toEqual([false, false]);
  });

  it('compare le prix au mètre carré, calculé de chaque Bien', () => {
    // Le second est plus cher en valeur absolue mais moins cher au mètre
    // carré : c'est précisément ce que la ligne sert à voir (ADR-0013).
    const comparaison = creerComparaison([
      unBien({ id: 1, criteres: { prixDemande: 250000, surfaceHabitable: 50 } }),
      unBien({ id: 2, criteres: { prixDemande: 300000, surfaceHabitable: 100 } }),
    ]);

    expect(misEnEvidence(comparaison, ID_COLONNE_PRIX_METRE_CARRE)).toEqual([false, true]);
  });

  it('écrit les valeurs comme le tableau les écrit', () => {
    // Une valeur écrite autrement d'un écran à l'autre se lirait comme une
    // donnée différente (ADR-0006).
    const comparaison = creerComparaison([unBien({ criteres: { surfaceHabitable: 72.5 } })]);
    const ligne = comparaison
      .lignes()
      .find((candidate) => candidate.colonne.id === 'surfaceHabitable');

    expect(normaliser(ligne?.cases[0].texte ?? '')).toBe('72,5 m²');
  });

  it('reste affichable sans aucun Bien sélectionné', () => {
    // L'écran montre ses lignes vides plutôt que de disparaître : la page
    // décide seule s'il y a lieu de le monter.
    const comparaison = creerComparaison([]);

    expect(comparaison.colonnes()).toEqual([]);
    expect(comparaison.lignes()).toHaveLength(COLONNES.length);
  });
});
