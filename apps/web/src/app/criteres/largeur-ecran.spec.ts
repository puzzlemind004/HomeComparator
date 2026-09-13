import { describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import {
  LargeurEcran,
  MATCH_MEDIA,
  REQUETE_ECRAN_LARGE,
  SEUIL_ECRAN_LARGE,
  type MatchMedia,
} from './largeur-ecran';
import { MAXIMUM_DESKTOP, MAXIMUM_MOBILE } from './selection-comparaison';

/**
 * Le service est construit sans TestBed : un Injector nu suffit à fournir le
 * seul `matchMedia` dont il dépend, comme `auth.service.spec.ts` fournit son
 * `HttpClient`.
 */
function creerService(matchMedia: MatchMedia | null) {
  const injector = Injector.create({
    providers: [{ provide: MATCH_MEDIA, useValue: matchMedia }],
  });

  return runInInjectionContext(injector, () => new LargeurEcran());
}

/** Ce que le service lit d'une requête média, écrit à la main. */
type Ecouteur = (evenement: { matches: boolean }) => void;

/**
 * Un `matchMedia` de test : il retient la requête demandée et permet de faire
 * changer la fenêtre de taille en cours de route.
 *
 * Fourni par le jeton plutôt que posé sur `window` : le service se construit
 * ainsi sans DOM, comme les autres modules de `criteres/`, et le test n'a ni
 * global à écrire ni nettoyage à faire après lui.
 */
function faireMatchMedia(large: boolean) {
  const ecouteurs: Ecouteur[] = [];
  const requetes: string[] = [];

  const matchMedia: MatchMedia = (requete) => {
    requetes.push(requete);

    return {
      matches: large,
      addEventListener: (_type, ecouteur) => ecouteurs.push(ecouteur),
    };
  };

  return {
    matchMedia,
    requetes,
    /** La fenêtre franchit le seuil, dans un sens ou dans l'autre. */
    redimensionner: (desormaisLarge: boolean) =>
      ecouteurs.forEach((ecouteur) => ecouteur({ matches: desormaisLarge })),
  };
}

describe('LargeurEcran', () => {
  it('lit la largeur à la construction', () => {
    const { matchMedia } = faireMatchMedia(true);

    expect(creerService(matchMedia).ecranLarge()).toBe(true);
  });

  it('interroge le seuil de la feuille de style', () => {
    // Le même seuil que celui qui fait basculer le tableau et les cartes
    // (ADR-0006) : deux seuils qui divergeraient feraient afficher les
    // cartes pendant que la sélection autorise encore quatre colonnes.
    const { matchMedia, requetes } = faireMatchMedia(false);

    creerService(matchMedia);

    expect(requetes).toEqual([REQUETE_ECRAN_LARGE]);
    expect(REQUETE_ECRAN_LARGE).toBe(`(min-width: ${SEUIL_ECRAN_LARGE}px)`);
    expect(SEUIL_ECRAN_LARGE).toBe(64 * 16);
  });

  it('suit la fenêtre redimensionnée, sans rien recharger', () => {
    // Une fenêtre qu'on rétrécit change de présentation en cours de route,
    // et doit changer de plafond de la même façon (ADR-0006).
    const { matchMedia, redimensionner } = faireMatchMedia(true);
    const largeur = creerService(matchMedia);

    redimensionner(false);
    expect(largeur.ecranLarge()).toBe(false);

    redimensionner(true);
    expect(largeur.ecranLarge()).toBe(true);
  });

  it('autorise davantage de Biens sur un écran large', () => {
    const { matchMedia } = faireMatchMedia(true);

    expect(creerService(matchMedia).maximumComparaison()).toBe(MAXIMUM_DESKTOP);
  });

  it('limite la comparaison à deux Biens sur un écran étroit', () => {
    // Deux colonnes étroites restent lisibles sur un téléphone, ce qui
    // permet de trancher pendant une visite (#12).
    const { matchMedia } = faireMatchMedia(false);

    expect(creerService(matchMedia).maximumComparaison()).toBe(MAXIMUM_MOBILE);
  });

  it('suit le plafond quand la fenêtre franchit le seuil', () => {
    const { matchMedia, redimensionner } = faireMatchMedia(true);
    const largeur = creerService(matchMedia);

    expect(largeur.maximumComparaison()).toBe(MAXIMUM_DESKTOP);

    redimensionner(false);

    expect(largeur.maximumComparaison()).toBe(MAXIMUM_MOBILE);
  });

  it('se rabat sur l’écran étroit quand matchMedia manque', () => {
    // Rendu serveur, ou environnement sans DOM : l'écran étroit est la
    // réponse qui borne le plus, et ne promet pas une place qui n'existe
    // peut-être pas.
    const largeur = creerService(null);

    expect(largeur.ecranLarge()).toBe(false);
    expect(largeur.maximumComparaison()).toBe(MAXIMUM_MOBILE);
  });
});
