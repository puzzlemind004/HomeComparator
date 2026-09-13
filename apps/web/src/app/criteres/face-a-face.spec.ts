import { describe, expect, it } from 'vitest';
import { lignesFaceAFace, meilleureValeurColonne } from './face-a-face';
import { COLONNES, ID_COLONNE_PRIX_METRE_CARRE, colonneParId } from './colonnes';
import { CRITERES_ORDONNES } from './definition';
import type { ValeursCriteres } from './valeurs';

/**
 * `Intl` insère des espaces insécables autour des unités et des séparateurs
 * de milliers, comme le relève déjà `formatage.spec.ts`. Les comparer tels
 * quels rendrait l'attente illisible et dépendante du caractère exact.
 */
function normaliser(texte: string): string {
  return texte.replace(/[\u00a0\u202f]/g, ' ');
}

/** La colonne portant cet identifiant, réclamée : un test qui la rate tombe ici. */
function colonne(id: string) {
  const trouvee = colonneParId(id);

  if (!trouvee) {
    throw new Error(`La colonne « ${id} » n'existe pas.`);
  }

  return trouvee;
}

/** La ligne de cette colonne, réclamée de la même façon. */
function ligneDe(id: string, valeurs: readonly ValeursCriteres[]) {
  const ligne = lignesFaceAFace(valeurs).find((candidate) => candidate.colonne.id === id);

  if (!ligne) {
    throw new Error(`Aucune ligne pour la colonne « ${id} ».`);
  }

  return ligne;
}

/** Ce que la ligne de cette colonne met en évidence, un booléen par Bien. */
function misEnEvidence(id: string, valeurs: readonly ValeursCriteres[]): boolean[] {
  return ligneDe(id, valeurs).cases.map((donnee) => donnee.meilleure);
}

describe('meilleureValeurColonne', () => {
  it('désigne la plus petite valeur là où le plus petit est meilleur', () => {
    // Le prix le plus bas gagne : c'est le sens déclaré dans la définition
    // (#5), et la comparaison ne connaît rien d'autre (#12).
    expect(meilleureValeurColonne(colonne('prixDemande'), [250000, 190000, 310000])).toBe(190000);
  });

  it('désigne la plus grande valeur là où le plus grand est meilleur', () => {
    expect(meilleureValeurColonne(colonne('surfaceHabitable'), [72.5, 95, 60])).toBe(95);
  });

  it('ne désigne rien sur une Colonne qui ne se compare pas', () => {
    // Une ville n'est pas meilleure qu'une autre : `aucun` est le sens
    // déclaré, et la ligne paraît sans mise en évidence.
    expect(meilleureValeurColonne(colonne('villeQuartier'), ['Nantes', 'Rennes'])).toBeNull();
  });

  it('classe une énumération par son rang dans la définition, non par sa lettre', () => {
    // A vaut mieux que G, et la comparaison ne connaît pas les lettres du
    // DPE : c'est l'ordre de la définition qui porte le classement (#5).
    expect(meilleureValeurColonne(colonne('dpe'), ['D', 'B', 'F'])).toBe('B');
  });

  it('ignore les Biens qui ne renseignent pas le Critère', () => {
    // Un Critère non renseigné ne gagne ni ne perd, il est simplement
    // absent (#12).
    expect(meilleureValeurColonne(colonne('prixDemande'), [null, 250000, null])).toBe(250000);
  });

  it('ne désigne rien quand aucun Bien ne renseigne le Critère', () => {
    expect(meilleureValeurColonne(colonne('prixDemande'), [null, null])).toBeNull();
  });

  it('compare le prix au mètre carré, qui n’est pourtant pas un Critère', () => {
    // La Colonne calculée déclare son sens comme n'importe quelle autre, et
    // la comparaison la traite sans savoir qu'elle est calculée (ADR-0013).
    // C'est ce que ce ticket devait trancher : `meilleureValeur` exigeait un
    // `Critere`, que la Colonne calculée n'a pas.
    expect(meilleureValeurColonne(colonne(ID_COLONNE_PRIX_METRE_CARRE), [3448, 2900, 4100])).toBe(
      2900,
    );
  });

  it('range un NaN avec les non renseignés plutôt que de le désigner', () => {
    // Une valeur qu'on ne sait pas placer ne doit pas gagner : elle
    // fausserait toute comparaison qui la rencontrerait.
    expect(meilleureValeurColonne(colonne(ID_COLONNE_PRIX_METRE_CARRE), [Number.NaN, 2900])).toBe(
      2900,
    );
  });
});

describe('lignesFaceAFace', () => {
  it('pose une ligne par Colonne, dans l’ordre du tableau', () => {
    // Les mêmes Colonnes que le tableau, dans le même ordre : les deux
    // écrans montrent les mêmes Biens (ADR-0006), et le prix au m² se lit à
    // la suite du prix dont il sort.
    //
    // L'attente ne se compare pas à `COLONNES`, sur quoi la fonction itère :
    // ce serait une tautologie, vraie quoi qu'il arrive. Elle vérifie la
    // propriété qui compte, et que le lecteur retrouve à l'écran — le prix
    // au m² juste après le prix, et les Critères dans l'ordre de la
    // définition.
    const lignes = lignesFaceAFace([{}, {}]);
    const ids = lignes.map((ligne) => ligne.colonne.id);

    expect(ids.indexOf(ID_COLONNE_PRIX_METRE_CARRE)).toBe(ids.indexOf('prixDemande') + 1);
    expect(ids.filter((id) => id !== ID_COLONNE_PRIX_METRE_CARRE)).toEqual(
      CRITERES_ORDONNES.map((critere) => critere.id),
    );
  });

  it('porte le prix au mètre carré parmi ses lignes', () => {
    // Le critère d'acceptation le demande nommément (#12) : c'est la valeur
    // qui permet de départager deux Biens de surfaces différentes.
    expect(lignesFaceAFace([{}]).some((ligne) => ligne.colonne.id === ID_COLONNE_PRIX_METRE_CARRE))
      .toBe(true);
  });

  it('pose une case par Bien sur chaque ligne, dans l’ordre reçu', () => {
    const ligne = ligneDe('prixDemande', [{ prixDemande: 250000 }, { prixDemande: 190000 }]);

    expect(ligne.cases.map((donnee) => normaliser(donnee.texte))).toEqual([
      '250 000 €',
      '190 000 €',
    ]);
  });

  it('met en évidence le seul Bien qui porte la meilleure valeur', () => {
    expect(misEnEvidence('prixDemande', [{ prixDemande: 250000 }, { prixDemande: 190000 }])).toEqual(
      [false, true],
    );
  });

  it('met en évidence tous les Biens à égalité, sans en désigner un arbitrairement', () => {
    // Une égalité se traite en mettant les deux en évidence : départager
    // deux Biens au même prix serait une préférence inventée (#12).
    expect(
      misEnEvidence('prixDemande', [
        { prixDemande: 190000 },
        { prixDemande: 250000 },
        { prixDemande: 190000 },
      ]),
    ).toEqual([true, false, true]);
  });

  it('met en évidence deux Biens à égalité sur une énumération', () => {
    // Le chemin n'est pas celui d'un nombre : la valeur désignée est la
    // chaîne, et c'est son rang dans la définition qui départage. Deux Biens
    // au même DPE se mettent donc en évidence tous les deux (#12).
    expect(misEnEvidence('dpe', [{ dpe: 'C' }, { dpe: 'E' }, { dpe: 'C' }])).toEqual([
      true,
      false,
      true,
    ]);
  });

  it('ne met jamais en évidence un Critère non renseigné', () => {
    // Même quand tous les autres le sont : l'absence n'est pas une petite
    // valeur, et un prix absent n'est pas le moins cher du carnet (#12).
    expect(misEnEvidence('prixDemande', [{ prixDemande: null }, { prixDemande: 250000 }])).toEqual([
      false,
      true,
    ]);
  });

  it('met en évidence la seule valeur renseignée de la ligne', () => {
    // Elle est la seule comparable, et la mettre en évidence dit exactement
    // cela : c'est le seul Bien sur lequel on sait quelque chose.
    expect(misEnEvidence('prixDemande', [{ prixDemande: 250000 }, { prixDemande: null }])).toEqual([
      true,
      false,
    ]);
  });

  it('ne met rien en évidence sur une Colonne qui ne se compare pas', () => {
    expect(
      misEnEvidence('villeQuartier', [{ villeQuartier: 'Nantes' }, { villeQuartier: 'Rennes' }]),
    ).toEqual([false, false]);
  });

  it('compare le prix au mètre carré calculé de chaque Bien', () => {
    // Le plus petit prix au m² gagne, et il se calcule : le second Bien est
    // plus cher en valeur absolue mais moins cher au mètre carré.
    expect(
      misEnEvidence(ID_COLONNE_PRIX_METRE_CARRE, [
        { prixDemande: 250000, surfaceHabitable: 50 },
        { prixDemande: 300000, surfaceHabitable: 100 },
      ]),
    ).toEqual([false, true]);
  });

  it('met en évidence deux prix au mètre carré égaux que le flottant sépare', () => {
    // 250 000 / 20,2 et 750 000 / 60,6 valent le même prix au m² — mais la
    // division les sépare au dernier bit, et une égalité comparée sur la
    // valeur en désignerait alors un seul. C'est très exactement le gagnant
    // arbitraire que le ticket interdit (#12), sur des chiffres que le
    // carnet peut réellement porter.
    expect(
      misEnEvidence(ID_COLONNE_PRIX_METRE_CARRE, [
        { prixDemande: 250000, surfaceHabitable: 20.2 },
        { prixDemande: 750000, surfaceHabitable: 60.6 },
      ]),
    ).toEqual([true, true]);
  });

  it('laisse vide le prix au mètre carré d’un Bien dont la surface manque', () => {
    // La Colonne calculée reste vide dès que l'un des deux Critères manque,
    // et une case vide ne se met pas en évidence.
    expect(
      misEnEvidence(ID_COLONNE_PRIX_METRE_CARRE, [
        { prixDemande: 250000, surfaceHabitable: null },
        { prixDemande: 300000, surfaceHabitable: 100 },
      ]),
    ).toEqual([false, true]);
  });

  it('écrit les valeurs comme le tableau les écrit', () => {
    // Les mêmes Biens d'un écran à l'autre (ADR-0006) : une valeur écrite
    // autrement ici se lirait comme une donnée différente.
    expect(normaliser(ligneDe('surfaceHabitable', [{ surfaceHabitable: 72.5 }]).cases[0].texte)).toBe(
      '72,5 m²',
    );
  });

  it('marque une case non renseignée comme telle', () => {
    const ligne = ligneDe('prixDemande', [{ prixDemande: null }]);

    expect(ligne.cases[0].renseigne).toBe(false);
    expect(ligne.cases[0].meilleure).toBe(false);
  });

  it('dit d’une ligne si elle met quelque chose en évidence', () => {
    // C'est ce qui permet à l'écran d'annoncer la mise en évidence sur les
    // seules lignes qui en portent une (ADR-0005).
    const valeurs = [{ prixDemande: 250000 }, { prixDemande: 190000 }];

    expect(ligneDe('prixDemande', valeurs).compare).toBe(true);
    expect(ligneDe('villeQuartier', valeurs).compare).toBe(false);
  });

  it('ne compare pas une ligne dont aucun Bien ne porte de valeur', () => {
    // Rien n'y est mis en évidence : la ligne se lit comme celle d'une
    // Colonne qui ne se compare pas, et s'annonce de la même façon.
    expect(ligneDe('prixDemande', [{ prixDemande: null }, { prixDemande: null }]).compare).toBe(
      false,
    );
  });

  it('rend une ligne par Colonne même sans aucun Bien à comparer', () => {
    // L'écran doit rester affichable avant toute sélection : il montre ses
    // lignes vides plutôt que de disparaître.
    const lignes = lignesFaceAFace([]);

    expect(lignes).toHaveLength(COLONNES.length);
    expect(lignes.every((ligne) => ligne.cases.length === 0)).toBe(true);
    expect(lignes.every((ligne) => !ligne.compare)).toBe(true);
  });
});
