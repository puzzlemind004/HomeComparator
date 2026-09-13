import { describe, expect, it } from 'vitest';
import {
  MAXIMUM_DESKTOP,
  MAXIMUM_MOBILE,
  MINIMUM_COMPARAISON,
  basculerSelection,
  comparaisonPossible,
  selectionAjustee,
} from './selection-comparaison';

describe('basculerSelection', () => {
  it('ajoute un Bien qui n’est pas encore sélectionné', () => {
    expect(basculerSelection([1, 2], 3, MAXIMUM_DESKTOP)).toEqual([1, 2, 3]);
  });

  it('retire un Bien déjà sélectionné', () => {
    expect(basculerSelection([1, 2, 3], 2, MAXIMUM_DESKTOP)).toEqual([1, 3]);
  });

  it('ajoute à la fin, ce qui fixe l’ordre des colonnes', () => {
    // Les colonnes paraissent dans l'ordre où l'acheteur les a choisies :
    // c'est le seul ordre qu'il a demandé, et le seul qui ne bouge pas sous
    // ses yeux quand il en ajoute un autre.
    expect(basculerSelection([3, 1], 2, MAXIMUM_DESKTOP)).toEqual([3, 1, 2]);
  });

  it('refuse un Bien de plus quand le maximum est atteint', () => {
    // La sélection ne se vide pas et ne fait pas tourner un Bien dehors :
    // l'acheteur retire lui-même celui dont il ne veut plus. Décider à sa
    // place lui ferait perdre un finaliste sans l'avoir demandé.
    expect(basculerSelection([1, 2], 3, MAXIMUM_MOBILE)).toEqual([1, 2]);
  });

  it('laisse retirer un Bien alors même que le maximum est atteint', () => {
    // Le plafond borne l'ajout, jamais le retrait : sans quoi la sélection
    // pleine serait un cul-de-sac.
    expect(basculerSelection([1, 2], 1, MAXIMUM_MOBILE)).toEqual([2]);
  });
});

describe('selectionAjustee', () => {
  it('laisse la sélection intacte quand elle tient dans le maximum', () => {
    expect(selectionAjustee([1, 2], MAXIMUM_DESKTOP)).toEqual([1, 2]);
  });

  it('coupe les Biens en trop quand le maximum se resserre', () => {
    // C'est ce qui arrive en passant du bureau au téléphone, ou en
    // rétrécissant la fenêtre : trois colonnes ne tiennent plus, et les deux
    // premières choisies restent.
    expect(selectionAjustee([1, 2, 3, 4], MAXIMUM_MOBILE)).toEqual([1, 2]);
  });

  it('garde les premiers choisis plutôt que les derniers', () => {
    // L'ordre de choix est celui des colonnes : couper par la fin laisse
    // celles qui n'ont pas bougé de place.
    expect(selectionAjustee([7, 3, 9], MAXIMUM_MOBILE)).toEqual([7, 3]);
  });

  it('retire les Biens qui ne sont plus dans la liste', () => {
    // Un Bien supprimé, ou qu'un filtre par Statut ne montre plus, ne doit
    // pas rester une colonne fantôme.
    expect(selectionAjustee([1, 2, 3], MAXIMUM_DESKTOP, [1, 3])).toEqual([1, 3]);
  });
});

describe('comparaisonPossible', () => {
  it('demande au moins deux Biens', () => {
    // Un Bien seul ne se compare à rien : la vue n'a pas de sens, et
    // l'écran le dit plutôt que d'afficher une colonne solitaire.
    expect(comparaisonPossible([])).toBe(false);
    expect(comparaisonPossible([1])).toBe(false);
    expect(comparaisonPossible([1, 2])).toBe(true);
  });

  it('tient le minimum à deux', () => {
    expect(MINIMUM_COMPARAISON).toBe(2);
  });
});

describe('les maximums', () => {
  it('limite la comparaison à deux Biens sur mobile', () => {
    // Deux colonnes étroites restent lisibles sur un téléphone, ce qui
    // permet de trancher pendant une visite (#12, ADR-0006).
    expect(MAXIMUM_MOBILE).toBe(2);
  });

  it('en autorise davantage sur desktop', () => {
    // La largeur disponible en autorise plus, sans pour autant en faire un
    // tableau : le face-à-face départage des finalistes.
    expect(MAXIMUM_DESKTOP).toBeGreaterThan(MAXIMUM_MOBILE);
  });
});
