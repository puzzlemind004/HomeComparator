import { describe, expect, it } from 'vitest';
import { ID_COLONNE_PRIX_METRE_CARRE, colonneParId } from './colonnes';
import { TRI_INITIAL, basculer, trier, type Tri } from './tri';
import { unBien } from '../biens/bien.test-helper';
import type { Bien } from '../biens/bien';
import type { ValeursCriteres } from './valeurs';

const prix = colonneParId('prixDemande')!;
const surface = colonneParId('surfaceHabitable')!;
const ville = colonneParId('villeQuartier')!;
const dpe = colonneParId('dpe')!;
const prixMetreCarre = colonneParId(ID_COLONNE_PRIX_METRE_CARRE)!;

/** Un Bien identifié par son Libellé, ce qui rend les attentes lisibles. */
function bien(libelle: string, criteres: ValeursCriteres = {}): Bien {
  return unBien({ libelle, criteres });
}

/** Les Libellés dans l'ordre où le tri les rend. */
function ordre(biens: readonly Bien[], tri: Tri): string[] {
  return trier(biens, tri).map((bien) => bien.libelle);
}

describe('basculer', () => {
  it('trie une colonne non triée par ordre croissant', () => {
    // Le premier clic doit donner l'ordre le plus attendu : le moins cher
    // d'abord, le plus petit d'abord (#10).
    expect(basculer(TRI_INITIAL, prix.id)).toEqual({ colonne: prix.id, sens: 'croissant' });
  });

  it('renverse le sens au second clic sur la même colonne', () => {
    const croissant: Tri = { colonne: prix.id, sens: 'croissant' };

    expect(basculer(croissant, prix.id)).toEqual({ colonne: prix.id, sens: 'decroissant' });
  });

  it('revient au croissant au troisième clic', () => {
    // Deux sens et pas trois : un cycle qui repasserait par « pas de tri »
    // ferait sauter les lignes sans qu'on l'ait demandé.
    const decroissant: Tri = { colonne: prix.id, sens: 'decroissant' };

    expect(basculer(decroissant, prix.id)).toEqual({ colonne: prix.id, sens: 'croissant' });
  });

  it('repart du croissant en changeant de colonne', () => {
    const decroissant: Tri = { colonne: prix.id, sens: 'decroissant' };

    expect(basculer(decroissant, surface.id)).toEqual({
      colonne: surface.id,
      sens: 'croissant',
    });
  });
});

describe('trier', () => {
  it('classe les nombres du plus petit au plus grand', () => {
    const biens = [
      bien('cher', { prixDemande: 310000 }),
      bien('abordable', { prixDemande: 190000 }),
      bien('moyen', { prixDemande: 250000 }),
    ];

    expect(ordre(biens, { colonne: prix.id, sens: 'croissant' })).toEqual([
      'abordable',
      'moyen',
      'cher',
    ]);
  });

  it('renverse le classement en décroissant', () => {
    const biens = [
      bien('abordable', { prixDemande: 190000 }),
      bien('cher', { prixDemande: 310000 }),
    ];

    expect(ordre(biens, { colonne: prix.id, sens: 'decroissant' })).toEqual(['cher', 'abordable']);
  });

  it('groupe les Critères non renseignés en fin de tri croissant', () => {
    // C'est le cœur du ticket : un Critère absent n'est pas zéro. Le
    // rabattre sur zéro mettrait les Biens à renseigner en tête d'un tri par
    // prix, comme s'ils étaient les moins chers du carnet (#10).
    const biens = [
      bien('sans prix'),
      bien('cher', { prixDemande: 310000 }),
      bien('abordable', { prixDemande: 190000 }),
    ];

    expect(ordre(biens, { colonne: prix.id, sens: 'croissant' })).toEqual([
      'abordable',
      'cher',
      'sans prix',
    ]);
  });

  it('les garde en fin de tri décroissant aussi', () => {
    // Le sens ne les fait pas remonter : « en fin de tri » n'est pas « la
    // plus petite valeur », c'est « pas de valeur ». Les renverser avec le
    // reste les ferait occuper le haut de l'écran une fois sur deux.
    const biens = [
      bien('sans prix'),
      bien('cher', { prixDemande: 310000 }),
      bien('abordable', { prixDemande: 190000 }),
    ];

    expect(ordre(biens, { colonne: prix.id, sens: 'decroissant' })).toEqual([
      'cher',
      'abordable',
      'sans prix',
    ]);
  });

  it('classe les non renseignés entre eux par Libellé', () => {
    // Ils sont tous ex æquo sur la colonne : à défaut d'un ordre, le
    // Libellé les rend stables d'un tri à l'autre plutôt que de les laisser
    // se réarranger à chaque clic.
    const biens = [bien('zébulon'), bien('anatole')];

    expect(ordre(biens, { colonne: prix.id, sens: 'croissant' })).toEqual(['anatole', 'zébulon']);
  });

  it("classe les textes dans l'ordre alphabétique français", () => {
    // « Élancourt » se range à E et non après Z : sans comparaison
    // localisée, les accents partent en fin de liste.
    const biens = [
      bien('troisième', { villeQuartier: 'Zola' }),
      bien('deuxième', { villeQuartier: 'Élancourt' }),
      bien('premier', { villeQuartier: 'Avignon' }),
    ];

    expect(ordre(biens, { colonne: ville.id, sens: 'croissant' })).toEqual([
      'premier',
      'deuxième',
      'troisième',
    ]);
  });

  it('classe une énumération par son rang dans la définition', () => {
    // A vaut mieux que G parce que la définition l'écrit en premier, et non
    // parce que « A » vient avant « G » dans l'alphabet : un DPE dont les
    // valeurs seraient renommées se classerait toujours bien.
    const biens = [
      bien('passoire', { dpe: 'F' }),
      bien('correct', { dpe: 'C' }),
      bien('excellent', { dpe: 'A' }),
    ];

    expect(ordre(biens, { colonne: dpe.id, sens: 'croissant' })).toEqual([
      'excellent',
      'correct',
      'passoire',
    ]);
  });

  it('trie sur la colonne calculée comme sur les autres', () => {
    const biens = [
      bien('grand et cher', { prixDemande: 400000, surfaceHabitable: 100 }),
      bien('petit et bon marché', { prixDemande: 150000, surfaceHabitable: 50 }),
      bien('sans surface', { prixDemande: 200000 }),
    ];

    expect(ordre(biens, { colonne: prixMetreCarre.id, sens: 'croissant' })).toEqual([
      'petit et bon marché',
      'grand et cher',
      'sans surface',
    ]);
  });

  it("classe par Libellé quand aucune colonne n'est triée", () => {
    // L'ordre d'arrivée de l'API n'a rien à dire à l'acheteur : le carnet
    // s'ouvre sur un ordre stable.
    const biens = [bien('zébulon'), bien('anatole')];

    expect(ordre(biens, TRI_INITIAL)).toEqual(['anatole', 'zébulon']);
  });

  it("ignore une colonne qui n'existe pas", () => {
    // Un identifiant qui ne désigne rien ne doit pas vider le tableau ni
    // lever : l'ordre par défaut est une réponse suffisante.
    const biens = [bien('zébulon'), bien('anatole')];

    expect(ordre(biens, { colonne: 'inexistante', sens: 'croissant' })).toEqual([
      'anatole',
      'zébulon',
    ]);
  });

  it('ne modifie pas la liste reçue', () => {
    // La liste vient du service, et le tableau n'est qu'une vue dessus :
    // la trier sur place ferait bouger l'ordre de l'API sous les autres
    // écrans.
    const biens = [
      bien('cher', { prixDemande: 310000 }),
      bien('abordable', { prixDemande: 190000 }),
    ];

    trier(biens, { colonne: prix.id, sens: 'croissant' });

    expect(biens.map((bien) => bien.libelle)).toEqual(['cher', 'abordable']);
  });

  it('départage deux valeurs égales par le Libellé', () => {
    const biens = [
      bien('zébulon', { prixDemande: 250000 }),
      bien('anatole', { prixDemande: 250000 }),
    ];

    expect(ordre(biens, { colonne: prix.id, sens: 'croissant' })).toEqual(['anatole', 'zébulon']);
  });

  it('garde le même ordre des ex æquo dans les deux sens', () => {
    // Le départage par Libellé ne se renverse pas avec le sens : deux Biens
    // au même prix n'ont pas à échanger leur place parce qu'on a cliqué
    // une seconde fois.
    const biens = [
      bien('zébulon', { prixDemande: 250000 }),
      bien('anatole', { prixDemande: 250000 }),
    ];

    expect(ordre(biens, { colonne: prix.id, sens: 'decroissant' })).toEqual(['anatole', 'zébulon']);
  });

  it('range un zéro comme une valeur, pas comme une absence', () => {
    // Zéro place de stationnement est une information : la ranger avec les
    // non renseignés effacerait ce que l'acheteur a pris la peine de noter.
    const stationnement = colonneParId('capaciteStationnement')!;
    const biens = [
      bien('sans réponse'),
      bien('deux places', { capaciteStationnement: 2 }),
      bien('aucune place', { capaciteStationnement: 0 }),
    ];

    expect(ordre(biens, { colonne: stationnement.id, sens: 'croissant' })).toEqual([
      'aucune place',
      'deux places',
      'sans réponse',
    ]);
  });

  it('reste stable et complet sur plusieurs dizaines de Biens', () => {
    // Le tableau doit rester utilisable à cette taille (#10). Un Bien sur
    // trois sans prix : le tri doit tous les rendre, les renseignés classés
    // et les autres groupés à la fin.
    const biens = Array.from({ length: 60 }, (_, index) =>
      bien(
        `bien-${String(index).padStart(2, '0')}`,
        index % 3 === 0 ? {} : { prixDemande: 500000 - index * 1000 },
      ),
    );

    const classes = trier(biens, { colonne: prix.id, sens: 'croissant' });
    const renseignes = classes.filter((bien) => bien.criteres['prixDemande'] !== null);
    const absents = classes.slice(renseignes.length);

    expect(classes).toHaveLength(60);
    // Aucun Bien sans prix ne s'est glissé parmi les renseignés.
    expect(absents.every((bien) => bien.criteres['prixDemande'] === null)).toBe(true);
    expect(
      renseignes.every(
        (bien, rang) =>
          rang === 0 ||
          Number(renseignes[rang - 1].criteres['prixDemande']) <=
            Number(bien.criteres['prixDemande']),
      ),
    ).toBe(true);
  });

  it('trie la colonne calculée sur sa valeur, pas sur son texte arrondi', () => {
    // Deux Biens dont les prix au m² s'écrivent pareil une fois arrondis à
    // l'euro : le tri doit départager sur le calcul, sinon l'ordre dépendrait
    // de l'affichage et deux colonnes identiques à l'œil se classeraient au
    // hasard.
    const biens = [
      bien('un peu plus cher', { prixDemande: 200060, surfaceHabitable: 100 }),
      bien('un peu moins cher', { prixDemande: 200010, surfaceHabitable: 100 }),
    ];

    expect(ordre(biens, { colonne: prixMetreCarre.id, sens: 'croissant' })).toEqual([
      'un peu moins cher',
      'un peu plus cher',
    ]);
  });

  it("range une valeur d'énumération hors définition avec les absents", () => {
    // Elle n'a pas de rang : la classer au hasard entre deux DPE vaudrait
    // moins que de la ranger avec ce qu'on ne sait pas placer, comme le fait
    // déjà la comparaison (#12).
    const biens = [bien('inconnue', { dpe: 'inconnue' }), bien('correct', { dpe: 'C' })];

    expect(ordre(biens, { colonne: dpe.id, sens: 'croissant' })).toEqual(['correct', 'inconnue']);
  });
});
