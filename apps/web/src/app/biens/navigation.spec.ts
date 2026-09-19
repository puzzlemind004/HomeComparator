import { describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { Navigation, bienDeLAdresse } from './navigation';
import { SelectionComparaison } from './selection.service';
import { LargeurEcran } from '../criteres/largeur-ecran';
import { MAXIMUM_DESKTOP } from '../criteres/selection-comparaison';
import {
  ROUTE_BIENS,
  ROUTE_REPERER,
  ROUTE_COMPARAISON,
  ROUTE_EXPORT,
  ROUTE_TABLEAU_DE_BORD,
  routeCommenterBien,
} from './carnet.routes';

/**
 * Un routeur réduit à ce dont la navigation se sert : l'adresse de départ et
 * le flux des changements d'écran. Monter le vrai routeur demanderait des
 * routes, un emplacement et un environnement Angular complet, là où ces deux
 * choses suffisent — et laisserait les tests décrire Angular plutôt que le
 * menu.
 */
function creerNavigation(maximum = MAXIMUM_DESKTOP, adresse = ROUTE_BIENS) {
  const evenements = new Subject<NavigationEnd>();

  const injector = Injector.create({
    providers: [
      { provide: LargeurEcran, useValue: { maximumComparaison: () => maximum } },
      { provide: Router, useValue: { url: adresse, events: evenements.asObservable() } },
      SelectionComparaison,
    ],
  });

  return runInInjectionContext(injector, () => ({
    navigation: new Navigation(),
    selection: injector.get(SelectionComparaison),
    /** Ce qu'un changement d'écran produit, tel que le routeur l'annonce. */
    aller: (vers: string) => evenements.next(new NavigationEnd(1, vers, vers)),
  }));
}

describe('Navigation', () => {
  it('mène aux quatre écrans du carnet', () => {
    // Les adresses viennent de `carnet.routes` et ne sont pas réécrites ici :
    // une entrée de menu qui les orthographierait autrement serait un lien
    // qui marche sous un onglet qui ne s'allume jamais (#124).
    const { navigation } = creerNavigation();

    expect(navigation.entrees.map((entree) => entree.route)).toEqual([
      ROUTE_BIENS,
      ROUTE_COMPARAISON,
      ROUTE_TABLEAU_DE_BORD,
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

  it('propose de repérer un Bien partout sauf sur une fiche', () => {
    // L'action permanente de la maquette : depuis n'importe quel écran, elle
    // mène au repérage (#124). Celui-ci a son écran depuis la refonte — la
    // maquette sépare la création de la liste —, là où elle menait au
    // formulaire posé en tête du carnet.
    const { navigation, aller } = creerNavigation();

    expect(navigation.action().route).toBe(ROUTE_REPERER);
    expect(navigation.action().libelle).toBe('Repérer');

    aller(ROUTE_COMPARAISON);
    expect(navigation.action().route).toBe(ROUTE_REPERER);
  });

  it('propose de commenter dès qu’on regarde une fiche', () => {
    // C'est le geste de la visite, et il prend la place de « Repérer » —
    // lequel menait alors à un formulaire déjà atteignable par l'onglet
    // « Carnet » juste à côté.
    const { navigation, aller } = creerNavigation();

    aller('/biens/12');

    expect(navigation.action().libelle).toBe('Commenter');
    expect(navigation.action().route).toBe(routeCommenterBien(12));
  });

  it('reconnaît la fiche ouverte directement par son lien', () => {
    // La navigation est montée une fois pour la session : sans l'adresse de
    // départ, l'action resterait « Repérer » sur un carnet rouvert sur le
    // Bien qu'on visite.
    const { navigation } = creerNavigation(MAXIMUM_DESKTOP, '/biens/7');

    expect(navigation.action().route).toBe(routeCommenterBien(7));
  });

  it('cesse de proposer de commenter en quittant la fiche', () => {
    const { navigation, aller } = creerNavigation(MAXIMUM_DESKTOP, '/biens/7');

    aller(ROUTE_EXPORT);

    expect(navigation.action().libelle).toBe('Repérer');
  });

  describe('le Bien de l’adresse', () => {
    it('ne reconnaît que la fiche elle-même', () => {
      // L'écran de saisie est sous la fiche dans l'adresse, et proposer
      // « Commenter » pendant qu'on commente ne mènerait nulle part.
      expect(bienDeLAdresse('/biens/3')).toBe(3);
      expect(bienDeLAdresse('/biens/3/commenter')).toBeNull();
      expect(bienDeLAdresse(ROUTE_BIENS)).toBeNull();
      expect(bienDeLAdresse(ROUTE_COMPARAISON)).toBeNull();
    });

    it('ignore ce que l’adresse porte après le chemin', () => {
      // Un fragment et les paramètres d'un tri ne changent pas l'écran qu'on
      // regarde.
      expect(bienDeLAdresse('/biens/3#photos')).toBe(3);
      expect(bienDeLAdresse('/biens/3?onglet=criteres')).toBe(3);
    });
  });
});
