import { describe, expect, it } from 'vitest';
import { COLONNES, ID_COLONNE_PRIX_METRE_CARRE, colonneParId } from './colonnes';
import { CRITERES_ORDONNES } from './definition';
import { unBien } from '../biens/bien.test-helper';

describe('COLONNES', () => {
  it('porte une colonne par Critère, dans l’ordre de la définition', () => {
    // Le tableau ne liste pas ses colonnes à la main : il les tient de la
    // définition, sans quoi ajouter un Critère demanderait de revenir ici
    // (ADR-0004).
    const critereS = COLONNES.filter((colonne) => colonne.critere !== null);

    expect(critereS.map((colonne) => colonne.id)).toEqual(
      CRITERES_ORDONNES.map((critere) => critere.id),
    );
  });

  it('ajoute le prix au mètre carré comme colonne calculée', () => {
    expect(colonneParId(ID_COLONNE_PRIX_METRE_CARRE)).toBeDefined();
  });

  it('place le prix au mètre carré à la suite du prix demandé', () => {
    // La colonne calculée se lit à côté de ce dont elle sort : la mettre en
    // fin de tableau obligerait à traverser l'écran pour comparer un prix à
    // son prix au m².
    const ids = COLONNES.map((colonne) => colonne.id);

    expect(ids.indexOf(ID_COLONNE_PRIX_METRE_CARRE)).toBe(ids.indexOf('prixDemande') + 1);
  });

  it('ne porte aucune colonne de Statut : ce n’est pas un Critère', () => {
    // Le Statut est visible sur chaque ligne (#10), mais il ne se compare
    // pas d'un Bien à l'autre : le mêler aux Critères le ferait apparaître
    // comme une colonne triable de la définition.
    expect(COLONNES.some((colonne) => colonne.id === 'statut')).toBe(false);
  });
});

describe('valeur d’une colonne de Critère', () => {
  const prix = colonneParId('prixDemande')!;

  it('lit la valeur du Critère sur le Bien', () => {
    expect(prix.valeur(unBien({ criteres: { prixDemande: 250000 } }).criteres)).toBe(250000);
  });

  it('rend une valeur absente quand le Critère n’est pas renseigné', () => {
    expect(prix.valeur(unBien().criteres)).toBeNull();
  });

  it('ramène une chaîne vide à une valeur absente', () => {
    // Un champ effacé produit la chaîne vide, que l'écran doit traiter comme
    // un Critère à renseigner et non comme un texte à trier.
    const ville = colonneParId('villeQuartier')!;

    expect(ville.valeur(unBien({ criteres: { villeQuartier: '' } }).criteres)).toBeNull();
  });
});

describe('valeur de la colonne calculée', () => {
  const prixMetreCarre = colonneParId(ID_COLONNE_PRIX_METRE_CARRE)!;

  it('divise le prix demandé par la surface habitable', () => {
    const bien = unBien({ criteres: { prixDemande: 250000, surfaceHabitable: 72.5 } });

    expect(prixMetreCarre.valeur(bien.criteres)).toBeCloseTo(3448.2758, 3);
  });

  it('reste vide quand le prix manque', () => {
    expect(prixMetreCarre.valeur(unBien({ criteres: { surfaceHabitable: 72.5 } }).criteres)).toBeNull();
  });

  it('reste vide quand la surface manque', () => {
    expect(prixMetreCarre.valeur(unBien({ criteres: { prixDemande: 250000 } }).criteres)).toBeNull();
  });

  it('reste vide quand la surface est une saisie erronée', () => {
    const bien = unBien({ criteres: { prixDemande: 250000, surfaceHabitable: 0 } });

    expect(prixMetreCarre.valeur(bien.criteres)).toBeNull();
  });
});

describe('texte d’une colonne', () => {
  it('écrit la valeur d’un Critère selon son type et son unité', () => {
    const surface = colonneParId('surfaceHabitable')!;

    expect(surface.texte(unBien({ criteres: { surfaceHabitable: 72.5 } }).criteres)).toBe('72,5 m²');
  });

  it('écrit le libellé d’une énumération, pas la valeur stockée', () => {
    const dpe = colonneParId('dpe')!;

    expect(dpe.texte(unBien({ criteres: { travauxAPrevoir: 'lourds', dpe: 'C' } }).criteres)).toBe('C');

    const travaux = colonneParId('travauxAPrevoir')!;

    expect(travaux.texte(unBien({ criteres: { travauxAPrevoir: 'lourds' } }).criteres)).toBe('Lourds');
  });

  it('écrit le prix au mètre carré arrondi à l’euro', () => {
    const prixMetreCarre = colonneParId(ID_COLONNE_PRIX_METRE_CARRE)!;
    const bien = unBien({ criteres: { prixDemande: 250000, surfaceHabitable: 72.5 } });

    // 3448,27… €/m² : le centime au mètre carré n'apprend rien et allonge
    // une colonne répétée à chaque ligne.
    expect(prixMetreCarre.texte(bien.criteres)).toBe('3 448 €/m²');
  });

  it('rend la chaîne vide sur un Critère non renseigné', () => {
    // C'est à l'écran de marquer l'absence, pas au texte : le tableau doit
    // pouvoir la distinguer d'un zéro autrement que par ce qui est écrit.
    expect(colonneParId('prixDemande')!.texte(unBien().criteres)).toBe('');
  });
});
