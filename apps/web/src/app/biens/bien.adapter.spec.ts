import { describe, expect, it } from 'vitest';
import { versBien, versCreationBienApi, versModificationBienApi } from './bien.adapter';
import type { BienApi } from './bien.api';
import { CRITERES } from '../criteres/definition';
import { CHAMPS_STATUT } from '../criteres/statut';

const bienApi: BienApi = {
  id: 1,
  libelle: 'le T3 avec la terrasse',
  urlAnnonce: 'https://exemple.test/annonce/1',
  notes: null,
  // Le cycle de vie, tel que l'API le rend sur tout Bien (#7).
  statut: 'aContacter',
  dateVisite: null,
  montantDerniereOffre: null,
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

  it('reprend les Notes avec leurs sauts de ligne', () => {
    // Ce qui a été écrit doit se relire tel quel : une liste de travaux se
    // lit en lignes (#8).
    const notes = 'Cuisine refaite.\nChaudière à remplacer.';

    expect(versBien({ ...bienApi, notes }).notes).toBe(notes);
  });

  it('conserve l’absence de Notes telle quelle', () => {
    expect(versBien({ ...bienApi, notes: null }).notes).toBeNull();
  });

  it('ramène à null des Notes que l’API ne rend pas', () => {
    // Ce n'est pas un cas théorique : `GET /biens` ne rapatrie pas les Notes,
    // aucun écran de liste ne les affichant (#8). L'adapter doit donc rendre
    // un Bien de liste aussi affichable qu'un Bien de fiche.
    const sansNotes: BienApi = { ...bienApi, notes: undefined };

    expect(versBien(sansNotes).notes).toBeNull();
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

describe('versBien, le cycle de vie', () => {
  it('retient le Statut tel que l’API le rend', () => {
    const bien = versBien({ ...bienApi, statut: 'offreFaite' });

    expect(bien.statut).toBe('offreFaite');
  });

  it('porte une entrée par champ lié au Statut', () => {
    // Comme pour les Critères : c'est la déclaration qui commande, et un
    // champ que l'API ne rendrait pas arrive à `null` plutôt qu'absent.
    const bien = versBien(bienApi);

    for (const { id } of CHAMPS_STATUT) {
      expect(bien.champsStatut).toHaveProperty(id, null);
    }
  });

  it('retient la date de visite et le montant d’offre', () => {
    const bien = versBien({
      ...bienApi,
      statut: 'offreFaite',
      dateVisite: '2026-09-12',
      montantDerniereOffre: 240000,
    });

    expect(bien.champsStatut['dateVisite']).toBe('2026-09-12');
    expect(bien.champsStatut['montantDerniereOffre']).toBe(240000);
  });

  it('porte les valeurs même à une étape qui ne les montre pas', () => {
    /**
     * Reculer dans le cycle masque le champ à l'écran, jamais sa valeur
     * (ADR-0002) : l'adapter ne filtre rien, c'est la fiche qui choisit
     * d'afficher ou non. Filtrer ici perdrait la valeur à chaque
     * rechargement, ce que la base s'emploie précisément à éviter.
     */
    const bien = versBien({
      ...bienApi,
      statut: 'aContacter',
      dateVisite: '2026-09-12',
      montantDerniereOffre: 240000,
    });

    expect(bien.champsStatut['dateVisite']).toBe('2026-09-12');
    expect(bien.champsStatut['montantDerniereOffre']).toBe(240000);
  });

  it('ne mêle pas les champs liés au Statut aux Critères', () => {
    // Ils ne sont pas comparables d'un Bien à l'autre : les mettre dans
    // `criteres` les ferait apparaître en colonne du tableau (#10) et en
    // question de l'assistant.
    const bien = versBien({ ...bienApi, dateVisite: '2026-09-12' });

    expect(bien.criteres).not.toHaveProperty('dateVisite');
    expect(bien.criteres).not.toHaveProperty('montantDerniereOffre');
    expect(bien.criteres).not.toHaveProperty('statut');
  });

  it('ramène un Statut inconnu au Statut initial', () => {
    /**
     * L'API n'a pas à en produire — son validateur refuse tout ce qui n'est
     * pas une étape connue — mais les deux côtés ne partagent aucune source
     * (ADR-0010), et c'est ici que la divergence s'arrête plutôt qu'à
     * l'écran, où le sélecteur n'aurait aucune option sélectionnée.
     */
    const bien = versBien({ ...bienApi, statut: 'aVendre' });

    expect(bien.statut).toBe('aContacter');
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

  it('préserve les sauts de ligne des Notes', () => {
    // Le `trim` ne retire que les bordures : les sauts de ligne internes font
    // toute la forme du champ, où l'on liste une chose par ligne (#8).
    const notes = '  Cuisine refaite.\n\nChaudière à remplacer.  ';

    expect(versModificationBienApi({ notes })).toEqual({
      notes: 'Cuisine refaite.\n\nChaudière à remplacer.',
    });
  });

  it('ramène des Notes effacées à une absence de valeur', () => {
    // Un champ vidé de la fiche vaut « rien d'écrit », et non une chaîne vide
    // en base.
    expect(versModificationBienApi({ notes: '' })).toEqual({ notes: null });
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

  it('envoie le Statut comme n’importe quel autre champ', () => {
    // La fiche ne fait pas de cas particulier : changer de Statut est une
    // modification partielle de plus (#7).
    expect(versModificationBienApi({ statut: 'visite' })).toEqual({ statut: 'visite' });
  });

  it('envoie une date de visite vidée comme une absence de valeur', () => {
    // Un rendez-vous s'annule : la date doit pouvoir être retirée, et
    // redevenir « non fixé » plutôt que de rester fausse.
    expect(versModificationBienApi({ dateVisite: '' })).toEqual({ dateVisite: null });
  });

  describe('photo représentative', () => {
    it('traduit la première photo en adresses prêtes à s’afficher', () => {
      // La liste et les cartes ont besoin d'une photo pour reconnaître un
      // Bien d'un coup d'œil, et d'une seule (#13).
      const bien = versBien({
        ...bienApi,
        photos: [
          {
            id: 7,
            bienId: 1,
            fichier: 'abc.jpg',
            fichierVignette: 'abc.vignette.jpg',
            rang: 0,
            createdAt: '2026-09-11T10:00:00.000+00:00',
            updatedAt: '2026-09-11T10:00:00.000+00:00',
          },
        ],
      });

      expect(bien.photoRepresentative?.urlVignette).toBe('/api/biens/1/photos/7?taille=vignette');
    });

    it('rend `null` pour un Bien sans photo', () => {
      expect(versBien({ ...bienApi, photos: [] }).photoRepresentative).toBeNull();
    });

    it('rend `null` quand l’API omet la clé', () => {
      // Les deux côtés ne partagent aucune source (ADR-0010) : c'est ici que
      // la divergence s'arrête, plutôt qu'à l'écran.
      expect(versBien(bienApi).photoRepresentative).toBeNull();
    });

    it('ne prend pas les photos pour un Critère', () => {
      // L'index de `BienApi` admet le tableau de photos ; aucun Critère ne
      // s'appelle `photos`, et aucune valeur de Critère ne doit en porter.
      const bien = versBien({ ...bienApi, photos: [] });

      expect(Object.values(bien.criteres).every((valeur) => !Array.isArray(valeur))).toBe(true);
    });
  });
});
