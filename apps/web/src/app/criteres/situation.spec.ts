import { describe, expect, it } from 'vitest';
import { situation } from './situation';

/**
 * Ce qu'un Bien porte à son étape, résumé pour une liste (#120).
 *
 * C'est ce qui distingue le Bien qu'on visite demain de celui dont le
 * rendez-vous n'est pas pris — deux Biens que le seul Statut « À visiter »
 * confond.
 */
describe('la situation d’un Bien', () => {
  it('annonce la visite d’un Bien à visiter', () => {
    // L'année est tue quand c'est celle en cours : « visite le 21/09 » suffit
    // pour un rendez-vous de la semaine, et c'est ce que la maquette écrit.
    const cetteAnnee = new Date().getFullYear();

    expect(situation('aVisiter', { dateVisite: `${cetteAnnee}-09-21` })).toBe('visite le 21/09');
  });

  it('garde l’année quand ce n’est pas celle en cours', () => {
    // Une visite reportée au printemps prochain se lirait sinon « 12/01 »
    // sans qu'on sache de quel janvier il s'agit.
    const anneeProchaine = new Date().getFullYear() + 1;

    expect(situation('aVisiter', { dateVisite: `${anneeProchaine}-01-12` })).toBe(
      `visite le 12/01/${anneeProchaine}`,
    );
  });

  it('annonce l’offre d’un Bien sur lequel une offre a été faite', () => {
    expect(situation('offreFaite', { montantDerniereOffre: 258000 })).toContain('offre à');
    expect(situation('offreFaite', { montantDerniereOffre: 258000 })).toContain('258');
  });

  it('retient le champ le plus avancé du cycle', () => {
    // Un Bien sur lequel une offre a été faite se résume par son offre, et
    // non par la date de la visite qui l'a précédée : c'est l'ordre de
    // CHAMPS_STATUT qui en décide.
    const texte = situation('offreFaite', {
      dateVisite: `${new Date().getFullYear()}-09-21`,
      montantDerniereOffre: 258000,
    });

    expect(texte).toContain('offre à');
    expect(texte).not.toContain('visite');
  });

  it('ne dit rien d’un Bien qu’on vient de repérer', () => {
    // L'état dans lequel un Bien passe le plus clair de son temps : ni
    // visite ni offre, et rien à en dire (#7).
    expect(situation('aContacter', {})).toBe('');
  });

  it('ne dit rien quand le champ pertinent est vide', () => {
    // Un Bien « À visiter » dont le rendez-vous n'est pas pris : c'est l'état
    // ordinaire du Bien qu'on vient d'appeler, pas un défaut.
    expect(situation('aVisiter', { dateVisite: null })).toBe('');
  });

  it('ignore un champ que le Statut ne rend pas encore pertinent', () => {
    // La valeur existe en base — reculer dans le cycle ne l'efface pas
    // (ADR-0002) —, mais elle n'a pas à paraître à cette étape.
    expect(situation('aContacter', { dateVisite: `${new Date().getFullYear()}-09-21` })).toBe('');
  });

  it('garde ce qui a été saisi sur un Bien écarté', () => {
    // Les sorties portent le rang de l'étape la plus avancée : ce qui avait
    // été noté reste lisible, et c'est tout l'intérêt de garder trace d'un
    // refus.
    const cetteAnnee = new Date().getFullYear();

    expect(situation('ecarte', { dateVisite: `${cetteAnnee}-09-21` })).toBe('visite le 21/09');
  });

  it('ne dit rien plutôt que d’annoncer une étape qu’il ne peut pas situer', () => {
    // Une date illisible ne doit pas produire « visite le  » : mieux vaut
    // se taire que d'ouvrir une phrase sans pouvoir la finir.
    expect(situation('aVisiter', { dateVisite: 'pas une date' })).toBe('');
  });

  it('ne dit rien d’un Statut qu’elle ne connaît pas', () => {
    // À défaut de savoir où en est le Bien, on s'en tient à ce dont on est
    // sûr, comme le fait `estPertinent`.
    expect(situation('inconnu', { dateVisite: `${new Date().getFullYear()}-09-21` })).toBe('');
  });
});
