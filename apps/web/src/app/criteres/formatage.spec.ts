import { describe, expect, it } from 'vitest';
import { formaterDate, formaterMontant, formaterSurface, formaterValeur } from './formatage';
import { critereParId } from './definition';
import type { Critere } from './critere';

/**
 * `Intl` insère des espaces insécables autour des unités et des séparateurs
 * de milliers. Les comparer tels quels rendrait les tests illisibles et
 * dépendants du caractère exact retenu par la plateforme.
 */
function normaliser(texte: string): string {
  return texte.replace(/[\u00a0\u202f]/g, ' ');
}

function critere(id: string): Critere {
  const trouve = critereParId(id);

  if (!trouve) {
    throw new Error(`Critère inconnu dans la définition : ${id}`);
  }

  return trouve;
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

  it('rend une chaîne vide pour un Critère non renseigné', () => {
    expect(formaterValeur(critere('prixDemande'), null)).toBe('');
  });
});
