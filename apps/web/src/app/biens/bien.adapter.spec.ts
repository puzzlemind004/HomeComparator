import { describe, expect, it } from 'vitest';
import { versBien, versCreationBienApi } from './bien.adapter';
import type { BienApi } from './bien.api';

const bienApi: BienApi = {
  id: 1,
  libelle: 'le T3 avec la terrasse',
  urlAnnonce: 'https://exemple.test/annonce/1',
  createdAt: '2026-09-08T19:00:00.000+00:00',
  updatedAt: '2026-09-08T19:00:00.000+00:00',
};

describe('versBien', () => {
  it("retient les champs que l'interface affiche", () => {
    expect(versBien(bienApi)).toEqual({
      id: 1,
      libelle: 'le T3 avec la terrasse',
      urlAnnonce: 'https://exemple.test/annonce/1',
    });
  });

  it("laisse tomber les champs qu'aucun écran ne montre", () => {
    // Les dates existent côté API mais n'ont pas de place dans le modèle
    // d'affichage tant qu'elles ne sont pas affichées.
    const bien = versBien(bienApi);

    expect(bien).not.toHaveProperty('createdAt');
    expect(bien).not.toHaveProperty('updatedAt');
  });

  it("conserve l'absence d'Annonce telle quelle", () => {
    const bien = versBien({ ...bienApi, urlAnnonce: null });

    expect(bien.urlAnnonce).toBeNull();
  });
});

describe('versCreationBienApi', () => {
  it('envoie le Libellé débarrassé de ses espaces de bordure', () => {
    const creation = versCreationBienApi({
      libelle: '  le T3 avec la terrasse  ',
      urlAnnonce: '',
    });

    expect(creation.libelle).toBe('le T3 avec la terrasse');
  });

  it("omet l'URL de l'Annonce quand elle n'a pas été saisie", () => {
    // Le champ vide du formulaire veut dire « pas d'Annonce » : on ne
    // l'envoie pas plutôt que d'envoyer une chaîne vide.
    const creation = versCreationBienApi({ libelle: 'le T3', urlAnnonce: '   ' });

    expect(creation).toEqual({ libelle: 'le T3' });
  });

  it("envoie l'URL de l'Annonce quand elle est saisie", () => {
    const creation = versCreationBienApi({
      libelle: 'le T3',
      urlAnnonce: '  https://exemple.test/annonce/1  ',
    });

    expect(creation).toEqual({
      libelle: 'le T3',
      urlAnnonce: 'https://exemple.test/annonce/1',
    });
  });
});
