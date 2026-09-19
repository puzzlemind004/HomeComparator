import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DiagrammeScores, type BarreScore } from './diagramme-scores';

/**
 * Le diagramme est monté par le TestBed parce qu'il tient une entrée
 * requise : `input.required` veut un composant lié, là où les écrans voisins
 * se construisent à la main.
 */
function creerDiagramme(barres: readonly BarreScore[]) {
  const fixture = TestBed.createComponent(DiagrammeScores);

  fixture.componentRef.setInput('barres', barres);
  fixture.detectChanges();

  return fixture.componentInstance;
}

const classees: readonly BarreScore[] = [
  { bienId: 1, libelle: 'le T3 avec la terrasse', score: 82, rang: 1, manquants: 0 },
  { bienId: 2, libelle: 'celui avec la cuisine refaite', score: 61, rang: 2, manquants: 0 },
];

describe('DiagrammeScores', () => {
  it('dessine un bâton par Bien classé', () => {
    const diagramme = creerDiagramme(classees);

    expect(diagramme.batons()).toHaveLength(2);
    expect(diagramme.rempli()).toBe(true);
  });

  it('donne au bâton une hauteur proportionnelle au score', () => {
    // C'est tout ce que le diagramme apporte sur une liste : l'écart se lit
    // à la hauteur comparée.
    const [meilleur, moindre] = creerDiagramme(classees).batons();

    expect(meilleur.hauteur).toBeGreaterThan(moindre.hauteur);
    expect(meilleur.hauteur / moindre.hauteur).toBeCloseTo(82 / 61, 2);
  });

  it('mesure les hauteurs depuis zéro, et non depuis le plus petit score', () => {
    // Tronquer l'ordonnée ferait paraître décisif un écart de deux points :
    // c'est la décision que l'écran doit éclairer, pas fausser.
    const serres: readonly BarreScore[] = [
      { bienId: 1, libelle: 'A', score: 78, rang: 1, manquants: 0 },
      { bienId: 2, libelle: 'B', score: 76, rang: 2, manquants: 0 },
    ];

    const [premier, second] = creerDiagramme(serres).batons();

    // Deux points d'écart sur 100 : les bâtons se ressemblent, et c'est
    // l'information juste.
    expect(Math.abs(premier.hauteur - second.hauteur) / premier.hauteur).toBeLessThan(0.05);
  });

  it('écarte du dessin les Biens sans score', () => {
    // Un Bien sans score n'a pas de hauteur — pas même zéro, qui se lirait
    // comme un mauvais score.
    const diagramme = creerDiagramme([
      ...classees,
      { bienId: 3, libelle: 'celui qu’on vient de repérer', score: null, rang: 3, manquants: 0 },
    ]);

    expect(diagramme.batons().map((baton) => baton.bienId)).toEqual([1, 2]);
  });

  it('marque le premier du classement', () => {
    const [premier, second] = creerDiagramme(classees).batons();

    expect(premier.premier).toBe(true);
    expect(second.premier).toBe(false);
  });

  it('compose le rang en toutes lettres, le SVG n’ayant pas d’exposant', () => {
    const [premier, second] = creerDiagramme(classees).batons();

    expect(premier.ordinal).toBe('1er');
    expect(second.ordinal).toBe('2e');
  });

  it('laisse un trait visible à un score de zéro', () => {
    // Une hauteur nulle ne dessinerait rien : la colonne doit rester sous
    // son libellé.
    const [baton] = creerDiagramme([
      { bienId: 1, libelle: 'le dernier', score: 0, rang: 1, manquants: 0 },
    ]).batons();

    expect(baton.hauteur).toBeGreaterThan(0);
  });

  it('ne dessine rien quand aucun Bien n’a de score', () => {
    const diagramme = creerDiagramme([
      { bienId: 1, libelle: 'A', score: null, rang: 1, manquants: 0 },
    ]);

    expect(diagramme.rempli()).toBe(false);
  });

  it('décrit le classement pour qui ne voit pas le dessin', () => {
    // Sans cette phrase, il ne reste qu'un `<svg>` muet.
    const diagramme = creerDiagramme(classees);

    expect(diagramme.description()).toContain('le T3 avec la terrasse');
    expect(diagramme.description()).toContain('82');
  });

  it('nomme le second du classement, et non le dernier', () => {
    // « mène devant X » en citant la queue du classement décrirait un écart
    // qui n'est pas celui qu'on annonce, et une oreille n'a pas le dessin
    // pour rattraper.
    const trois: readonly BarreScore[] = [
      { bienId: 1, libelle: 'le premier', score: 90, rang: 1, manquants: 0 },
      { bienId: 2, libelle: 'le second', score: 80, rang: 2, manquants: 0 },
      { bienId: 3, libelle: 'le dernier', score: 10, rang: 3, manquants: 0 },
    ];

    const description = creerDiagramme(trois).description();

    expect(description).toContain('devant le second');
    expect(description).toContain('Dernier : le dernier');
  });

  it('ne nomme pas deux fois le même Bien quand ils ne sont que deux', () => {
    // À deux, le second est le dernier : le nommer deux fois ferait entendre
    // trois Biens là où il y en a deux.
    const description = creerDiagramme(classees).description();

    expect(description).not.toContain('Dernier :');
  });

  it('dit que le meneur repose sur une saisie incomplète', () => {
    // L'œil le voit dans la liste sous le diagramme ; l'oreille ne l'aurait
    // pas sans cette phrase (#130).
    const description = creerDiagramme([
      { bienId: 1, libelle: 'le T3', score: 82, rang: 1, manquants: 3 },
      { bienId: 2, libelle: 'l’autre', score: 61, rang: 2, manquants: 0 },
    ]).description();

    expect(description).toContain('saisie incomplète');
    expect(description).toContain('3 Critères non renseignés');
  });

  it('ne parle pas de saisie incomplète quand le meneur a tout rempli', () => {
    expect(creerDiagramme(classees).description()).not.toContain('incomplète');
  });

  it('s’élargit avec le nombre de Biens', () => {
    // Deux Biens ne s'étalent pas sur la largeur de douze.
    const deux = creerDiagramme(classees).geometrie().largeur;
    const trois = creerDiagramme([
      ...classees,
      { bienId: 3, libelle: 'C', score: 40, rang: 3, manquants: 0 },
    ])
      .geometrie()
      .largeur;

    expect(trois).toBeGreaterThan(deux);
  });
});
