import { describe, expect, it } from 'vitest';
import {
  MAXIMUM_DESKTOP,
  MAXIMUM_MOBILE,
  MINIMUM_COMPARAISON,
  basculerSelection,
  comparaisonPossible,
  instructionPlafond,
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

  it('retire les Biens qui ont cessé d’exister', () => {
    // Un Bien supprimé ne reviendra dans aucune liste : le retenir en ferait
    // une colonne fantôme, dont l'écran n'a plus les valeurs.
    expect(selectionAjustee([1, 2, 3], MAXIMUM_DESKTOP, [2])).toEqual([1, 3]);
  });

  it('garde un Bien absent de la liste tant qu’il n’est pas retiré', () => {
    // C'est toute la distinction : un filtre par Statut ne dit rien de plus
    // que « pas ici, pas maintenant ». Le Bien existe, il est comparable, et
    // il garde sa place — la fonction ne l'apprend que de `retires`, jamais
    // de son absence d'une liste.
    expect(selectionAjustee([1, 2, 3], MAXIMUM_DESKTOP, [])).toEqual([1, 2, 3]);
  });

  it('compte les Biens retenus mais masqués dans le plafond', () => {
    // Un Bien retenu occupe une place, qu'il soit visible ou non : sans
    // quoi jouer sur les filtres ferait dépasser le maximum.
    expect(selectionAjustee([1, 2, 3], MAXIMUM_MOBILE, [])).toEqual([1, 2]);
  });

  it('laisse un Bien retiré libérer sa place avant le plafond', () => {
    // Le tri des Biens disparus se fait avant la coupe : un Bien retiré
    // rend une place plutôt que d'en laisser une vide.
    expect(selectionAjustee([1, 2, 3], MAXIMUM_MOBILE, [1])).toEqual([2, 3]);
  });
});

describe('instructionPlafond', () => {
  it('ne dit rien tant que le plafond n’est pas atteint', () => {
    // Il reste de la place : l'écran n'a aucun geste à demander.
    expect(instructionPlafond(1, 0, MAXIMUM_MOBILE)).toBe('aucune');
  });

  it('demande d’en retirer un quand ils sont tous montrés', () => {
    expect(instructionPlafond(2, 0, MAXIMUM_MOBILE)).toBe('retirer');
  });

  it('dit que le choix est plus étroit quand une partie est masquée', () => {
    // « Retirez-en un » reste faisable, mais sur les seuls Biens dont une
    // case est affichée — moins que ce que l'acheteur croit avoir sous la
    // main (#111).
    expect(instructionPlafond(2, 1, MAXIMUM_MOBILE)).toBe('retirer-parmi-montres');
  });

  it('nomme d’autres gestes quand aucun retenu n’est montré', () => {
    // Le retrait se fait en décochant une case, et il n'y en a aucune à
    // décocher : demander d'en retirer un désignerait un geste impossible.
    // Restent l'ouverture du filtre et le vidage de la comparaison (#111).
    expect(instructionPlafond(2, 2, MAXIMUM_MOBILE)).toBe('ouvrir-ou-vider');
  });

  it('tient le plafond pour atteint au-delà du maximum', () => {
    // La sélection peut dépasser le temps qu'un rétrécissement la replie :
    // le plafond est atteint, et l'écran le dit déjà.
    expect(instructionPlafond(3, 0, MAXIMUM_MOBILE)).toBe('retirer');
  });

  it('ne demande rien sur une sélection vide', () => {
    // Un maximum nul n'existe pas dans l'écran, mais la règle ne doit pas
    // pour autant demander de retirer ce qui n'est pas là.
    expect(instructionPlafond(0, 0, 0)).toBe('aucune');
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
