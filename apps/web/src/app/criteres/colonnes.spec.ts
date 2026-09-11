import { describe, expect, it } from 'vitest';
import {
  COLONNES,
  COLONNES_DECISIVES,
  GROUPES_COLONNES,
  type GroupeColonnes,
  ID_COLONNES_DECISIVES,
  ID_COLONNE_PRIX_METRE_CARRE,
  caseDe,
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

  it('ne perd aucune colonne calculée faute de groupe', () => {
    // `groupeDe` rend le groupe de `prixDemande` pour la Colonne calculée,
    // qui n'en a pas (ADR-0013). Si ce Critère était renommé, la fonction
    // rendrait `undefined` et le prix au m² disparaîtrait du tableau sans
    // qu'aucune erreur ne soit levée : ce test est ce qui le ferait voir.
    const groupees = GROUPES_COLONNES.flatMap(({ colonnes }) => colonnes);

    expect(groupees).toHaveLength(COLONNES.length);
    expect(groupees.some((colonne) => colonne.id === ID_COLONNE_PRIX_METRE_CARRE)).toBe(true);
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
 * La case d'un Bien sur une colonne — ce qui s'y écrit et si le Critère est
 * renseigné — telle que les deux présentations la lisent.
 *
 * La forme vit ici et non dans le tableau qui l'a introduite : la carte
 * mobile (#11) montre les mêmes Biens (ADR-0006) et marque l'absence de la
 * même manière. Écrite deux fois, la règle « renseigné dès qu'une valeur est
 * portée, zéro compris » aurait divergé au premier Critère ajouté.
 */
describe('caseDe', () => {
  const prix = colonneParId('prixDemande')!;

  it('écrit la valeur et la dit renseignée', () => {
    const donnee = caseDe(prix, unBien({ criteres: { prixDemande: 250000 } }).criteres);

    expect(normaliser(donnee.texte)).toBe('250 000 €');
    expect(donnee.renseigne).toBe(true);
  });

  it('tient un zéro pour renseigné', () => {
    // La distinction ne se lit pas du texte : un zéro s'écrit « 0 » et un
    // Critère absent s'écrit vide, mais c'est de `renseigne` que les deux
    // écrans tirent leur marquage (#6).
    const stationnement = colonneParId('capaciteStationnement')!;
    const donnee = caseDe(
      stationnement,
      unBien({ criteres: { capaciteStationnement: 0 } }).criteres,
    );

    expect(donnee.texte).toBe('0');
    expect(donnee.renseigne).toBe(true);
  });

  it('rend une case vide quand le Critère n’est pas renseigné', () => {
    const donnee = caseDe(prix, unBien().criteres);

    expect(donnee.texte).toBe('');
    expect(donnee.renseigne).toBe(false);
  });

  it('porte la colonne dont elle sort', () => {
    // L'écran en tire l'alignement des nombres et le libellé qu'il place à
    // côté de la valeur : sans elle, il faudrait la retrouver par son `id`.
    expect(caseDe(prix, unBien().criteres).colonne).toBe(prix);
  });
});

describe('COLONNES_DECISIVES', () => {
  it('porte le prix, le prix au m², la surface et la ville, dans l’ordre du tableau', () => {
    // Ce sur quoi un Bien se reconnaît d'un coup d'œil (#11). L'ordre est
    // celui de `COLONNES`, comme partout ailleurs : les deux présentations
    // montrent les mêmes Biens (ADR-0006), et une carte qui réordonnerait ce
    // que le tableau ordonne se lirait contre lui.
    expect(COLONNES_DECISIVES.map((colonne) => colonne.id)).toEqual([
      'prixDemande',
      ID_COLONNE_PRIX_METRE_CARRE,
      'surfaceHabitable',
      'villeQuartier',
    ]);
  });

  it('nomme des Critères qui existent bel et bien', () => {
    // La liste cite trois identifiants en dur — un choix éditorial, qui ne se
    // déduit d'aucune métadonnée de la définition. Renommer l'un des trois
    // viderait la carte en silence : elle n'afficherait plus que deux
    // Critères, sans qu'aucune erreur ne soit levée.
    expect(COLONNES_DECISIVES).toHaveLength(ID_COLONNES_DECISIVES.length);
  });

  it('ne montre qu’une part des Colonnes : la carte n’est pas le tableau', () => {
    // Une carte qui porterait les seize Colonnes serait le tableau qu'ADR-0006
    // écarte sur mobile, réécrit à la verticale — et aussi illisible.
    expect(COLONNES_DECISIVES.length).toBeLessThan(COLONNES.length);
  });

  it('écrit ses valeurs comme le tableau les écrit', () => {
    // Les colonnes sont celles du tableau, prises telles quelles : une même
    // valeur ne peut donc pas s'écrire « 250000 » sur la carte et
    // « 250 000 € » dans le tableau.
    const criteres = unBien({
      criteres: { prixDemande: 250000, surfaceHabitable: 72.5, villeQuartier: 'Nantes' },
    }).criteres;

    expect(COLONNES_DECISIVES.map((colonne) => normaliser(colonne.texte(criteres)))).toEqual([
      '250 000 €',
      '3 448 €/m²',
      '72,5 m²',
      'Nantes',
    ]);
  });

  it('porte le prix au mètre carré, et le pose à la suite du prix', () => {
    // ADR-0013 le veut sur toutes les formes du carnet, cartes comprises :
    // c'est sur mobile, où les Biens se lisent l'un après l'autre plutôt que
    // côte à côte, qu'il porte le plus — il situe un Bien sans qu'on ait
    // l'autre sous les yeux.
    const ids = COLONNES_DECISIVES.map((colonne) => colonne.id);

    expect(ids.indexOf(ID_COLONNE_PRIX_METRE_CARRE)).toBe(ids.indexOf('prixDemande') + 1);
  });

  it('reste vide sur le prix au mètre carré quand une de ses sources manque', () => {
    // La Colonne calculée se tait dès qu'il lui manque le prix ou la surface,
    // et la carte la marque alors comme ce qu'il reste à demander — jamais
    // comme un zéro.
    const prixMetreCarre = COLONNES_DECISIVES.find(
      (colonne) => colonne.id === ID_COLONNE_PRIX_METRE_CARRE,
    )!;

    expect(
      prixMetreCarre.valeur(unBien({ criteres: { prixDemande: 250000 } }).criteres),
    ).toBeNull();
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

  it('déborde largement si tous les groupes sont affichés', () => {
    // C'est le constat de #49, et la raison d'être du pliage : le tableau
    // entier ne tient sur aucun écran de portable.
    const tout = LARGEUR_FIXE + GROUPES_COLONNES.reduce((t, g) => t + largeurGroupe(g), 0);

    expect(tout).toBeGreaterThan(2 * SEUIL_APPARITION);
  });

  it('tient au seuil d’apparition avec le seul groupe budget affiché', () => {
    // C'est l'état dans lequel le tableau s'ouvre : il ne défile donc pas de
    // côté sur l'écran le plus étroit où il paraît. Un groupe masqué ne
    // laisse aucune colonne, et ne compte donc pour rien dans la largeur.
    const budget = GROUPES_COLONNES.find(({ groupe }) => groupe === 'budget')!;
    const ouverture = LARGEUR_FIXE + largeurGroupe(budget);

    expect(ouverture).toBeLessThan(SEUIL_APPARITION);
  });

  it('tient au seuil d’apparition avec n’importe quel groupe affiché seul', () => {
    // Le choix par groupe n'est utile que si chaque groupe est consultable
    // sans défilement, et pas seulement celui de l'ouverture. Le plus large
    // — « Logement », cinq Critères — réclame de l'ordre de 960 px : les
    // quatre tiennent donc à 1024, et a fortiori sur les 1280 px d'un
    // portable courant.
    for (const groupe of GROUPES_COLONNES) {
      const seul = LARGEUR_FIXE + largeurGroupe(groupe);

      expect(seul).toBeLessThan(SEUIL_APPARITION);
    }
  });

  it('déborde dès que deux groupes larges sont affichés ensemble', () => {
    // Le débordement n'a pas disparu, il est devenu un choix : c'est
    // l'acheteur qui le demande en affichant un second groupe, et non le
    // tableau qui l'impose à l'ouverture (#49, ADR-0006).
    const budget = GROUPES_COLONNES.find(({ groupe }) => groupe === 'budget')!;
    const logement = GROUPES_COLONNES.find(({ groupe }) => groupe === 'logement')!;
    const deux = LARGEUR_FIXE + largeurGroupe(budget) + largeurGroupe(logement);

    expect(deux).toBeGreaterThan(PORTABLE_COURANT);
  });
});
