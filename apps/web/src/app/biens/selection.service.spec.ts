import { describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext, signal, type Signal } from '@angular/core';
import { SelectionComparaison } from './selection.service';
import { LargeurEcran } from '../criteres/largeur-ecran';
import { MAXIMUM_DESKTOP, MAXIMUM_MOBILE } from '../criteres/selection-comparaison';

/**
 * Le service est construit comme les écrans du projet : hors TestBed, avec
 * un faux `LargeurEcran` — c'est la largeur qui fixe le plafond (ADR-0006),
 * et les tests qui la font varier en cours de route passent un signal.
 */
function creerSelection(maximum: number | Signal<number> = MAXIMUM_DESKTOP) {
  const maximumComparaison = typeof maximum === 'number' ? () => maximum : maximum;

  const injector = Injector.create({
    providers: [{ provide: LargeurEcran, useValue: { maximumComparaison } }],
  });

  return runInInjectionContext(injector, () => new SelectionComparaison());
}

describe('SelectionComparaison', () => {
  it('ne retient rien à l’ouverture du carnet', () => {
    // La sélection ne se retient pas d'une visite à l'autre : le carnet ne
    // persiste aucune préférence, et rouvrir sur un face-à-face qu'on ne se
    // rappelle pas avoir demandé ferait chercher ce qui l'a composé.
    expect(creerSelection().selection()).toEqual([]);
  });

  it('retient les Biens dans l’ordre où ils ont été choisis', () => {
    // C'est cet ordre qui fixe celui des colonnes du face-à-face (#12).
    const selection = creerSelection();

    selection.basculer(3);
    selection.basculer(1);

    expect(selection.selection()).toEqual([3, 1]);
  });

  it('retire un Bien déjà retenu', () => {
    const selection = creerSelection();

    selection.basculer(3);
    selection.basculer(3);

    expect(selection.selection()).toEqual([]);
  });

  it('refuse d’ajouter au-delà du plafond de l’écran', () => {
    // Au plafond, l'ajout ne fait pas sortir le plus ancien : cela ferait
    // perdre un finaliste sans l'avoir demandé (#12).
    const selection = creerSelection(MAXIMUM_MOBILE);

    selection.basculer(1);
    selection.basculer(2);
    selection.basculer(3);

    expect(selection.selection()).toEqual([1, 2]);
    expect(selection.pleine()).toBe(true);
  });

  it('replie la sélection quand la fenêtre passe sous le seuil', () => {
    // Trois colonnes choisies au bureau ne tiennent pas sur un téléphone :
    // les premières choisies restent, couper par la fin laissant en place
    // celles qui n'ont pas bougé (ADR-0006).
    const maximum = signal(MAXIMUM_DESKTOP);
    const selection = creerSelection(maximum);

    selection.basculer(1);
    selection.basculer(2);
    selection.basculer(3);
    maximum.set(MAXIMUM_MOBILE);

    expect(selection.selection()).toEqual([1, 2]);
  });

  it('oublie un Bien supprimé', () => {
    // La disparition se déclare : une absence de la liste ne distinguerait
    // pas une suppression d'un filtrage (#93).
    const selection = creerSelection();

    selection.basculer(1);
    selection.basculer(2);
    selection.oublier(1);

    expect(selection.selection()).toEqual([2]);
  });

  it('se vide d’un geste', () => {
    const selection = creerSelection();

    selection.basculer(1);
    selection.basculer(2);
    selection.vider();

    expect(selection.selection()).toEqual([]);
  });

  it('compte les Biens retenus', () => {
    // C'est ce compte que la navigation affiche en permanence (#124) : il
    // se lit hors de l'écran du carnet, d'où ce service.
    const selection = creerSelection();

    expect(selection.compte()).toBe(0);

    selection.basculer(1);

    expect(selection.compte()).toBe(1);
  });

  it('dit s’il y a de quoi comparer', () => {
    const selection = creerSelection();

    selection.basculer(1);
    expect(selection.comparable()).toBe(false);

    selection.basculer(2);
    expect(selection.comparable()).toBe(true);
  });
});
