import { describe, expect, it } from 'vitest';
import { CartesBiens } from './cartes-biens';
import { unBien } from './bien.test-helper';
import type { Bien } from './bien';
import type { ValeursCriteres } from '../criteres/valeurs';
import { COLONNES_DECISIVES } from '../criteres/colonnes';

/**
 * `Intl` insère des espaces insécables autour des unités et des séparateurs
 * de milliers, comme le relève déjà `formatage.spec.ts`. Les comparer tels
 * quels rendrait l'attente illisible et dépendante du caractère exact.
 */
function normaliser(texte: string): string {
  return texte.replace(/[\u00a0\u202f]/g, ' ');
}

/**
 * Le composant est construit sans TestBed, comme les autres écrans : les
 * Biens se posent sur son signal, et les assertions portent sur ce qu'il
 * calcule plutôt que sur le DOM rendu.
 */
function creerCartes(biens: Bien[]) {
  const cartes = new CartesBiens();

  cartes.biens.set(biens);

  return cartes;
}

function bien(libelle: string, criteres: ValeursCriteres = {}): Bien {
  return unBien({ libelle, criteres });
}

/** Un Bien dont les trois Critères décisifs sont renseignés. */
const complet: ValeursCriteres = {
  prixDemande: 250000,
  surfaceHabitable: 72.5,
  villeQuartier: 'Nantes',
};

/** Ce qu'une carte écrit, colonne par colonne. */
function textes(cartes: CartesBiens, rang = 0): string[] {
  return cartes.cartes()[rang].cases.map((donnee) => normaliser(donnee.texte));
}

describe('CartesBiens', () => {
  it('rend une carte par Bien', () => {
    const cartes = creerCartes([bien('anatole'), bien('zébulon')]);

    expect(cartes.cartes()).toHaveLength(2);
  });

  it('classe les Biens par Libellé, comme le tableau à son ouverture', () => {
    // Les deux présentations montrent les mêmes Biens (ADR-0006) : passer du
    // téléphone au bureau ne doit pas rebattre l'ordre de la liste.
    const cartes = creerCartes([bien('zébulon'), bien('anatole')]);

    expect(cartes.cartes().map((carte) => carte.bien.libelle)).toEqual(['anatole', 'zébulon']);
  });

  it('porte le Libellé et le Statut de chaque Bien', () => {
    // Ce sous quoi l'acheteur reconnaît un Bien, et où il en est : c'est ce
    // qu'on vient chercher en parcourant la liste (#7, #11).
    const cartes = creerCartes([unBien({ libelle: 'le T3 avec la terrasse', statut: 'visite' })]);
    const [carte] = cartes.cartes();

    expect(carte.bien.libelle).toBe('le T3 avec la terrasse');
    expect(carte.statut).toBe('visite');
    expect(carte.libelleStatut).toBe('Visité');
  });

  it('porte les Critères les plus décisifs, et eux seuls', () => {
    // Prix, surface, ville : ce qui permet de reconnaître un Bien d'un coup
    // d'œil (#11). Les seize Colonnes du tableau, empilées à la verticale,
    // seraient le tableau qu'ADR-0006 écarte sur mobile.
    const cartes = creerCartes([bien('le T3 avec la terrasse', complet)]);

    expect(cartes.cartes()[0].cases.map((donnee) => donnee.colonne.id)).toEqual(
      COLONNES_DECISIVES.map((colonne) => colonne.id),
    );
  });

  it('écrit ses valeurs comme le tableau les écrit', () => {
    const cartes = creerCartes([bien('le T3 avec la terrasse', complet)]);

    expect(textes(cartes)).toEqual(['250 000 €', '72,5 m²', 'Nantes']);
  });

  it('garde sa place à un Critère non renseigné plutôt que de le retirer', () => {
    // Ce qui manque est ce qu'il reste à demander à l'agence (#6) : une carte
    // qui omettrait ses Critères vides aurait une hauteur variable, et
    // l'absence d'un prix se lirait comme une carte plus courte — c'est-à-dire
    // pas du tout.
    const cartes = creerCartes([bien('le T3 avec la terrasse', { villeQuartier: 'Nantes' })]);
    const [carte] = cartes.cartes();

    expect(carte.cases).toHaveLength(COLONNES_DECISIVES.length);
    expect(carte.cases.map((donnee) => donnee.renseigne)).toEqual([false, false, true]);
  });

  it('reste lisible sur un Bien qu’on vient de repérer', () => {
    // Un Bien créé ne porte que son Libellé (#3, ADR-0008) : la carte doit
    // tenir debout avec trois Critères vides, sans quoi la liste de repérage
    // — le premier écran de l'outil — n'affiche que des cartes cassées.
    const cartes = creerCartes([bien('le T3 avec la terrasse')]);
    const [carte] = cartes.cartes();

    expect(carte.bien.libelle).toBe('le T3 avec la terrasse');
    expect(carte.cases.every((donnee) => !donnee.renseigne)).toBe(true);
    expect(textes(cartes)).toEqual(['', '', '']);
  });

  it('compte les Critères décisifs qui restent à renseigner', () => {
    // Le compte dit d'un mot ce que trois cases vides disent en creux, et
    // c'est ce que le lecteur d'écran annonce : trois tirets ne s'entendent
    // pas (ADR-0005).
    expect(creerCartes([bien('a', complet)]).cartes()[0].manquants).toBe(0);
    expect(creerCartes([bien('a', { villeQuartier: 'Nantes' })]).cartes()[0].manquants).toBe(2);
    expect(creerCartes([bien('a')]).cartes()[0].manquants).toBe(COLONNES_DECISIVES.length);
  });

  it('tient un zéro pour renseigné', () => {
    // Un prix à zéro n'est pas un prix absent : la carte ne doit pas le
    // compter parmi ce qu'il reste à demander (#6).
    const cartes = creerCartes([bien('a', { prixDemande: 0 })]);

    expect(cartes.cartes()[0].cases[0].renseigne).toBe(true);
  });

  it('porte l’URL de l’Annonce quand elle est renseignée', () => {
    // La liste de repérage la proposait (#7), et la carte la remplace : sans
    // ce lien, passer aux cartes retirerait à l'acheteur l'accès d'un clic à
    // la publication du Bien — c'est la régression qu'a relevée #51 sur le
    // tableau.
    const avec = creerCartes([unBien({ urlAnnonce: 'https://exemple.test/annonce' })]);
    const sans = creerCartes([unBien({ urlAnnonce: null })]);

    expect(avec.cartes()[0].bien.urlAnnonce).toBe('https://exemple.test/annonce');
    expect(sans.cartes()[0].bien.urlAnnonce).toBeNull();
  });

  it('ne rend aucune carte sans Bien', () => {
    expect(creerCartes([]).cartes()).toEqual([]);
  });
});
