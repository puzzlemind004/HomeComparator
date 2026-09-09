import { describe, expect, it } from 'vitest';
import { meilleureValeur, prixAuMetreCarre } from './comparaison';
import { critere } from './critere.test-helper';
import type { Critere } from './critere';

const prix = critere('prixDemande');
const surface = critere('surfaceHabitable');
const dpe = critere('dpe');
const exterieur = critere('exterieur');
const travaux = critere('travauxAPrevoir');
const villeQuartier = critere('villeQuartier');

describe('meilleureValeur', () => {
  it('désigne la plus basse quand le plus petit est meilleur', () => {
    expect(meilleureValeur(prix, [250000, 190000, 310000])).toBe(190000);
  });

  it('désigne la plus haute quand le plus grand est meilleur', () => {
    expect(meilleureValeur(surface, [72.5, 88, 64])).toBe(88);
  });

  it("ne désigne rien quand le Critère n'a pas de sens de comparaison", () => {
    // Une ville n'est pas meilleure qu'une autre : la mettre en évidence
    // laisserait croire à un classement qui n'existe pas.
    expect(meilleureValeur(villeQuartier, ['Nantes', 'Rennes'])).toBeNull();
  });

  it('ignore les Critères non renseignés', () => {
    // Un Critère absent ne gagne ni ne perd (#12) : le rabattre sur zéro le
    // ferait gagner à tous les coups sur un prix.
    expect(meilleureValeur(prix, [null, 250000, null, 190000])).toBe(190000);
  });

  it('ne désigne rien quand aucun Bien ne renseigne le Critère', () => {
    expect(meilleureValeur(prix, [null, null])).toBeNull();
  });

  it('ne désigne rien sur une liste vide', () => {
    expect(meilleureValeur(prix, [])).toBeNull();
  });

  it('rend la valeur commune quand plusieurs Biens sont à égalité', () => {
    // L'égalité se traite sans désigner arbitrairement un gagnant (#12) :
    // la fonction rend la valeur, à charge de l'écran de mettre en évidence
    // tous les Biens qui la portent.
    expect(meilleureValeur(prix, [190000, 250000, 190000])).toBe(190000);
  });

  it('classe une énumération ordonnée selon le rang de ses valeurs', () => {
    // A vaut mieux que D, et ce n'est ni l'ordre alphabétique ni une
    // comparaison de chaînes : c'est le rang dans la définition.
    expect(meilleureValeur(dpe, ['D', 'A', 'F'])).toBe('A');
  });

  it('classe une énumération dont le meilleur est le dernier rang', () => {
    expect(meilleureValeur(exterieur, ['balcon', 'jardin', 'aucun'])).toBe('jardin');
  });

  it('range les travaux du moins lourd au plus lourd', () => {
    expect(meilleureValeur(travaux, ['lourds', 'rafraichissement', 'importants'])).toBe(
      'rafraichissement',
    );
  });

  it("ignore une valeur d'énumération absente de la définition", () => {
    // Une valeur écrite en base hors de la définition n'a pas de rang :
    // la classer au hasard vaudrait moins que de ne pas la classer.
    expect(meilleureValeur(dpe, ['inconnue', 'C'])).toBe('C');
  });

  it('ne désigne rien quand aucune valeur ne figure dans la définition', () => {
    expect(meilleureValeur(dpe, ['inconnue', 'autre-inconnue'])).toBeNull();
  });

  it('classe un oui/non selon le sens déclaré', () => {
    // Aucun des quinze Critères n'est un booléen aujourd'hui ; la
    // comparaison sait en traiter un pour que le premier ajouté — ascenseur,
    // cave, garage — n'oblige pas à revenir ici.
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

    expect(meilleureValeur(ascenseur, [false, true, false])).toBe(true);
    expect(meilleureValeur(ascenseur, [false, false])).toBe(false);
    expect(meilleureValeur(ascenseur, [null, false])).toBe(false);
  });

  it("ignore un oui/non arrivé sur un Critère qui n'en attend pas", () => {
    // C'est le `type` déclaré qui commande, pas la valeur reçue : sinon un
    // booléen prendrait le rang 1 et gagnerait contre n'importe quel prix.
    expect(meilleureValeur(prix, [true, 250000])).toBe(250000);
  });

  it('ignore un nombre qui ne se compare pas', () => {
    expect(meilleureValeur(prix, [Number.NaN, 250000])).toBe(250000);
    expect(meilleureValeur(prix, [Number.NaN])).toBeNull();
  });
});

describe('prixAuMetreCarre', () => {
  it('divise le prix par la surface', () => {
    expect(prixAuMetreCarre(250000, 72.5)).toBeCloseTo(3448.2758, 3);
  });

  it('rend une valeur absente quand le prix manque', () => {
    expect(prixAuMetreCarre(null, 72.5)).toBeNull();
  });

  it('rend une valeur absente quand la surface manque', () => {
    expect(prixAuMetreCarre(250000, null)).toBeNull();
  });

  it('rend une valeur absente quand les deux manquent', () => {
    expect(prixAuMetreCarre(null, null)).toBeNull();
  });

  it('rend une valeur absente sur une surface nulle plutôt que de diviser par zéro', () => {
    // Une surface à zéro est une saisie erronée, pas un prix au m² infini.
    expect(prixAuMetreCarre(250000, 0)).toBeNull();
  });

  it('rend une valeur absente sur une surface négative', () => {
    expect(prixAuMetreCarre(250000, -10)).toBeNull();
  });

  it('rend une valeur absente sur un prix négatif', () => {
    // Un prix négatif n'est pas une bonne affaire, c'est une saisie erronée :
    // sur un Critère où le plus petit est le meilleur, il serait désigné
    // comme le meilleur prix au m² du carnet.
    expect(prixAuMetreCarre(-250000, 72.5)).toBeNull();
  });

  it('rend une valeur absente sur un nombre qui ne se compare pas', () => {
    // `NaN <= 0` vaut `false` : un garde qui ne testerait que le signe
    // laisserait passer un `NaN`, qui s'écrirait ensuite « NaN » à l'écran.
    expect(prixAuMetreCarre(250000, Number.NaN)).toBeNull();
    expect(prixAuMetreCarre(Number.NaN, 72.5)).toBeNull();
    expect(prixAuMetreCarre(Number.POSITIVE_INFINITY, 72.5)).toBeNull();
    expect(prixAuMetreCarre(250000, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('accepte un prix à zéro, qui reste une valeur saisie', () => {
    // Zéro n'est pas une erreur de saisie : c'est un prix, et il vaut un
    // prix au m² de zéro plutôt qu'une valeur absente.
    expect(prixAuMetreCarre(0, 72.5)).toBe(0);
  });
});
