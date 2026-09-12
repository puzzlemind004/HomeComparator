import { afterEach, describe, expect, it } from 'vitest';
import { LargeurEcran, REQUETE_ECRAN_LARGE, SEUIL_ECRAN_LARGE } from './largeur-ecran';
import { MAXIMUM_DESKTOP, MAXIMUM_MOBILE } from './selection-comparaison';

/** Ce que `matchMedia` rend, réduit à ce que le service en lit. */
type Ecouteur = (evenement: { matches: boolean }) => void;

/**
 * Un `matchMedia` de test, qui retient la requête demandée et permet de
 * faire changer la fenêtre de taille en cours de route.
 */
function poserMatchMedia(matches: boolean) {
  const ecouteurs: Ecouteur[] = [];
  const requetes: string[] = [];

  const originel = window.matchMedia;

  window.matchMedia = ((requete: string) => {
    requetes.push(requete);

    return {
      matches,
      addEventListener: (_type: string, ecouteur: Ecouteur) => ecouteurs.push(ecouteur),
    };
  }) as unknown as typeof window.matchMedia;

  return {
    requetes,
    /** La fenêtre franchit le seuil, dans un sens ou dans l'autre. */
    redimensionner: (large: boolean) =>
      ecouteurs.forEach((ecouteur) => ecouteur({ matches: large })),
    restaurer: () => {
      window.matchMedia = originel;
    },
  };
}

let pose: ReturnType<typeof poserMatchMedia> | null = null;

afterEach(() => {
  pose?.restaurer();
  pose = null;
});

describe('LargeurEcran', () => {
  it('lit la largeur à la construction', () => {
    pose = poserMatchMedia(true);

    expect(new LargeurEcran().ecranLarge()).toBe(true);
  });

  it('interroge le seuil de la feuille de style', () => {
    // Le même seuil que celui qui fait basculer le tableau et les cartes
    // (ADR-0006) : deux seuils qui divergeraient feraient afficher les
    // cartes pendant que la sélection autorise encore quatre colonnes.
    pose = poserMatchMedia(false);
    new LargeurEcran();

    expect(pose.requetes).toEqual([REQUETE_ECRAN_LARGE]);
    expect(REQUETE_ECRAN_LARGE).toBe(`(min-width: ${SEUIL_ECRAN_LARGE}px)`);
    expect(SEUIL_ECRAN_LARGE).toBe(64 * 16);
  });

  it('suit la fenêtre redimensionnée, sans rien recharger', () => {
    // Une fenêtre qu'on rétrécit change de présentation en cours de route,
    // et doit changer de plafond de la même façon (ADR-0006).
    pose = poserMatchMedia(true);
    const largeur = new LargeurEcran();

    pose.redimensionner(false);

    expect(largeur.ecranLarge()).toBe(false);

    pose.redimensionner(true);

    expect(largeur.ecranLarge()).toBe(true);
  });

  it('autorise davantage de Biens sur un écran large', () => {
    pose = poserMatchMedia(true);

    expect(new LargeurEcran().maximumComparaison()).toBe(MAXIMUM_DESKTOP);
  });

  it('limite la comparaison à deux Biens sur un écran étroit', () => {
    // Deux colonnes étroites restent lisibles sur un téléphone, ce qui
    // permet de trancher pendant une visite (#12).
    pose = poserMatchMedia(false);

    expect(new LargeurEcran().maximumComparaison()).toBe(MAXIMUM_MOBILE);
  });

  it('se rabat sur l’écran étroit quand matchMedia manque', () => {
    // Rendu serveur, ou environnement de test sans DOM : l'écran étroit est
    // la réponse qui borne le plus, et ne promet pas une place qui n'existe
    // peut-être pas.
    const originel = window.matchMedia;

    // @ts-expect-error on retire délibérément l'API pour éprouver le repli.
    delete window.matchMedia;

    try {
      const largeur = new LargeurEcran();

      expect(largeur.ecranLarge()).toBe(false);
      expect(largeur.maximumComparaison()).toBe(MAXIMUM_MOBILE);
    } finally {
      window.matchMedia = originel;
    }
  });
});
