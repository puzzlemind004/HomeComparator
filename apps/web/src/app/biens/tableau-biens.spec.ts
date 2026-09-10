import { describe, expect, it } from 'vitest';
import { TableauBiens } from './tableau-biens';
import { unBien } from './bien.test-helper';
import type { Bien } from './bien';
import type { ValeursCriteres } from '../criteres/valeurs';
import { ID_COLONNE_PRIX_METRE_CARRE } from '../criteres/colonnes';
import { CRITERES_ORDONNES } from '../criteres/definition';

/**
 * Le composant est construit sans TestBed, comme les autres écrans : les
 * Biens se posent sur son signal, et les assertions portent sur ce qu'il
 * calcule plutôt que sur le DOM rendu.
 */
function creerTableau(biens: Bien[]) {
  const tableau = new TableauBiens();

  tableau.biens.set(biens);

  return tableau;
}

function bien(libelle: string, criteres: ValeursCriteres = {}): Bien {
  return unBien({ libelle, criteres });
}

/** Les Libellés des lignes, dans l'ordre où le tableau les rend. */
function libelles(tableau: TableauBiens): string[] {
  return tableau.lignes().map((ligne) => ligne.bien.libelle);
}

describe('TableauBiens', () => {
  it('affiche une colonne par Critère, plus le prix au mètre carré', () => {
    const tableau = creerTableau([]);

    expect(tableau.colonnes.length).toBe(CRITERES_ORDONNES.length + 1);
  });

  it('affiche une ligne par Bien', () => {
    const tableau = creerTableau([bien('anatole'), bien('zébulon')]);

    expect(tableau.lignes().length).toBe(2);
  });

  it("classe les Biens par Libellé tant qu'aucune colonne n'est triée", () => {
    const tableau = creerTableau([bien('zébulon'), bien('anatole')]);

    expect(tableau.tri().colonne).toBeNull();
    expect(libelles(tableau)).toEqual(['anatole', 'zébulon']);
  });

  it("trie sur la colonne cliquée, en croissant d'abord", () => {
    const tableau = creerTableau([
      bien('cher', { prixDemande: 310000 }),
      bien('abordable', { prixDemande: 190000 }),
    ]);

    tableau.basculerTri('prixDemande');

    expect(tableau.tri()).toEqual({ colonne: 'prixDemande', sens: 'croissant' });
    expect(libelles(tableau)).toEqual(['abordable', 'cher']);
  });

  it('renverse le tri au second clic sur la même colonne', () => {
    const tableau = creerTableau([
      bien('cher', { prixDemande: 310000 }),
      bien('abordable', { prixDemande: 190000 }),
    ]);

    tableau.basculerTri('prixDemande');
    tableau.basculerTri('prixDemande');

    expect(libelles(tableau)).toEqual(['cher', 'abordable']);
  });

  it('garde les Biens non renseignés en fin de tableau dans les deux sens', () => {
    // La règle qui fait tout l'intérêt du tri : un Critère absent n'est pas
    // zéro, et ne prend jamais la tête du tableau (#10).
    const tableau = creerTableau([
      bien('sans prix'),
      bien('cher', { prixDemande: 310000 }),
      bien('abordable', { prixDemande: 190000 }),
    ]);

    tableau.basculerTri('prixDemande');
    expect(libelles(tableau).at(-1)).toBe('sans prix');

    tableau.basculerTri('prixDemande');
    expect(libelles(tableau).at(-1)).toBe('sans prix');
  });

  it('marque les cases non renseignées', () => {
    // Elles se distinguent visuellement d'une valeur saisie : c'est ce qui
    // reste à demander à l'agence (#6), et une case vide ne doit pas se
    // confondre avec un zéro.
    const tableau = creerTableau([bien('à compléter', { capaciteStationnement: 0 })]);
    const cases = tableau.lignes()[0].cases;

    const stationnement = cases.find((c) => c.colonne.id === 'capaciteStationnement')!;
    const prix = cases.find((c) => c.colonne.id === 'prixDemande')!;

    expect(stationnement.renseigne).toBe(true);
    expect(prix.renseigne).toBe(false);
  });

  it('laisse le prix au mètre carré vide quand le prix ou la surface manque', () => {
    const tableau = creerTableau([bien('sans surface', { prixDemande: 250000 })]);
    const calculee = tableau
      .lignes()[0]
      .cases.find((c) => c.colonne.id === ID_COLONNE_PRIX_METRE_CARRE)!;

    expect(calculee.texte).toBe('');
    expect(calculee.renseigne).toBe(false);
  });

  it('calcule le prix au mètre carré quand les deux sont là', () => {
    const tableau = creerTableau([
      bien('complet', { prixDemande: 250000, surfaceHabitable: 100 }),
    ]);
    const calculee = tableau
      .lignes()[0]
      .cases.find((c) => c.colonne.id === ID_COLONNE_PRIX_METRE_CARRE)!;

    expect(calculee.texte).toBe('2 500 €/m²');
    expect(calculee.renseigne).toBe(true);
  });

  it('porte le Statut de chaque ligne', () => {
    // Il est visible sur chaque ligne sans être une colonne triable : ce
    // n'est pas un Critère (#10).
    const tableau = creerTableau([unBien({ libelle: 'visité', statut: 'visite' })]);

    expect(tableau.lignes()[0].statut).toBe('visite');
    expect(tableau.lignes()[0].libelleStatut).toBe('Visité');
  });

  it('dit le sens du tri courant pour une seule colonne', () => {
    // C'est ce dont l'en-tête tire son `aria-sort` : une seule colonne est
    // triée à la fois, et les autres ne doivent rien annoncer.
    const tableau = creerTableau([]);

    tableau.basculerTri('prixDemande');

    expect(tableau.sensTriDe('prixDemande')).toBe('ascending');
    expect(tableau.sensTriDe('surfaceHabitable')).toBe('none');

    tableau.basculerTri('prixDemande');
    expect(tableau.sensTriDe('prixDemande')).toBe('descending');
  });
});
