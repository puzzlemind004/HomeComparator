import { describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { of, Subject, type Observable } from 'rxjs';
import { BiensPage } from './biens-page';
import { BienService } from './bien.service';
import { ExportService, type ExportResultat, type FormatExport } from './export.service';
import type { Bien, CreationBien } from './bien';
import type { CreationBienResultat, ListeBiens } from './bien.service';
import { unBien } from './bien.test-helper';
import type { Statut } from '../criteres/statut';

/**
 * Le composant est construit sans TestBed : seul son service est injecté,
 * et les assertions portent sur ses signaux plutôt que sur le DOM rendu.
 */
function creerPage(
  service: {
    lister?: (statut?: Statut) => Observable<ListeBiens>;
    creer?: (saisie: CreationBien) => Observable<CreationBienResultat>;
  },
  exportService: { exporter?: (format: FormatExport) => Observable<ExportResultat> } = {},
) {
  const injector = Injector.create({
    providers: [
      {
        provide: BienService,
        useValue: { lister: () => of(chargee([])), ...service },
      },
      {
        provide: ExportService,
        useValue: { exporter: () => of<ExportResultat>({ exporte: true }), ...exportService },
      },
    ],
  });

  return runInInjectionContext(injector, () => new BiensPage());
}

const bien: Bien = unBien();

function chargee(biens: Bien[]): ListeBiens {
  return { chargee: true, biens };
}

/** Les Biens affichés, ou `null` si la liste n'a pas pu être chargée. */
function biensAffiches(liste: ListeBiens | null) {
  return liste?.chargee ? liste.biens : null;
}

describe('BiensPage', () => {
  it('affiche les Biens déjà enregistrés dès son ouverture', () => {
    const page = creerPage({ lister: () => of(chargee([bien])) });

    expect(biensAffiches(page.liste())).toEqual([bien]);
  });

  it('signale une API injoignable au lieu de la faire passer pour un carnet vide', () => {
    // Sans cette distinction, l'écran annonce « Aucun Bien pour l'instant »
    // alors que les Biens sont bien en base : cela se lit comme une perte.
    const page = creerPage({ lister: () => of({ chargee: false } as ListeBiens) });

    expect(page.liste()).toEqual({ chargee: false });
    expect(biensAffiches(page.liste())).toBeNull();
  });

  it('ajoute le Bien créé en tête de liste sans recharger', () => {
    // Le Bien doit apparaître immédiatement : c'est tout l'objet de l'écran.
    const dejaLa: Bien = unBien({ id: 2, libelle: 'celui avec la cuisine refaite' });
    const page = creerPage({
      lister: () => of(chargee([dejaLa])),
      creer: () => of({ cree: true, bien }),
    });

    page.libelle.set('le T3 avec la terrasse');
    page.creer();

    expect(biensAffiches(page.liste())).toEqual([bien, dejaLa]);
  });

  it('vide le formulaire après une création réussie', () => {
    const page = creerPage({ creer: () => of({ cree: true, bien }) });

    page.libelle.set('le T3 avec la terrasse');
    page.urlAnnonce.set('https://exemple.test/annonce/1');
    page.creer();

    expect(page.libelle()).toBe('');
    expect(page.urlAnnonce()).toBe('');
  });

  it('transmet la saisie au service', () => {
    const saisies: CreationBien[] = [];
    const page = creerPage({
      creer: (saisie) => {
        saisies.push(saisie);
        return of({ cree: true, bien });
      },
    });

    page.libelle.set('le T3 avec la terrasse');
    page.urlAnnonce.set('https://exemple.test/annonce/1');
    page.creer();

    expect(saisies).toEqual([
      { libelle: 'le T3 avec la terrasse', urlAnnonce: 'https://exemple.test/annonce/1' },
    ]);
  });

  it('affiche les messages de refus sans toucher à la liste ni au formulaire', () => {
    const page = creerPage({
      creer: () => of({ cree: false, erreurs: ['Le Libellé est obligatoire'] }),
    });

    page.libelle.set('  ');
    page.creer();

    expect(page.erreurs()).toEqual(['Le Libellé est obligatoire']);
    expect(biensAffiches(page.liste())).toEqual([]);
    // La saisie est conservée : l'acheteur doit pouvoir la corriger.
    expect(page.libelle()).toBe('  ');
  });

  it('efface les messages du refus précédent à la tentative suivante', () => {
    const resultats = new Subject<CreationBienResultat>();
    const page = creerPage({ creer: () => resultats });

    page.creer();
    resultats.next({ cree: false, erreurs: ['Le Libellé est obligatoire'] });
    expect(page.erreurs()).toEqual(['Le Libellé est obligatoire']);

    page.creer();
    expect(page.erreurs()).toEqual([]);
  });

  it('ignore une seconde soumission tant que la première est en cours', () => {
    // Sans ce garde-fou, un double clic créerait deux fois le même Bien.
    let appels = 0;
    const page = creerPage({
      creer: () => {
        appels += 1;
        return new Subject<CreationBienResultat>();
      },
    });

    page.creer();
    page.creer();

    expect(appels).toBe(1);
    expect(page.enregistrement()).toBe(true);
  });

  describe('le filtre par Statut', () => {
    it('ne filtre rien à l’ouverture', () => {
      // Ouvrir le carnet montre tous les Biens, sorties comprises : un
      // filtre par défaut cacherait des Biens sans le dire (#7).
      const demandes: (Statut | undefined)[] = [];
      const page = creerPage({
        lister: (statut) => {
          demandes.push(statut);
          return of(chargee([bien]));
        },
      });

      expect(page.filtre()).toBeNull();
      expect(demandes).toEqual([undefined]);
    });

    it('demande à l’API les Biens du Statut choisi', () => {
      // Le filtre est en SQL (ADR-0004) : la liste n'a pas à voyager en
      // entier pour qu'on en regarde le quart.
      const demandes: (Statut | undefined)[] = [];
      const page = creerPage({
        lister: (statut) => {
          demandes.push(statut);
          return of(chargee([]));
        },
      });

      page.filtrer('visite');

      expect(page.filtre()).toBe('visite');
      expect(demandes).toEqual([undefined, 'visite']);
    });

    it('revient à la liste complète', () => {
      const demandes: (Statut | undefined)[] = [];
      const page = creerPage({
        lister: (statut) => {
          demandes.push(statut);
          return of(chargee([]));
        },
      });

      page.filtrer('ecarte');
      page.filtrer(null);

      expect(page.filtre()).toBeNull();
      expect(demandes).toEqual([undefined, 'ecarte', undefined]);
    });

    it('remet la liste à l’état de chargement pendant le changement', () => {
      /**
       * Sans cela, les Biens du filtre précédent restent affichés jusqu'à la
       * réponse : l'écran montrerait des Biens que le filtre courant exclut,
       * ce qui se lit comme un filtre qui ne marche pas.
       */
      const reponse = new Subject<ListeBiens>();
      const page = creerPage({
        lister: (statut) => (statut === undefined ? of(chargee([bien])) : reponse),
      });

      expect(biensAffiches(page.liste())).toEqual([bien]);

      page.filtrer('visite');
      expect(page.liste()).toBeNull();

      reponse.next(chargee([]));
      expect(biensAffiches(page.liste())).toEqual([]);
    });

    it('ajoute le Bien créé quand la liste n’est pas filtrée', () => {
      const cree: Bien = unBien({ id: 3, libelle: 'le T2 près du parc' });
      const page = creerPage({
        lister: () => of(chargee([])),
        creer: () => of({ cree: true, bien: cree }),
      });

      page.creer();

      expect(biensAffiches(page.liste())).toEqual([cree]);
    });

    it('n’ajoute pas le Bien créé à une liste filtrée sur un autre Statut', () => {
      /**
       * Un Bien créé est « À contacter » (#7) : l'ajouter à une liste
       * « Visité » y ferait figurer un Bien que le filtre exclut, et le
       * prochain chargement le ferait disparaître sans explication.
       */
      const cree: Bien = unBien({ id: 3, statut: 'aContacter' });
      const page = creerPage({
        lister: () => of(chargee([])),
        creer: () => of({ cree: true, bien: cree }),
      });

      page.filtrer('visite');
      page.creer();

      expect(biensAffiches(page.liste())).toEqual([]);
    });

    it('dit que le Bien créé est enregistré même s’il sort du filtre', () => {
      /**
       * Le défaut que ce test tient : sans un mot, un enregistrement réussi
       * et un échec se ressemblent trait pour trait — le formulaire se
       * vide, la liste ne bouge pas. Le geste naturel est de ressaisir,
       * donc de créer un doublon d'un Bien déjà en base.
       *
       * Vérifier que la liste reste vide ne suffisait pas : c'est le
       * symptôme, pas la règle. Ce qui compte est ce que l'écran *dit*.
       */
      const cree: Bien = unBien({ id: 3, libelle: 'le studio du bas', statut: 'aContacter' });
      const page = creerPage({
        lister: () => of(chargee([])),
        creer: () => of({ cree: true, bien: cree }),
      });

      page.filtrer('visite');
      page.creer();

      const message = page.message();
      expect(message).toBeTruthy();
      // Le Libellé, pour que l'acheteur reconnaisse le Bien qu'il vient de
      // saisir, et l'étape où le retrouver.
      expect(message).toContain('le studio du bas');
      expect(message).toContain('À contacter');
    });

    it('ne dit rien de particulier quand le Bien créé rejoint la liste', () => {
      // Le Bien est là, sous les yeux : un message en plus serait du bruit.
      const cree: Bien = unBien({ id: 3, statut: 'aContacter' });
      const page = creerPage({
        lister: () => of(chargee([])),
        creer: () => of({ cree: true, bien: cree }),
      });

      page.creer();

      expect(page.message()).toBeNull();
    });

    it('retire le message en changeant de filtre', () => {
      // Le message parle du filtre courant : il n'a plus de sens sous un
      // autre, et resterait à l'écran comme un reproche sans objet.
      const cree: Bien = unBien({ id: 3, statut: 'aContacter' });
      const page = creerPage({
        lister: () => of(chargee([])),
        creer: () => of({ cree: true, bien: cree }),
      });

      page.filtrer('visite');
      page.creer();
      expect(page.message()).toBeTruthy();

      page.filtrer('aContacter');

      expect(page.message()).toBeNull();
    });

    it('abandonne le chargement précédent quand le filtre change deux fois', () => {
      /**
       * Deux clics rapprochés lancent deux appels, et rien ne garantit
       * qu'ils reviennent dans l'ordre. Sans abandon du premier, la réponse
       * la plus lente écrase la plus récente : l'écran montre les Biens
       * d'un Statut sous la pastille d'un autre.
       */
      const lent = new Subject<ListeBiens>();
      const rapide = new Subject<ListeBiens>();
      const ecarte: Bien = unBien({ id: 4, libelle: 'écarté', statut: 'ecarte' });
      const page = creerPage({
        lister: (statut) => {
          if (statut === undefined) return of(chargee([]));
          return statut === 'visite' ? lent : rapide;
        },
      });

      page.filtrer('visite');
      page.filtrer('ecarte');

      // La seconde réponse arrive d'abord, et s'affiche.
      rapide.next(chargee([ecarte]));
      expect(biensAffiches(page.liste())).toEqual([ecarte]);

      // La première arrive en retard : elle a été abandonnée, et ne doit
      // pas remplacer ce que le filtre courant a rendu.
      lent.next(chargee([unBien({ id: 5, libelle: 'visité', statut: 'visite' })]));

      expect(biensAffiches(page.liste())).toEqual([ecarte]);
    });

    it('ajoute le Bien créé à une liste filtrée sur son propre Statut', () => {
      const cree: Bien = unBien({ id: 3, statut: 'aContacter' });
      const page = creerPage({
        lister: () => of(chargee([])),
        creer: () => of({ cree: true, bien: cree }),
      });

      page.filtrer('aContacter');
      page.creer();

      expect(biensAffiches(page.liste())).toEqual([cree]);
    });
  });

  /**
   * L'export du carnet, déclenché depuis cet écran (#14).
   *
   * Tout est saisi à la main (ADR-0001) : l'export sert à sortir ses données
   * vers un tableur, et à ne pas se sentir prisonnier de l'outil (ADR-0007).
   * L'écran n'en fabrique rien — c'est l'API qui rend le fichier — mais il
   * doit dire ce qui se passe, et surtout quand cela échoue.
   */
  describe('export', () => {
    it('demande le format choisi', () => {
      const formats: FormatExport[] = [];
      const page = creerPage(
        {},
        {
          exporter: (format) => {
            formats.push(format);
            return of<ExportResultat>({ exporte: true });
          },
        },
      );

      page.exporter('csv');
      page.exporter('json');

      expect(formats).toEqual(['csv', 'json']);
    });

    /**
     * Un export réussi ne laisse rien à l'écran : le fichier est chez
     * l'acheteur, et son navigateur le lui a déjà annoncé. Un message de
     * plus ferait du bruit pour une chose déjà dite.
     */
    it('ne dit rien d’un export réussi', () => {
      const page = creerPage({}, { exporter: () => of<ExportResultat>({ exporte: true }) });

      page.exporter('json');

      expect(page.erreurExport()).toBeNull();
      expect(page.export()).toBeNull();
    });

    /**
     * Un échec, lui, se dit. Sans message, l'acheteur croirait tenir une
     * copie de son carnet alors que rien n'a été produit — et ne s'en
     * apercevrait que le jour où il en aurait besoin.
     */
    it('annonce un export qui n’a pas abouti', () => {
      const page = creerPage(
        {},
        {
          exporter: () => of<ExportResultat>({ exporte: false, erreur: "L'API est injoignable." }),
        },
      );

      page.exporter('csv');

      expect(page.erreurExport()).toBe("L'API est injoignable.");
    });

    /**
     * Le format en cours pendant la demande : c'est ce qui désactive les
     * boutons et dit lequel des deux travaille. Un carnet bien rempli met
     * un instant à sortir, et deux clics impatients lanceraient deux
     * téléchargements.
     */
    it('retient le format en cours pendant la demande', () => {
      const reponses = new Subject<ExportResultat>();
      const page = creerPage({}, { exporter: () => reponses });

      page.exporter('csv');
      expect(page.export()).toBe('csv');

      reponses.next({ exporte: true });
      expect(page.export()).toBeNull();
    });

    it('ignore un second clic tant que le premier n’a pas rendu', () => {
      let appels = 0;
      const reponses = new Subject<ExportResultat>();
      const page = creerPage(
        {},
        {
          exporter: () => {
            appels += 1;
            return reponses;
          },
        },
      );

      page.exporter('csv');
      page.exporter('json');

      expect(appels).toBe(1);
    });

    /**
     * Une erreur d'export précédente disparaît quand on réessaie : la
     * laisser afficher pendant la nouvelle tentative ferait lire l'échec
     * d'hier comme celui d'aujourd'hui.
     */
    it('efface l’erreur précédente à la nouvelle tentative', () => {
      const reponses = new Subject<ExportResultat>();
      const page = creerPage({}, { exporter: () => reponses });

      page.exporter('csv');
      reponses.next({ exporte: false, erreur: 'Raté.' });
      expect(page.erreurExport()).toBe('Raté.');

      page.exporter('csv');
      expect(page.erreurExport()).toBeNull();
    });
  });
});
