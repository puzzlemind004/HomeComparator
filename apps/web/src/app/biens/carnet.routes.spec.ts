import { describe, expect, it } from 'vitest';
import { routes } from '../app.routes';
import { ROUTE_BIENS, ROUTE_COMPARAISON, ROUTE_EXPORT, routeFicheBien } from './carnet.routes';

/**
 * Les adresses des écrans sont composées à un seul endroit (#124), et ces
 * tests sont ce qui les tient d'accord avec la table du routeur.
 *
 * Le défaut qu'ils attrapent est silencieux : une entrée de navigation qui
 * pointe vers `/comparaison` quand la route est `/comparer` compile, s'affiche,
 * et ne mène nulle part — le routeur rabat sur le carnet par la route
 * fourre-tout, et l'acheteur clique « Comparer » pour retomber sur sa liste
 * sans que rien ne signale l'erreur.
 */
describe('les routes du carnet', () => {
  it('compose les adresses des écrans', () => {
    expect(ROUTE_BIENS).toBe('/');
    expect(ROUTE_COMPARAISON).toBe('/comparer');
    expect(ROUTE_EXPORT).toBe('/exporter');
    expect(routeFicheBien(3)).toBe('/biens/3');
  });

  it('déclare une route pour chaque adresse citée par la navigation', () => {
    const chemins = routes.map((route) => route.path);

    for (const adresse of [ROUTE_BIENS, ROUTE_COMPARAISON, ROUTE_EXPORT]) {
      expect(chemins).toContain(adresse.slice(1));
    }
  });

  it('garde la fiche d’un Bien sous le carnet', () => {
    // La fiche est un écran du carnet et non un quatrième onglet : c'est ce
    // qui fait que « Carnet » reste allumé pendant qu'on la consulte, la
    // correspondance des trois autres entrées se faisant par préfixe.
    expect(routeFicheBien(3).startsWith('/biens/')).toBe(true);
    expect(routes.map((route) => route.path)).toContain('biens/:id');
  });

  it('protège les trois écrans du carnet par le garde de session', () => {
    // Un écran ajouté sans garde s'ouvrirait déconnecté et se remplirait de
    // 401 (#4). La comparaison et l'export sont arrivés après le garde : rien
    // d'autre que ce test ne dirait qu'on l'a oublié sur l'un des deux.
    const gardes = routes
      .filter((route) => route.path !== 'connexion' && route.path !== '**')
      .map((route) => route.canActivate?.length ?? 0);

    expect(gardes.length).toBeGreaterThan(0);
    expect(gardes.every((compte) => compte === 1)).toBe(true);
  });
});
