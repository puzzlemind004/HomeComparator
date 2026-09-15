import { describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { of, type Observable } from 'rxjs';
import { ComparaisonPage } from './comparaison-page';
import { BienService, type ListeBiens } from './bien.service';
import { SelectionComparaison } from './selection.service';
import { LargeurEcran } from '../criteres/largeur-ecran';
import { MAXIMUM_DESKTOP } from '../criteres/selection-comparaison';
import { unBien } from './bien.test-helper';
import type { Bien } from './bien';

/**
 * L'écran est construit hors TestBed comme ses voisins : le service des
 * Biens est faux, et la sélection est le vrai service — c'est lui qui porte
 * la règle qu'on éprouve ici, et le doubler reviendrait à réécrire le
 * plafond dans le test.
 */
function creerPage(biens: Bien[] | null = [], maximum = MAXIMUM_DESKTOP) {
  const liste: Observable<ListeBiens> = of(
    biens === null ? { chargee: false } : { chargee: true, biens },
  );

  const injector = Injector.create({
    providers: [
      { provide: LargeurEcran, useValue: { maximumComparaison: () => maximum } },
      SelectionComparaison,
      { provide: BienService, useValue: { lister: () => liste } },
    ],
  });

  return runInInjectionContext(injector, () => ({
    page: new ComparaisonPage(),
    selection: injector.get(SelectionComparaison),
  }));
}

const premier = unBien({ id: 1, libelle: 'le T3 avec la terrasse' });
const second = unBien({ id: 2, libelle: 'celui avec la cuisine refaite' });

describe('ComparaisonPage', () => {
  it('s’ouvre sans sélection et dit ce qu’elle attend', () => {
    // L'écran s'atteint par la navigation, donc sans avoir rien coché
    // (#124). Il doit alors se décrire, plutôt que de paraître cassé.
    const { page } = creerPage([premier, second]);

    expect(page.biensCompares()).toEqual([]);
    expect(page.comparaisonAffichee()).toBe(false);
  });

  it('met les Biens retenus en colonnes, dans l’ordre du choix', () => {
    // C'est l'ordre demandé, et le seul qui ne fasse pas bouger les colonnes
    // déjà posées quand une s'ajoute (#12).
    const { page, selection } = creerPage([premier, second]);

    selection.basculer(2);
    selection.basculer(1);

    expect(page.biensCompares()).toEqual([second, premier]);
    expect(page.comparaisonAffichee()).toBe(true);
  });

  it('n’affiche pas de face-à-face pour un seul Bien', () => {
    // Un Bien seul ne se compare à rien, et sa fiche est déjà là pour le
    // montrer (#12).
    const { page, selection } = creerPage([premier, second]);

    selection.basculer(1);

    expect(page.comparaisonAffichee()).toBe(false);
    expect(page.manquants()).toBe(1);
  });

  it('dit combien de Biens il reste à choisir', () => {
    const { page } = creerPage([premier, second]);

    expect(page.manquants()).toBe(2);
  });

  it('oublie un Bien retenu que la liste ne rend plus', () => {
    // Le Bien a été supprimé depuis la fiche : le retenir en ferait une
    // colonne fantôme dont l'écran n'a plus les valeurs (#93). La liste
    // n'étant ici filtrée par rien, son absence vaut disparition.
    const { page, selection } = creerPage([premier]);

    selection.basculer(1);
    selection.basculer(2);

    expect(selection.selection()).toEqual([1, 2]);

    page.rafraichir();

    expect(selection.selection()).toEqual([1]);
    expect(page.biensCompares()).toEqual([premier]);
  });

  it('ne conclut à aucune disparition tant que la liste n’a pas répondu', () => {
    // Une API muette ne dit pas qu'un Bien a disparu : vider la sélection
    // sur son silence perdrait un face-à-face que le rechargement suivant
    // rendrait intact.
    const { page, selection } = creerPage(null);

    selection.basculer(1);
    selection.basculer(2);
    page.rafraichir();

    expect(selection.selection()).toEqual([1, 2]);
    expect(page.chargee()).toBe(false);
  });

  it('vide la comparaison d’un geste', () => {
    const { page, selection } = creerPage([premier, second]);

    selection.basculer(1);
    selection.basculer(2);
    page.vider();

    expect(page.biensCompares()).toEqual([]);
  });
});
