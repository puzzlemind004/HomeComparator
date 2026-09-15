import { describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { Navigation } from './navigation';
import { SelectionComparaison } from './selection.service';
import { LargeurEcran } from '../criteres/largeur-ecran';
import { MAXIMUM_DESKTOP } from '../criteres/selection-comparaison';
import { ROUTE_BIENS, ROUTE_COMPARAISON, ROUTE_EXPORT } from './carnet.routes';

function creerNavigation(maximum = MAXIMUM_DESKTOP) {
  const injector = Injector.create({
    providers: [
      { provide: LargeurEcran, useValue: { maximumComparaison: () => maximum } },
      SelectionComparaison,
    ],
  });

  return runInInjectionContext(injector, () => ({
    navigation: new Navigation(),
    selection: injector.get(SelectionComparaison),
  }));
}

describe('Navigation', () => {
  it('mène aux trois écrans du carnet', () => {
    // Les adresses viennent de `carnet.routes` et ne sont pas réécrites ici :
    // une entrée de menu qui les orthographierait autrement serait un lien
    // qui marche sous un onglet qui ne s'allume jamais (#124).
    const { navigation } = creerNavigation();

    expect(navigation.entrees.map((entree) => entree.route)).toEqual([
      ROUTE_BIENS,
      ROUTE_COMPARAISON,
      ROUTE_EXPORT,
    ]);
  });

  it('ne compte rien tant que rien n’est retenu', () => {
    // Le « (0) » de la maquette ne s'écrit pas : un compteur à zéro se lit
    // comme un réglage, là où l'absence se lit comme une absence.
    const { navigation } = creerNavigation();

    expect(navigation.compte()).toBe(0);
  });

  it('suit la sélection en cours', () => {
    // C'est le « (2) » de la maquette : le nombre de Biens retenus se lit en
    // permanence, depuis n'importe quel écran (#124).
    const { navigation, selection } = creerNavigation();

    selection.basculer(1);
    expect(navigation.compte()).toBe(1);

    selection.basculer(2);
    expect(navigation.compte()).toBe(2);

    selection.basculer(1);
    expect(navigation.compte()).toBe(1);
  });

  it('ne marque l’accueil courant que sur l’accueil', () => {
    // `routerLinkActive` marquerait « Carnet » courant sur tous les écrans,
    // « / » étant le préfixe de tous : l'accueil demande une correspondance
    // exacte, ses voisins non — la fiche d'un Bien est encore le carnet.
    const { navigation } = creerNavigation();
    const parRoute = new Map(navigation.entrees.map((entree) => [entree.route, entree]));

    expect(parRoute.get(ROUTE_BIENS)?.exact).toBe(true);
    expect(parRoute.get(ROUTE_COMPARAISON)?.exact).toBe(false);
    expect(parRoute.get(ROUTE_EXPORT)?.exact).toBe(false);
  });
});
