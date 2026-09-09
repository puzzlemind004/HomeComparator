import { describe, expect, it } from 'vitest';
import { CRITERES, CRITERES_ORDONNES, critereParId, criteresDuGroupe } from './definition';

/**
 * La définition est lue par cinq écrans qui ne la valident pas : une entrée
 * incohérente ne se verrait qu'à l'affichage, et seulement sur l'écran qui
 * la touche. Ces tests tiennent les invariants que le typage ne dit pas.
 */
describe('la définition des Critères', () => {
  it('déclare chaque Critère une seule fois', () => {
    const ids = CRITERES.map(({ id }) => id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('couvre les Critères identifiés à l\'expression du besoin', () => {
    // La liste du ticket #5, telle quelle : un Critère qui en disparaîtrait
    // ferait disparaître une colonne de tous les écrans sans bruit.
    expect(CRITERES.map(({ id }) => id).sort()).toEqual(
      [
        'adresse',
        'anneeConstruction',
        'capaciteStationnement',
        'chargesCopropriete',
        'dpe',
        'exterieur',
        'nombrePieces',
        'prixDemande',
        'surfaceHabitable',
        'taxeFonciere',
        'tempsTrajetTravail',
        'travauxAPrevoir',
        'typeBien',
        'typeChauffage',
        'villeQuartier',
      ].sort(),
    );
  });

  it('donne à chaque Critère un libellé affichable', () => {
    for (const { id, libelle } of CRITERES) {
      expect(libelle.trim(), `le Critère ${id} n'a pas de libellé`).not.toBe('');
    }
  });

  it("n'attribue pas deux fois le même ordre", () => {
    // Deux Critères au même rang se rangeraient dans un ordre que rien ne
    // décide, et qui pourrait changer d'une exécution à l'autre.
    const ordres = CRITERES.map(({ ordre }) => ordre);

    expect(new Set(ordres).size).toBe(ordres.length);
  });

  it('ne déclare des valeurs que sur les énumérations', () => {
    for (const critere of CRITERES) {
      if (critere.type === 'enumeration') {
        expect(critere.valeurs, `${critere.id} est une énumération sans valeurs`).not.toBeNull();
        expect(critere.valeurs?.length, `${critere.id} déclare une liste vide`).toBeGreaterThan(0);
      } else {
        expect(critere.valeurs, `${critere.id} n'est pas une énumération`).toBeNull();
      }
    }
  });

  it("ne répète pas une valeur au sein d'une énumération", () => {
    for (const { id, valeurs } of CRITERES) {
      if (!valeurs) {
        continue;
      }

      const admises = valeurs.map((valeur) => valeur.valeur);

      expect(new Set(admises).size, `${id} répète une valeur`).toBe(admises.length);
    }
  });

  it('donne un libellé à chaque valeur énumérée', () => {
    for (const { id, valeurs } of CRITERES) {
      for (const valeur of valeurs ?? []) {
        expect(valeur.libelle.trim(), `${id}.${valeur.valeur} n'a pas de libellé`).not.toBe('');
      }
    }
  });

  it('ne compare que ce qui se compare', () => {
    // Un texte libre n'a pas de meilleure valeur : lui donner un sens de
    // comparaison ferait mettre une adresse en évidence sur la vue de
    // comparaison (#12).
    for (const { id, type, sensComparaison } of CRITERES) {
      if (type === 'texte') {
        expect(sensComparaison, `${id} est un texte qui prétend se classer`).toBe('aucun');
      }
    }
  });
});

describe('CRITERES_ORDONNES', () => {
  it('rend les Critères par ordre croissant', () => {
    const ordres = CRITERES_ORDONNES.map(({ ordre }) => ordre);

    expect(ordres).toEqual([...ordres].sort((a, b) => a - b));
  });

  it('ne perd ni ne duplique aucun Critère', () => {
    expect(CRITERES_ORDONNES).toHaveLength(CRITERES.length);
  });
});

describe('critereParId', () => {
  it('retrouve un Critère par son identifiant', () => {
    expect(critereParId('prixDemande')?.libelle).toBe('Prix demandé');
  });

  it("ne rend rien pour un identifiant inconnu", () => {
    expect(critereParId('pasUnCritere')).toBeUndefined();
  });
});

describe('criteresDuGroupe', () => {
  it("ne rend que les Critères du groupe demandé", () => {
    const budget = criteresDuGroupe('budget');

    expect(budget.length).toBeGreaterThan(0);
    expect(budget.every(({ groupe }) => groupe === 'budget')).toBe(true);
  });

  it('les rend dans l\'ordre d\'affichage', () => {
    const ordres = criteresDuGroupe('logement').map(({ ordre }) => ordre);

    expect(ordres).toEqual([...ordres].sort((a, b) => a - b));
  });

  it('répartit tous les Critères entre les groupes, sans reste', () => {
    const groupes = ['budget', 'logement', 'localisation', 'confort'] as const;
    const repartis = groupes.flatMap((groupe) => [...criteresDuGroupe(groupe)]);

    expect(repartis).toHaveLength(CRITERES.length);
  });
});
