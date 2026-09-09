import { describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { of, Subject, type Observable } from 'rxjs';
import { BiensPage } from './biens-page';
import { BienService } from './bien.service';
import type { Bien, CreationBien } from './bien';
import type { CreationBienResultat, ListeBiens } from './bien.service';
import { unBien } from './bien.test-helper';
import type { Statut } from '../criteres/statut';

/**
 * Le composant est construit sans TestBed : seul son service est injecté,
 * et les assertions portent sur ses signaux plutôt que sur le DOM rendu.
 */
function creerPage(service: {
  lister?: (statut?: Statut) => Observable<ListeBiens>;
  creer?: (saisie: CreationBien) => Observable<CreationBienResultat>;
}) {
  const injector = Injector.create({
    providers: [
      {
        provide: BienService,
        useValue: { lister: () => of(chargee([])), ...service },
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
});
