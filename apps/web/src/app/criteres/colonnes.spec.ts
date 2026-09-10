import { describe, expect, it } from 'vitest';
import {
  COLONNES,
  GROUPES_COLONNES,
  type GroupeColonnes,
  ID_COLONNE_PRIX_METRE_CARRE,
  colonneParId,
} from './colonnes';
import { CRITERES_ORDONNES, GROUPES, critereParId } from './definition';
import { unBien } from '../biens/bien.test-helper';

/**
 * `Intl` insère des espaces insécables autour des unités et des séparateurs
 * de milliers, comme le relève déjà `formatage.spec.ts`. Les comparer tels
 * quels rendrait l'attente illisible et dépendante du caractère exact.
 */
function normaliser(texte: string): string {
  return texte.replace(/[\u00a0\u202f]/g, ' ');
}

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

  it('nomme des Critères qui existent bel et bien dans la définition', () => {
    // La colonne calculée est le seul endroit du module qui cite des
    // identifiants en dur — le prix au m² est par définition le prix divisé
    // par la surface. Renommer l'un des deux Critères la viderait en
    // silence : elle rendrait `null` partout sans que rien ne le signale.
    expect(critereParId('prixDemande')).toBeDefined();
    expect(critereParId('surfaceHabitable')).toBeDefined();
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
    expect(
      prixMetreCarre.valeur(unBien({ criteres: { surfaceHabitable: 72.5 } }).criteres),
    ).toBeNull();
  });

  it('reste vide quand la surface manque', () => {
    expect(
      prixMetreCarre.valeur(unBien({ criteres: { prixDemande: 250000 } }).criteres),
    ).toBeNull();
  });

  it('reste vide quand la surface est une saisie erronée', () => {
    const bien = unBien({ criteres: { prixDemande: 250000, surfaceHabitable: 0 } });

    expect(prixMetreCarre.valeur(bien.criteres)).toBeNull();
  });
});

describe('texte d’une colonne', () => {
  it('écrit la valeur d’un Critère selon son type et son unité', () => {
    const surface = colonneParId('surfaceHabitable')!;

    expect(surface.texte(unBien({ criteres: { surfaceHabitable: 72.5 } }).criteres)).toBe(
      '72,5 m²',
    );
  });

  it('écrit le libellé d’une énumération, pas la valeur stockée', () => {
    const dpe = colonneParId('dpe')!;

    expect(dpe.texte(unBien({ criteres: { travauxAPrevoir: 'lourds', dpe: 'C' } }).criteres)).toBe(
      'C',
    );

    const travaux = colonneParId('travauxAPrevoir')!;

    expect(travaux.texte(unBien({ criteres: { travauxAPrevoir: 'lourds' } }).criteres)).toBe(
      'Lourds',
    );
  });

  it('écrit le prix au mètre carré arrondi à l’euro', () => {
    const prixMetreCarre = colonneParId(ID_COLONNE_PRIX_METRE_CARRE)!;
    const bien = unBien({ criteres: { prixDemande: 250000, surfaceHabitable: 72.5 } });

    // 3448,27… €/m² : le centime au mètre carré n'apprend rien et allonge
    // une colonne répétée à chaque ligne.
    expect(normaliser(prixMetreCarre.texte(bien.criteres))).toBe('3 448 €/m²');
  });

  it('rend la chaîne vide sur un Critère non renseigné', () => {
    // C'est à l'écran de marquer l'absence, pas au texte : le tableau doit
    // pouvoir la distinguer d'un zéro autrement que par ce qui est écrit.
    expect(colonneParId('prixDemande')!.texte(unBien().criteres)).toBe('');
  });
});

describe('GROUPES_COLONNES', () => {
  it('reprend les groupes de la définition, dans leur ordre', () => {
    // Les groupes ne sont pas énumérés ici : un groupe ajouté à la
    // définition doit traverser le tableau sans qu'on y revienne (ADR-0004).
    expect(GROUPES_COLONNES.map((groupe) => groupe.groupe)).toEqual(
      GROUPES.map(({ groupe }) => groupe),
    );
  });

  it('nomme chaque groupe comme la définition le nomme', () => {
    expect(GROUPES_COLONNES.map((groupe) => groupe.libelle)).toEqual(
      GROUPES.map(({ libelle }) => libelle),
    );
  });

  it('range chaque colonne de Critère dans le groupe de son Critère', () => {
    for (const { groupe, colonnes } of GROUPES_COLONNES) {
      for (const colonne of colonnes) {
        // La colonne calculée n'a pas de Critère : elle est vérifiée à part.
        if (colonne.critere) {
          expect(colonne.critere.groupe).toBe(groupe);
        }
      }
    }
  });

  it('range le prix au mètre carré avec le prix demandé', () => {
    // La Colonne calculée n'est pas un Critère et n'a donc pas de groupe
    // (ADR-0013) : elle suit celui dont elle sort, faute de quoi replier
    // « Budget » laisserait à l'écran un prix au m² sans son prix.
    const budget = GROUPES_COLONNES.find((groupe) => groupe.groupe === 'budget')!;
    const ids = budget.colonnes.map((colonne) => colonne.id);

    expect(ids.indexOf(ID_COLONNE_PRIX_METRE_CARRE)).toBe(ids.indexOf('prixDemande') + 1);
  });

  it('couvre toutes les colonnes, sans doublon ni oubli', () => {
    // Le tableau n'affiche que ce que les groupes portent : une colonne
    // tombée hors de tout groupe disparaîtrait de l'écran en silence.
    const groupees = GROUPES_COLONNES.flatMap(({ colonnes }) => colonnes.map((c) => c.id));

    expect(groupees).toEqual(COLONNES.map((colonne) => colonne.id));
  });

  it('garde l’ordre des colonnes à l’intérieur d’un groupe', () => {
    const budget = GROUPES_COLONNES.find((groupe) => groupe.groupe === 'budget')!;
    const attendu = COLONNES.filter((colonne) =>
      budget.colonnes.some((autre) => autre.id === colonne.id),
    );

    expect(budget.colonnes).toEqual(attendu);
  });
});

/**
 * La largeur qu'un en-tête réclame, aux métriques du tableau : police
 * 0.8125rem — 13 px —, padding de 0.75rem de chaque côté, écart de 0.35rem
 * et flèche de tri de 0.75rem.
 *
 * Le facteur 0,55 em par caractère est la largeur moyenne d'une lettre dans
 * une police système à cette taille. C'est une estimation, et elle ne
 * prétend pas au pixel : ce qu'elle sert à établir, c'est un ordre de
 * grandeur — savoir si un groupe déplié tient dans 1024 px ou en réclame le
 * double. Les cellules ne sont pas comptées : un en-tête est presque
 * toujours plus long que ses valeurs, l'adresse mise à part.
 */
function largeurEntete(libelle: string): number {
  const TEXTE = libelle.length * 13 * 0.55;
  const PADDING = 24;
  const ECART = 5.6;
  const FLECHE = 12;

  return TEXTE + PADDING + ECART + FLECHE;
}

/** La largeur du groupe, en-têtes seuls. */
function largeurGroupe(groupe: GroupeColonnes): number {
  return groupe.colonnes.reduce((total, { libelle }) => total + largeurEntete(libelle), 0);
}

/**
 * Ce que le Libellé et le Statut occupent : ils ne sont d'aucun groupe et
 * restent visibles quel que soit le pliage.
 */
const LARGEUR_FIXE = largeurEntete('Bien') + largeurEntete('Statut');

/** Ce qu'un groupe replié laisse : une colonne étroite, au titre vertical. */
const LARGEUR_REPLI = 34;

/**
 * À quelle largeur le tableau tient — la note vérifiable que demandait #49,
 * écrite en test pour qu'un Critère ajouté la remette en cause plutôt que de
 * la laisser vieillir dans un commentaire.
 *
 * Les seuils sont ceux des écrans réels : 1024 px est le seuil d'apparition
 * du tableau (`biens-page.scss`), 1280 celui d'un portable courant.
 */
describe('largeur du tableau', () => {
  const SEUIL_APPARITION = 1024;
  const PORTABLE_COURANT = 1280;

  it('déborde largement si tous les groupes sont dépliés', () => {
    // C'est le constat de #49, et la raison d'être du pliage : le tableau
    // entier ne tient sur aucun écran de portable.
    const tout = LARGEUR_FIXE + GROUPES_COLONNES.reduce((t, g) => t + largeurGroupe(g), 0);

    expect(tout).toBeGreaterThan(2 * SEUIL_APPARITION);
  });

  it('tient au seuil d’apparition avec le seul groupe budget déplié', () => {
    // C'est l'état dans lequel le tableau s'ouvre : il ne défile donc pas de
    // côté sur l'écran le plus étroit où il paraît.
    const budget = GROUPES_COLONNES.find(({ groupe }) => groupe === 'budget')!;
    const ouverture = LARGEUR_FIXE + largeurGroupe(budget) + 3 * LARGEUR_REPLI;

    expect(ouverture).toBeLessThan(SEUIL_APPARITION);
  });

  it('tient sur un portable courant avec n’importe quel groupe déplié seul', () => {
    // Le pliage n'est utile que si chaque groupe est consultable sans
    // défilement. Le plus large — « Logement », cinq Critères — dépasse le
    // seuil d'apparition d'une centaine de pixels, mais tient sur les 1280
    // px d'un portable courant. C'est la borne que ce ticket tient : le
    // tableau s'ouvre sans défilement partout où il paraît, et se consulte
    // groupe par groupe sans défilement dès 1280.
    for (const groupe of GROUPES_COLONNES) {
      const seul = LARGEUR_FIXE + largeurGroupe(groupe) + 3 * LARGEUR_REPLI;

      expect(seul).toBeLessThan(PORTABLE_COURANT);
    }
  });
});
