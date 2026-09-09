import { describe, expect, it } from 'vitest';
import { versBien, versCreationBienApi, versModificationBienApi } from './bien.adapter';
import type { BienApi } from './bien.api';
import { CRITERES } from '../criteres/definition';

const bienApi: BienApi = {
  id: 1,
  libelle: 'le T3 avec la terrasse',
  urlAnnonce: 'https://exemple.test/annonce/1',
  createdAt: '2026-09-08T19:00:00.000+00:00',
  updatedAt: '2026-09-08T19:00:00.000+00:00',
};

describe('versBien', () => {
  it("retient les champs que l'interface affiche", () => {
    const bien = versBien(bienApi);

    expect(bien.id).toBe(1);
    expect(bien.libelle).toBe('le T3 avec la terrasse');
    expect(bien.urlAnnonce).toBe('https://exemple.test/annonce/1');
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

  it('porte une entrée par Critère de la définition', () => {
    // La fiche affiche une ligne par Critère déclaré : c'est la définition
    // qui commande, et non ce que la charge utile contient ce jour-là.
    const bien = versBien(bienApi);

    expect(Object.keys(bien.criteres).sort()).toEqual(CRITERES.map(({ id }) => id).sort());
  });

  it('reprend la valeur des Critères renseignés', () => {
    const bien = versBien({ ...bienApi, prixDemande: 250000, dpe: 'C' });

    expect(bien.criteres['prixDemande']).toBe(250000);
    expect(bien.criteres['dpe']).toBe('C');
  });

  it('ramène à null un Critère que l’API ne rend pas', () => {
    // « Pas encore renseigné » est ce que la fiche doit lire, et la clé
    // absente ne le dit pas plus clairement que `null` — mais elle
    // obligerait chaque écran à traiter les deux.
    expect(versBien(bienApi).criteres['prixDemande']).toBeNull();
  });

  it('ne prend pas un champ hors définition pour un Critère', () => {
    // L'API rend l'id, les dates et le propriétaire : rien de tout cela n'a
    // sa place dans la fiche.
    const bien = versBien({ ...bienApi, proprietaireId: 'unique' });

    expect(bien.criteres).not.toHaveProperty('proprietaireId');
    expect(bien.criteres).not.toHaveProperty('id');
  });

  it('conserve un Critère renseigné à zéro', () => {
    // Le piège que toute la fiche s'emploie à éviter : zéro n'est pas rien.
    const bien = versBien({ ...bienApi, capaciteStationnement: 0 });

    expect(bien.criteres['capaciteStationnement']).toBe(0);
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

describe('versModificationBienApi', () => {
  it('n’envoie que les Critères modifiés', () => {
    // C'est ce qui fait la mise à jour partielle : les Critères absents ne
    // sont pas touchés par l'API.
    expect(versModificationBienApi({ prixDemande: 245000 })).toEqual({ prixDemande: 245000 });
  });

  it('envoie null pour un Critère vidé', () => {
    // Vider un Critère est un geste à part entière : il redevient « non
    // renseigné », et l'API doit l'écrire.
    expect(versModificationBienApi({ prixDemande: null })).toEqual({ prixDemande: null });
  });

  it('ramène une saisie de texte vide à une absence de valeur', () => {
    // Le champ effacé du formulaire produit une chaîne vide : elle ne doit
    // pas s'écrire telle quelle en base, où elle passerait pour une valeur.
    expect(versModificationBienApi({ adresse: '   ' })).toEqual({ adresse: null });
  });

  it('débarrasse une saisie de texte de ses espaces de bordure', () => {
    expect(versModificationBienApi({ adresse: '  12 rue des Lilas  ' })).toEqual({
      adresse: '12 rue des Lilas',
    });
  });

  it('laisse zéro tel quel', () => {
    expect(versModificationBienApi({ capaciteStationnement: 0 })).toEqual({
      capaciteStationnement: 0,
    });
  });

  it('n’envoie rien quand rien n’a été modifié', () => {
    // L'assistant dont toutes les questions ont été passées : il n'y a rien
    // à enregistrer, et ce n'est pas une erreur.
    expect(versModificationBienApi({})).toEqual({});
  });
});
