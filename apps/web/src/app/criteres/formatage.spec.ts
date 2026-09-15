import { describe, expect, it } from 'vitest';
import {
  formaterDate,
  formaterMoment,
  formaterMontant,
  formaterPrixAuMetreCarre,
  formaterSurface,
  formaterValeur,
} from './formatage';
import { critere } from './critere.test-helper';
import type { Critere } from './critere';

/**
 * `Intl` insère des espaces insécables autour des unités et des séparateurs
 * de milliers. Les comparer tels quels rendrait les tests illisibles et
 * dépendants du caractère exact retenu par la plateforme.
 */
function normaliser(texte: string): string {
  return texte.replace(/[\u00a0\u202f]/g, ' ');
}

describe('formaterMontant', () => {
  it('écrit un montant en euros, sans décimale', () => {
    // Le centime n'a pas de sens sur un prix d'annonce, et il allongerait
    // une colonne que le tableau desktop affiche quinze fois.
    expect(normaliser(formaterMontant(250000))).toBe('250 000 €');
  });

  it('arrondit un montant décimal', () => {
    expect(normaliser(formaterMontant(3448.2758))).toBe('3 448 €');
  });

  it("rend une chaîne vide quand le montant n'est pas renseigné", () => {
    expect(formaterMontant(null)).toBe('');
  });
});

describe('formaterPrixAuMetreCarre', () => {
  it("écrit un prix au mètre carré arrondi à l'euro", () => {
    expect(normaliser(formaterPrixAuMetreCarre(3448.2758))).toBe('3 448 €/m²');
  });

  it("rend une chaîne vide quand il n'est pas renseigné", () => {
    expect(formaterPrixAuMetreCarre(null)).toBe('');
  });

  it("s'écrit exactement comme un montant, à l'unité près", () => {
    // Les deux colonnes se lisent côte à côte dans le tableau (#10) : un
    // séparateur de milliers qui différerait les désalignerait. Ils ont
    // différé — une espace fine insécable d'un côté, ordinaire de l'autre —
    // parce que le prix au m² montait son propre `Intl`.
    expect(formaterPrixAuMetreCarre(3448)).toBe(`${formaterMontant(3448)}/m²`);
  });
});

describe('formaterSurface', () => {
  it('écrit une surface avec son unité', () => {
    expect(normaliser(formaterSurface(72.5))).toBe('72,5 m²');
  });

  it('omet la décimale sur une surface ronde', () => {
    expect(normaliser(formaterSurface(88))).toBe('88 m²');
  });

  it("rend une chaîne vide quand la surface n'est pas renseignée", () => {
    expect(formaterSurface(null)).toBe('');
  });
});

describe('formaterDate', () => {
  it('écrit une date au format français', () => {
    expect(formaterDate(new Date(2026, 8, 14))).toBe('14/09/2026');
  });

  it("rend une chaîne vide quand la date n'est pas renseignée", () => {
    expect(formaterDate(null)).toBe('');
  });

  it('rend une chaîne vide sur une date invalide', () => {
    // Une date invalide vient d'une saisie ou d'une conversion ratée ;
    // le texte « Invalid Date » n'a rien à faire dans une colonne.
    expect(formaterDate(new Date('pas une date'))).toBe('');
  });
});

describe('formaterMoment', () => {
  it("écrit la date et l'heure au format français", () => {
    // L'heure n'y figure que pour les Commentaires, et elle y est
    // nécessaire : une visite en produit plusieurs dans le même après-midi,
    // et une date nue les rendrait indistinguables.
    expect(normaliser(formaterMoment(new Date(2026, 8, 14, 15, 30)))).toBe(
      '14/09/2026 15:30',
    );
  });

  it("rend une chaîne vide quand le moment n'est pas renseigné", () => {
    expect(formaterMoment(null)).toBe('');
  });

  it('rend une chaîne vide sur une date invalide', () => {
    expect(formaterMoment(new Date('pas une date'))).toBe('');
  });
});

describe('formaterValeur', () => {
  it('écrit un prix comme un montant', () => {
    expect(normaliser(formaterValeur(critere('prixDemande'), 250000))).toBe('250 000 €');
  });

  it('écrit une surface avec son unité', () => {
    expect(normaliser(formaterValeur(critere('surfaceHabitable'), 72.5))).toBe('72,5 m²');
  });

  it('écrit un entier sans unité tel quel', () => {
    expect(formaterValeur(critere('nombrePieces'), 4)).toBe('4');
  });

  it("accole l'unité d'un entier qui en porte une", () => {
    expect(normaliser(formaterValeur(critere('tempsTrajetTravail'), 25))).toBe('25 min');
  });

  it("écrit l'unité périodique d'un montant annuel", () => {
    // « €/an » n'est pas un symbole monétaire : c'est l'unité déclarée, qui
    // s'accole comme les autres. Le format monétaire l'ignorerait.
    expect(normaliser(formaterValeur(critere('taxeFonciere'), 1200))).toBe('1 200 €/an');
  });

  it("écrit l'unité périodique d'un montant mensuel", () => {
    expect(normaliser(formaterValeur(critere('chargesCopropriete'), 150))).toBe('150 €/mois');
  });

  it('arrondit un Critère entier plutôt que de montrer une décimale', () => {
    // Le prix au m² (#10) se calcule et retombe sur un Critère entier : la
    // précision vient du type déclaré, pas de la valeur reçue.
    expect(normaliser(formaterValeur(critere('prixDemande'), 3448.2758))).toBe('3 448 €');
  });

  it("garde le dixième d'un Critère décimal", () => {
    expect(normaliser(formaterValeur(critere('surfaceHabitable'), 88))).toBe('88 m²');
  });

  it("écrit le libellé d'une valeur d'énumération, pas sa valeur stockée", () => {
    // C'est le libellé qui se lit à l'écran, pas la valeur stockée
    // `pompeAChaleur` : le libellé n'existe que pour cela.
    expect(formaterValeur(critere('typeChauffage'), 'pompeAChaleur')).toBe('Pompe à chaleur');
  });

  it("écrit une valeur d'énumération inconnue telle quelle", () => {
    // Mieux vaut montrer ce qui est en base qu'une chaîne vide qui ferait
    // croire à un Critère non renseigné.
    expect(formaterValeur(critere('dpe'), 'inconnue')).toBe('inconnue');
  });

  it('écrit un texte tel quel', () => {
    expect(formaterValeur(critere('villeQuartier'), 'Nantes')).toBe('Nantes');
  });

  it('écrit un oui/non en français', () => {
    // Aucun des quinze Critères n'est un booléen aujourd'hui, mais la
    // définition sait en accueillir un : le format doit exister avant, sans
    // quoi le premier Critère par oui/non afficherait « true ».
    const ascenseur: Critere = {
      id: 'ascenseur',
      libelle: 'Ascenseur',
      type: 'booleen',
      unite: null,
      groupe: 'confort',
      ordre: 999,
      sensComparaison: 'plusGrandEstMeilleur',
      valeurs: null,
    };

    expect(formaterValeur(ascenseur, true)).toBe('Oui');
    expect(formaterValeur(ascenseur, false)).toBe('Non');
  });

  it('rend une chaîne vide pour un Critère non renseigné', () => {
    expect(formaterValeur(critere('prixDemande'), null)).toBe('');
  });
});
