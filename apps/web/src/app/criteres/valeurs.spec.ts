import { describe, expect, it } from 'vitest';
import { criteresNonRenseignes, estRenseigne } from './valeurs';

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
