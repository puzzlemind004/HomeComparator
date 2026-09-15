import { describe, expect, it } from 'vitest';
import { completude, criteresNonRenseignes, estRenseigne } from './valeurs';

/**
 * La distinction entre « non renseigné » et « renseigné à zéro » : c'est
 * elle qui dit à l'acheteur ce qu'il lui reste à demander à l'agence, et
 * elle seule qui empêche la comparaison de désigner un Critère absent comme
 * la meilleure valeur (#6, #12).
 */
describe('estRenseigne', () => {
  it('tient zéro pour une valeur', () => {
    // Zéro place de stationnement est une information, et l'écran doit la
    // montrer comme telle plutôt que comme une case à remplir.
    expect(estRenseigne(0)).toBe(true);
  });

  it('tient « faux » pour une valeur', () => {
    // Le premier Critère par oui/non qu'on ajoutera — ascenseur, cave —
    // aura « non » pour réponse aussi souvent que « oui ».
    expect(estRenseigne(false)).toBe(true);
  });

  it('ne tient pas l’absence de saisie pour une valeur', () => {
    expect(estRenseigne(null)).toBe(false);
    expect(estRenseigne(undefined)).toBe(false);
  });

  it('ne tient pas la chaîne vide pour une valeur', () => {
    // C'est ce qu'un champ effacé produit : cela vaut « pas renseigné ».
    expect(estRenseigne('')).toBe(false);
  });
});

describe('les Critères non renseignés', () => {
  it('sont tous les Critères sur un Bien qui vient d’être créé', () => {
    expect(criteresNonRenseignes({})).toHaveLength(15);
  });

  it('sont rendus dans l’ordre d’affichage', () => {
    const ordres = criteresNonRenseignes({}).map(({ ordre }) => ordre);

    expect(ordres).toEqual([...ordres].sort((a, b) => a - b));
  });

  it('écartent un Critère renseigné à zéro', () => {
    const ids = criteresNonRenseignes({ capaciteStationnement: 0 }).map(({ id }) => id);

    expect(ids).not.toContain('capaciteStationnement');
  });

  it('ignorent une clé qui ne correspond à aucun Critère', () => {
    // L'API peut rendre des champs que la définition ne connaît pas — l'id,
    // les dates : ils ne doivent pas se retrouver dans la liste.
    expect(criteresNonRenseignes({ id: 1, createdAt: 'hier' })).toHaveLength(15);
  });
});

/**
 * La complétude : ce que la refonte montre sur chaque carte, sur la fiche et
 * dans le tableau. Elle répond à la question que l'acheteur se pose en
 * rouvrant son carnet — non pas « qu'ai-je vu », mais « que me manque-t-il
 * pour décider ».
 */
describe('la complétude', () => {
  it('est nulle sur un Bien qui vient d’être créé', () => {
    const { renseignes, part } = completude({});

    expect(renseignes).toBe(0);
    expect(part).toBe(0);
  });

  it('compte sur le total des Critères définis', () => {
    // Le dénominateur sort de la définition et n'est pas écrit à la main :
    // un Critère ajouté doit se voir dans le compte sans qu'aucun écran soit
    // retouché (ADR-0004).
    expect(completude({}).total).toBe(criteresNonRenseignes({}).length);
  });

  it('compte un Critère renseigné à zéro', () => {
    // Zéro place de stationnement est une information : le Bien est renseigné
    // sur ce point, et la barre doit avancer.
    expect(completude({ capaciteStationnement: 0 }).renseignes).toBe(1);
  });

  it('ne compte pas un champ effacé', () => {
    expect(completude({ villeQuartier: '' }).renseignes).toBe(0);
  });

  it('rend la part que la barre affiche', () => {
    const { total } = completude({});
    const { part } = completude({ prixDemande: 249000, surfaceHabitable: 76.2 });

    expect(part).toBeCloseTo(2 / total);
  });
});
