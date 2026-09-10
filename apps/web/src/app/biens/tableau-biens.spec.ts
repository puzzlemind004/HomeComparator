import { describe, expect, it } from 'vitest';
import { TableauBiens, type CaseTableau } from './tableau-biens';
import { unBien } from './bien.test-helper';
import type { Bien } from './bien';
import type { ValeursCriteres } from '../criteres/valeurs';
import { ID_COLONNE_PRIX_METRE_CARRE } from '../criteres/colonnes';
import { CRITERES_ORDONNES, GROUPES, criteresDuGroupe } from '../criteres/definition';

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
function creerTableau(biens: Bien[]) {
  const tableau = new TableauBiens();

  tableau.biens.set(biens);

  return tableau;
}

function bien(libelle: string, criteres: ValeursCriteres = {}): Bien {
  return unBien({ libelle, criteres });
}

/**
 * La case d'une colonne sur la première ligne, le groupe qui la porte étant
 * déplié au besoin.
 *
 * Seul « Budget » l'est à l'ouverture : chercher la case d'un Critère de
 * confort sans déplier son groupe ne rendrait rien, et le test échouerait
 * sur l'affichage plutôt que sur ce qu'il vérifie.
 */
function caseDe(tableau: TableauBiens, id: string): CaseTableau {
  const groupe = tableau.groupes.find(({ colonnes }) =>
    colonnes.some((colonne) => colonne.id === id),
  )!;

  if (!tableau.estDeplie(groupe.groupe)) {
    tableau.basculerGroupe(groupe.groupe);
  }

  return tableau.lignes()[0].cases.find((donnee) => donnee.colonne.id === id)!;
}

/** Les Libellés des lignes, dans l'ordre où le tableau les rend. */
function libelles(tableau: TableauBiens): string[] {
  return tableau.lignes().map((ligne) => ligne.bien.libelle);
}

describe('TableauBiens', () => {
  it('porte une colonne par Critère, plus le prix au mètre carré', () => {
    const tableau = creerTableau([]);

    expect(tableau.groupes.flatMap(({ colonnes }) => colonnes).length).toBe(
      CRITERES_ORDONNES.length + 1,
    );
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

    expect(caseDe(tableau, 'capaciteStationnement').renseigne).toBe(true);
    expect(caseDe(tableau, 'prixDemande').renseigne).toBe(false);
  });

  it('laisse le prix au mètre carré vide quand le prix ou la surface manque', () => {
    const tableau = creerTableau([bien('sans surface', { prixDemande: 250000 })]);
    const calculee = caseDe(tableau, ID_COLONNE_PRIX_METRE_CARRE);

    expect(calculee.texte).toBe('');
    expect(calculee.renseigne).toBe(false);
  });

  it('calcule le prix au mètre carré quand les deux sont là', () => {
    const tableau = creerTableau([
      bien('complet', { prixDemande: 250000, surfaceHabitable: 100 }),
    ]);
    const calculee = caseDe(tableau, ID_COLONNE_PRIX_METRE_CARRE);

    expect(normaliser(calculee.texte)).toBe('2 500 €/m²');
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

/** Les identifiants des colonnes que le tableau affiche en l'état. */
function visibles(tableau: TableauBiens): string[] {
  return tableau.colonnesVisibles().map((colonne) => colonne.id);
}

describe('TableauBiens, pliage des groupes', () => {
  it("n'ouvre que le groupe budget à l'affichage", () => {
    // Dix-huit colonnes en `nowrap` réclament de l'ordre de 2400 px, pour un
    // seuil d'apparition à 1024 : tout déplier ferait défiler le tableau de
    // côté, ce qu'ADR-0006 rejette pour ce que cela détruit — la comparaison
    // d'un coup d'œil.
    const tableau = creerTableau([]);

    expect(tableau.estDeplie('budget')).toBe(true);
    expect(tableau.estDeplie('logement')).toBe(false);
    expect(tableau.estDeplie('localisation')).toBe(false);
    expect(tableau.estDeplie('confort')).toBe(false);
  });

  it("n'affiche que les colonnes des groupes dépliés", () => {
    const tableau = creerTableau([]);
    const budget = criteresDuGroupe('budget').map((critere) => critere.id);

    expect(visibles(tableau)).toEqual([
      ...budget.slice(0, 1),
      ID_COLONNE_PRIX_METRE_CARRE,
      ...budget.slice(1),
    ]);
  });

  it('fait paraître les colonnes du groupe déplié', () => {
    const tableau = creerTableau([]);

    tableau.basculerGroupe('localisation');

    for (const critere of criteresDuGroupe('localisation')) {
      expect(visibles(tableau)).toContain(critere.id);
    }
  });

  it('fait disparaître les colonnes du groupe replié', () => {
    const tableau = creerTableau([]);

    tableau.basculerGroupe('budget');

    expect(tableau.estDeplie('budget')).toBe(false);
    expect(visibles(tableau)).toEqual([]);
  });

  it('replie un groupe déplié et le redéplie au clic suivant', () => {
    const tableau = creerTableau([]);

    tableau.basculerGroupe('confort');
    expect(tableau.estDeplie('confort')).toBe(true);

    tableau.basculerGroupe('confort');
    expect(tableau.estDeplie('confort')).toBe(false);
  });

  it('garde les colonnes dans l’ordre de la définition quels que soient les plis', () => {
    // Déplier « Confort » avant « Logement » ne doit pas mettre le confort
    // devant : l'ordre des colonnes est celui de la définition (ADR-0004),
    // pas celui des clics.
    const tableau = creerTableau([]);

    tableau.basculerGroupe('confort');
    tableau.basculerGroupe('logement');

    const attendu = tableau.groupes
      .filter(({ groupe }) => tableau.estDeplie(groupe))
      .flatMap(({ colonnes }) => colonnes.map((colonne) => colonne.id));

    expect(visibles(tableau)).toEqual(attendu);
  });

  it('ne calcule les cases que des colonnes visibles', () => {
    // Le tableau formate ses cases une fois par changement de Biens ou de
    // tri (#10) : formater les seize Colonnes pour n'en montrer quatre
    // paierait à chaque clic un travail qui ne s'affiche pas.
    const tableau = creerTableau([bien('anatole')]);

    expect(tableau.lignes()[0].cases.map((donnee) => donnee.colonne.id)).toEqual(
      visibles(tableau),
    );
  });

  it('garde le tri d’une colonne que l’on replie, et le retrouve au dépliage', () => {
    // Replier un groupe ne redéfait pas un classement demandé : le tableau
    // reste trié, et la colonne reparaît triée telle qu'on l'avait laissée.
    const tableau = creerTableau([
      bien('grand', { surfaceHabitable: 90 }),
      bien('petit', { surfaceHabitable: 40 }),
    ]);

    tableau.basculerGroupe('logement');
    tableau.basculerTri('surfaceHabitable');
    expect(libelles(tableau)).toEqual(['petit', 'grand']);

    tableau.basculerGroupe('logement');
    expect(tableau.tri().colonne).toBe('surfaceHabitable');
    expect(libelles(tableau)).toEqual(['petit', 'grand']);

    tableau.basculerGroupe('logement');
    expect(tableau.sensTriDe('surfaceHabitable')).toBe('ascending');
  });

  it('range chaque Critère de la définition dans son groupe, sans en perdre', () => {
    // Un Critère ajouté à la définition paraît dans son groupe sans qu'on
    // retouche le tableau (ADR-0004) : ce test tomberait si le tableau
    // énumérait ses colonnes à la main.
    const tableau = creerTableau([]);

    for (const { groupe } of GROUPES) {
      tableau.basculerGroupe(groupe);
    }

    // `budget` était déplié : la boucle l'a replié, on le rouvre.
    tableau.basculerGroupe('budget');

    expect(visibles(tableau).length).toBe(CRITERES_ORDONNES.length + 1);
  });

  it('dit si un groupe est affiché pour l’annoncer au lecteur d’écran', () => {
    // C'est ce dont la bascule tire son `aria-pressed` : le bouton dit un
    // état — ce groupe est affiché — et non une action, et il s'atteint au
    // clavier (ADR-0005).
    const tableau = creerTableau([]);

    expect(tableau.estDeplie('budget')).toBe(true);

    tableau.basculerGroupe('budget');
    expect(tableau.estDeplie('budget')).toBe(false);
  });
});

describe('TableauBiens, commandes de pliage', () => {
  it('présente les quatre groupes, nommés, en permanence', () => {
    // Un groupe masqué ne laisse aucune trace dans le tableau : c'est par
    // ces commandes qu'on le rouvre, et elles doivent donc toutes s'y
    // trouver quel que soit l'état du pliage.
    const tableau = creerTableau([]);

    expect(tableau.commandes().map(({ libelle }) => libelle)).toEqual(
      GROUPES.map(({ libelle }) => libelle),
    );

    tableau.basculerGroupe('budget');

    expect(tableau.commandes().length).toBe(GROUPES.length);
  });

  it('dit de chaque groupe s’il est affiché', () => {
    // C'est ce dont le bouton tire son `aria-pressed` (ADR-0005).
    const tableau = creerTableau([]);
    const etats = Object.fromEntries(
      tableau.commandes().map(({ groupe, deplie }) => [groupe, deplie]),
    );

    expect(etats).toEqual({
      budget: true,
      logement: false,
      localisation: false,
      confort: false,
    });
  });

  it('dit combien de colonnes chaque groupe ajoute', () => {
    // Le compte s'affiche sur le bouton : ce que le clic coûte en largeur
    // se voit avant de cliquer.
    const tableau = creerTableau([]);
    const budget = tableau.commandes().find(({ groupe }) => groupe === 'budget')!;

    // Trois Critères de budget, plus le prix au m² qui les suit.
    expect(budget.colonnes.length).toBe(criteresDuGroupe('budget').length + 1);
  });

  it('porte autant de cases par ligne que de colonnes visibles', () => {
    // Un groupe masqué ne laisse pas de cellule : l'en-tête et les lignes
    // portent le même nombre de colonnes, sans quoi le tableau se
    // décalerait.
    const tableau = creerTableau([bien('anatole')]);

    expect(tableau.lignes()[0].cases.length).toBe(tableau.colonnesVisibles().length);

    tableau.basculerGroupe('confort');
    expect(tableau.lignes()[0].cases.length).toBe(tableau.colonnesVisibles().length);
  });
});
