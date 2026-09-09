import { describe, expect, it } from 'vitest';
import {
  CHAMPS_STATUT,
  STATUTS,
  STATUT_INITIAL,
  champsPertinents,
  estPertinent,
  libelleStatut,
  statutParValeur,
  type ChampStatut,
  type Statut,
} from './statut';
import { CRITERES } from './definition';

/**
 * Le cycle de vie et les champs qui en dépendent (#7, ADR-0002).
 *
 * Ce que ces tests tiennent, c'est la règle d'affichage : quels champs sont
 * pertinents pour un Statut donné. Les transitions elles-mêmes ne sont pas
 * ici — il n'y en a aucune à vérifier, puisqu'aucune n'est interdite, et ce
 * sont les tests fonctionnels Japa qui décrivent ce que l'API accepte.
 */

/** Le champ lié au Statut portant cet identifiant, ou une erreur de test. */
function champ(id: string): ChampStatut {
  const trouve = CHAMPS_STATUT.find((candidat) => candidat.id === id);

  if (!trouve) {
    throw new Error(`Champ lié au Statut inconnu : ${id}`);
  }

  return trouve;
}

describe('la définition des Statuts', () => {
  it('déclare les six Statuts du cycle', () => {
    expect(STATUTS.map(({ valeur }) => valeur)).toEqual([
      'aContacter',
      'aVisiter',
      'visite',
      'offreFaite',
      'ecarte',
      'vendu',
    ]);
  });

  it('commence le cycle à « À contacter »', () => {
    // Un Bien qu'on vient de repérer n'a par définition pas encore été
    // contacté (#7).
    expect(STATUT_INITIAL).toBe('aContacter');
  });

  it('distingue les quatre étapes des deux sorties', () => {
    const etapes = STATUTS.filter(({ nature }) => nature === 'etape');
    const sorties = STATUTS.filter(({ nature }) => nature === 'sortie');

    expect(etapes.map(({ valeur }) => valeur)).toEqual([
      'aContacter',
      'aVisiter',
      'visite',
      'offreFaite',
    ]);
    // Écarté est une décision de l'acheteur, Vendu un fait extérieur : les
    // deux mettent fin à la recherche, et disent des choses différentes.
    expect(sorties.map(({ valeur }) => valeur)).toEqual(['ecarte', 'vendu']);
  });

  it('donne à chaque Statut un libellé lisible', () => {
    expect(libelleStatut('aContacter')).toBe('À contacter');
    expect(libelleStatut('offreFaite')).toBe('Offre faite');
    expect(libelleStatut('ecarte')).toBe('Écarté');
  });

  it('affiche telle quelle une valeur hors définition', () => {
    // Comme `formaterValeur` sur une énumération : montrer ce qui est en
    // base vaut mieux qu'une case vide, qui se lirait « non renseigné ».
    expect(libelleStatut('aVendre')).toBe('aVendre');
  });

  it('ne trouve aucune déclaration pour une valeur inconnue', () => {
    expect(statutParValeur('aVendre')).toBeUndefined();
  });

  it('ne mêle aucun Statut à la définition des Critères', () => {
    /**
     * Le Statut n'est pas un Critère : il ne se compare pas d'un Bien à
     * l'autre, il décide de ce qui est pertinent. L'y mettre le ferait
     * apparaître comme une colonne du tableau (#10) et une question de
     * l'assistant, ce qu'il n'est ni l'un ni l'autre.
     */
    const identifiants = CRITERES.map(({ id }) => id);

    expect(identifiants).not.toContain('statut');
    for (const { id } of CHAMPS_STATUT) {
      expect(identifiants).not.toContain(id);
    }
  });
});

describe('les champs liés au Statut', () => {
  it('déclare la date de visite à partir de « À visiter »', () => {
    expect(champ('dateVisite').depuis).toBe('aVisiter');
  });

  it('déclare le montant de la dernière offre à partir de « Offre faite »', () => {
    expect(champ('montantDerniereOffre').depuis).toBe('offreFaite');
  });

  it('ne rend la date de visite pertinente qu’à partir de « À visiter »', () => {
    // Elle n'a pas de sens sur un Bien qu'on n'a pas encore contacté
    // (ADR-0002), et le formulaire n'affiche que ce qui l'est.
    const dateVisite = champ('dateVisite');

    expect(estPertinent(dateVisite, 'aContacter')).toBe(false);
    expect(estPertinent(dateVisite, 'aVisiter')).toBe(true);
    // Une fois pertinente, elle le reste : la visite a bien eu lieu, et sa
    // date continue de dire quand.
    expect(estPertinent(dateVisite, 'visite')).toBe(true);
    expect(estPertinent(dateVisite, 'offreFaite')).toBe(true);
  });

  it('ne rend le montant d’offre pertinent qu’à partir de « Offre faite »', () => {
    const montant = champ('montantDerniereOffre');

    expect(estPertinent(montant, 'aContacter')).toBe(false);
    expect(estPertinent(montant, 'aVisiter')).toBe(false);
    expect(estPertinent(montant, 'visite')).toBe(false);
    expect(estPertinent(montant, 'offreFaite')).toBe(true);
  });

  it('rend tous les champs pertinents sur une sortie', () => {
    /**
     * Un Bien écarté ou vendu a pu l'être à n'importe quel moment du cycle,
     * et ce qui avait été saisi reste consultable : écarter n'est pas
     * supprimer, et garder trace d'un refus évite de reconsidérer trois fois
     * la même annonce (#7).
     */
    for (const sortie of ['ecarte', 'vendu'] as const) {
      expect(champsPertinents(sortie).map(({ id }) => id)).toEqual([
        'dateVisite',
        'montantDerniereOffre',
      ]);
    }
  });

  it('n’affiche aucun champ au début du cycle', () => {
    // « À contacter » ne porte rien : c'est le Bien tout juste repéré, et
    // le formulaire n'a que le Libellé et les Critères à montrer.
    expect(champsPertinents('aContacter')).toEqual([]);
  });

  it('donne pour chaque Statut les champs qu’il rend pertinents', () => {
    const attendu: Record<Statut, string[]> = {
      aContacter: [],
      aVisiter: ['dateVisite'],
      visite: ['dateVisite'],
      offreFaite: ['dateVisite', 'montantDerniereOffre'],
      ecarte: ['dateVisite', 'montantDerniereOffre'],
      vendu: ['dateVisite', 'montantDerniereOffre'],
    };

    for (const { valeur } of STATUTS) {
      expect(champsPertinents(valeur).map(({ id }) => id), `pour ${valeur}`).toEqual(
        attendu[valeur],
      );
    }
  });

  it('n’affiche aucun champ pour un Statut inconnu', () => {
    // À défaut de savoir où en est le Bien, la fiche s'en tient à ce dont
    // elle est sûre plutôt que de montrer un champ sans lieu d'être.
    expect(champsPertinents('aVendre')).toEqual([]);
  });

  it('reculer dans le cycle retire le champ de l’écran, jamais sa valeur', () => {
    /**
     * La conséquence assumée d'ADR-0002, du côté qui la rend visible : ce
     * module ne dit que ce qui s'affiche. Aucune de ses fonctions ne touche
     * aux valeurs — c'est la base qui les conserve, et perdre une date de
     * visite sur un mauvais clic coûterait plus cher que d'afficher une
     * donnée hors-contexte.
     */
    const montant = champ('montantDerniereOffre');

    expect(estPertinent(montant, 'offreFaite')).toBe(true);
    expect(estPertinent(montant, 'visite')).toBe(false);
    // Et de nouveau pertinent en avançant : rien n'a été perdu en chemin.
    expect(estPertinent(montant, 'offreFaite')).toBe(true);
  });
});
