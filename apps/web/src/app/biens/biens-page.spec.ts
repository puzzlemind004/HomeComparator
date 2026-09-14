import { describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext, signal, type Signal } from '@angular/core';
import { of, Subject, type Observable } from 'rxjs';
import { BiensPage } from './biens-page';
import { BienService } from './bien.service';
import { ExportService, type ExportResultat, type FormatExport } from './export.service';
import type { Bien, CreationBien } from './bien';
import type { CreationBienResultat, ListeBiens } from './bien.service';
import { unBien } from './bien.test-helper';
import type { Statut } from '../criteres/statut';
import { LargeurEcran } from '../criteres/largeur-ecran';
import { MAXIMUM_DESKTOP, MAXIMUM_MOBILE } from '../criteres/selection-comparaison';

/**
 * Le composant est construit sans TestBed : seuls ses services sont
 * injectés, et les assertions portent sur ses signaux plutôt que sur le DOM
 * rendu.
 *
 * `maximum` fixe ce que l'écran permet de comparer (#12) : les tests qui ne
 * portent pas sur la sélection prennent le plafond du bureau, qui est le cas
 * le plus permissif et ne borne donc rien par surprise.
 */
function creerPage(
  service: {
    lister?: (statut?: Statut) => Observable<ListeBiens>;
    creer?: (saisie: CreationBien) => Observable<CreationBienResultat>;
  },
  exportService: { exporter?: (format: FormatExport) => Observable<ExportResultat> } = {},
  maximum: number | Signal<number> = MAXIMUM_DESKTOP,
) {
  // Un nombre suffit à la plupart des tests ; ceux qui font varier la
  // largeur en cours de route passent un signal, que la page relit.
  const maximumComparaison = typeof maximum === 'number' ? () => maximum : maximum;

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
      {
        provide: LargeurEcran,
        useValue: { maximumComparaison },
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

  describe('la sélection pour la comparaison', () => {
    /** Trois Biens listés, de quoi éprouver le plafond du téléphone. */
    const trois = [
      unBien({ id: 1, libelle: 'anatole' }),
      unBien({ id: 2, libelle: 'bérénice' }),
      unBien({ id: 3, libelle: 'clotilde' }),
    ];

    function pageAvec(biens: Bien[], maximum = MAXIMUM_DESKTOP) {
      return creerPage({ lister: () => of(chargee(biens)) }, {}, maximum);
    }

    it('ne retient aucun Bien à l’ouverture', () => {
      // Ouvrir le carnet ne compare rien : la vue paraît sur un geste de
      // l'acheteur, jamais d'elle-même (#12).
      const page = pageAvec(trois);

      expect(page.selection()).toEqual([]);
      expect(page.comparaisonAffichee()).toBe(false);
    });

    it('retient les Biens cochés, dans l’ordre des clics', () => {
      // C'est cet ordre qui fixe celui des colonnes : le seul que l'acheteur
      // ait demandé, et le seul qui ne fasse pas bouger les colonnes déjà
      // posées quand il en ajoute une.
      const page = pageAvec(trois);

      page.basculerComparaison(3);
      page.basculerComparaison(1);

      expect(page.selection()).toEqual([3, 1]);
    });

    it('n’affiche la comparaison qu’à partir de deux Biens', () => {
      // Un Bien seul ne se compare à rien, et sa fiche est déjà là pour le
      // montrer (#12).
      const page = pageAvec(trois);

      page.basculerComparaison(1);
      expect(page.comparaisonAffichee()).toBe(false);

      page.basculerComparaison(2);
      expect(page.comparaisonAffichee()).toBe(true);
    });

    it('décoche un Bien déjà retenu', () => {
      const page = pageAvec(trois);

      page.basculerComparaison(1);
      page.basculerComparaison(2);
      page.basculerComparaison(1);

      expect(page.selection()).toEqual([2]);
    });

    it('limite la sélection à deux Biens sur mobile', () => {
      // Deux colonnes étroites restent lisibles sur un téléphone, ce qui
      // permet de trancher pendant une visite (#12, ADR-0006).
      const page = pageAvec(trois, MAXIMUM_MOBILE);

      page.basculerComparaison(1);
      page.basculerComparaison(2);
      page.basculerComparaison(3);

      expect(page.selection()).toEqual([1, 2]);
      expect(page.selectionPleine()).toBe(true);
    });

    it('laisse retirer un Bien alors même que le plafond est atteint', () => {
      // Le plafond borne l'ajout, jamais le retrait : sans quoi la sélection
      // pleine serait un cul-de-sac.
      const page = pageAvec(trois, MAXIMUM_MOBILE);

      page.basculerComparaison(1);
      page.basculerComparaison(2);
      page.basculerComparaison(1);

      expect(page.selection()).toEqual([2]);
    });

    it('en autorise davantage sur desktop', () => {
      const page = pageAvec(trois, MAXIMUM_DESKTOP);

      page.basculerComparaison(1);
      page.basculerComparaison(2);
      page.basculerComparaison(3);

      expect(page.selection()).toEqual([1, 2, 3]);
    });

    it('rend les Biens à comparer dans l’ordre de la sélection', () => {
      // Et non dans celui de la liste : c'est l'ordre des colonnes.
      const page = pageAvec(trois);

      page.basculerComparaison(3);
      page.basculerComparaison(1);

      expect(page.biensCompares().map((bien) => bien.libelle)).toEqual(['clotilde', 'anatole']);
    });

    it('garde un Bien que le filtre ne montre plus, sans lui faire de colonne', () => {
      // Un filtre est un geste de lecture, pas une décision sur la
      // comparaison (#93) : le Bien masqué garde sa place. Mais l'écran n'a
      // plus ses valeurs, donc il ne lui fait pas de colonne — il le compte.
      const liste = new Subject<ListeBiens>();
      const page = creerPage({ lister: () => liste });

      liste.next(chargee(trois));
      page.basculerComparaison(1);
      page.basculerComparaison(2);
      expect(page.selection()).toEqual([1, 2]);

      // Le filtre ne rend plus que le second.
      liste.next(chargee([trois[1]]));

      expect(page.selection()).toEqual([1, 2]);
      expect(page.biensCompares().map((bien) => bien.id)).toEqual([2]);
      expect(page.retenusMasques()).toBe(1);
    });

    it('rend les Biens masqués tels quels à l’ouverture du filtre', () => {
      const liste = new Subject<ListeBiens>();
      const page = creerPage({ lister: () => liste });

      liste.next(chargee(trois));
      page.basculerComparaison(1);
      page.basculerComparaison(2);

      liste.next(chargee([trois[1]]));
      liste.next(chargee(trois));

      expect(page.selection()).toEqual([1, 2]);
      expect(page.biensCompares().map((bien) => bien.id)).toEqual([1, 2]);
      expect(page.retenusMasques()).toBe(0);
    });

    it('ne perd pas les finalistes quand on coche pendant un filtre', () => {
      // Le scénario de #93, de bout en bout : deux finalistes cochés en vue
      // « Tous », un filtre qui les masque, un troisième Bien coché, puis
      // retour à « Tous ». Les trois sont retenus.
      const liste = new Subject<ListeBiens>();
      const page = creerPage({ lister: () => liste });

      liste.next(chargee(trois));
      page.basculerComparaison(1);
      page.basculerComparaison(2);

      // Le filtre ne montre que le troisième.
      page.filtrer('visite');
      liste.next(chargee([trois[2]]));
      page.basculerComparaison(3);

      // Retour à « Tous ».
      page.filtrer(null);
      liste.next(chargee(trois));

      expect(page.selection()).toEqual([1, 2, 3]);
      expect(page.biensCompares().map((bien) => bien.id)).toEqual([1, 2, 3]);
    });

    it('compte les Biens masqués dans le plafond', () => {
      // Un Bien retenu occupe une place, visible ou non : sans quoi jouer
      // sur les filtres ferait dépasser le maximum (#93).
      const liste = new Subject<ListeBiens>();
      const page = creerPage({ lister: () => liste }, {}, MAXIMUM_MOBILE);

      liste.next(chargee(trois));
      page.basculerComparaison(1);
      page.basculerComparaison(2);

      // Le filtre masque les deux retenus et ne montre que le troisième.
      liste.next(chargee([trois[2]]));
      expect(page.selectionPleine()).toBe(true);

      page.basculerComparaison(3);

      expect(page.selection()).toEqual([1, 2]);
    });

    it('retire pour de bon un Bien supprimé, masqué ou non', () => {
      // La suppression, elle, justifie l'abandon : le Bien ne reviendra dans
      // aucune liste, et une colonne sans valeurs n'aurait rien à montrer.
      const liste = new Subject<ListeBiens>();
      const page = creerPage({ lister: () => liste });

      liste.next(chargee(trois));
      page.basculerComparaison(1);
      page.basculerComparaison(2);

      // Le filtre masque le premier, puis il est supprimé pendant ce temps.
      liste.next(chargee([trois[1]]));
      page.oublier(1);
      liste.next(chargee(trois));

      expect(page.selection()).toEqual([2]);
      expect(page.retenusMasques()).toBe(0);
    });

    it('n’abandonne pas les Biens masqués quand un autre est supprimé', () => {
      const liste = new Subject<ListeBiens>();
      const page = creerPage({ lister: () => liste });

      liste.next(chargee(trois));
      page.basculerComparaison(1);
      page.basculerComparaison(2);

      liste.next(chargee([trois[2]]));
      page.oublier(2);

      expect(page.selection()).toEqual([1]);
      expect(page.retenusMasques()).toBe(1);
    });

    it('abandonne ce que le plafond écarte au clic suivant', () => {
      // Le plafond, lui, écarte pour de bon : la place n'existe pas, et
      // retenir des colonnes invisibles les ferait resurgir à
      // l'élargissement. Comportement inchangé par #93.
      const maximum = signal(MAXIMUM_DESKTOP);
      const page = creerPage({ lister: () => of(chargee(trois)) }, {}, maximum);

      page.basculerComparaison(1);
      page.basculerComparaison(2);
      page.basculerComparaison(3);

      // La fenêtre rétrécit : le troisième ne tient plus.
      maximum.set(MAXIMUM_MOBILE);
      expect(page.selection()).toEqual([1, 2]);

      // Le clic suivant repart de là, et le troisième est perdu.
      page.basculerComparaison(1);
      maximum.set(MAXIMUM_DESKTOP);

      expect(page.selection()).toEqual([2]);
    });

    it('garde la sélection et de quoi la vider quand le filtre ne rend rien', () => {
      // Le cas où le cul-de-sac serait complet : plafond atteint par des
      // Biens que le filtre masque tous, sur une liste filtrée **vide**.
      // La page doit continuer à dire ce qu'elle retient et à offrir la
      // sortie — le gabarit sort donc ce bloc du test sur la longueur de la
      // liste, qui l'emporterait exactement quand il sert (#93).
      const liste = new Subject<ListeBiens>();
      const page = creerPage({ lister: () => liste }, {}, MAXIMUM_MOBILE);

      liste.next(chargee(trois));
      page.basculerComparaison(1);
      page.basculerComparaison(2);

      // Le filtre ne rend aucun Bien.
      liste.next(chargee([]));

      expect(page.selection()).toEqual([1, 2]);
      expect(page.retenusMasques()).toBe(2);
      expect(page.selectionPleine()).toBe(true);
      expect(page.biensCompares()).toEqual([]);
      expect(page.comparaisonAffichee()).toBe(false);

      // La sortie fonctionne, et rend la place.
      page.viderComparaison();

      expect(page.selection()).toEqual([]);
      expect(page.selectionPleine()).toBe(false);
    });

    it('ne demande aucun geste tant qu’il reste de la place', () => {
      const page = pageAvec(trois);

      page.basculerComparaison(1);

      expect(page.instructionPlafond()).toBe('aucune');
    });

    it('demande d’en retirer un au plafond, quand ils sont tous montrés', () => {
      const page = creerPage({ lister: () => of(chargee(trois)) }, {}, MAXIMUM_MOBILE);

      page.basculerComparaison(1);
      page.basculerComparaison(2);

      expect(page.instructionPlafond()).toBe('retirer');
    });

    it('prévient que le choix est plus étroit quand une partie est masquée', () => {
      // « Retirez-en un » reste faisable, mais sur les seules cases
      // affichées : le dire évite de chercher celle qui manque (#111).
      const liste = new Subject<ListeBiens>();
      const page = creerPage({ lister: () => liste }, {}, MAXIMUM_MOBILE);

      liste.next(chargee(trois));
      page.basculerComparaison(1);
      page.basculerComparaison(2);

      // Le filtre ne montre plus que le second des deux retenus.
      liste.next(chargee([trois[1]]));

      expect(page.retenusMasques()).toBe(1);
      expect(page.instructionPlafond()).toBe('retirer-parmi-montres');
    });

    it('nomme l’ouverture du filtre et le vidage quand aucun retenu n’est montré', () => {
      // Le cas de l'impasse : plus une seule case à décocher, et
      // « Retirez-en un » désignerait un geste impossible (#111).
      const liste = new Subject<ListeBiens>();
      const page = creerPage({ lister: () => liste }, {}, MAXIMUM_MOBILE);

      liste.next(chargee(trois));
      page.basculerComparaison(1);
      page.basculerComparaison(2);

      // Le filtre ne rend que le troisième, qui n'est pas retenu.
      liste.next(chargee([trois[2]]));

      expect(page.selectionPleine()).toBe(true);
      expect(page.instructionPlafond()).toBe('ouvrir-ou-vider');
    });

    it('nomme les mêmes gestes quand le filtre ne rend rien du tout', () => {
      const liste = new Subject<ListeBiens>();
      const page = creerPage({ lister: () => liste }, {}, MAXIMUM_MOBILE);

      liste.next(chargee(trois));
      page.basculerComparaison(1);
      page.basculerComparaison(2);
      liste.next(chargee([]));

      expect(page.instructionPlafond()).toBe('ouvrir-ou-vider');
    });

    it('revient à « retirez-en un » dès que le filtre se rouvre', () => {
      const liste = new Subject<ListeBiens>();
      const page = creerPage({ lister: () => liste }, {}, MAXIMUM_MOBILE);

      liste.next(chargee(trois));
      page.basculerComparaison(1);
      page.basculerComparaison(2);
      liste.next(chargee([trois[2]]));
      expect(page.instructionPlafond()).toBe('ouvrir-ou-vider');

      liste.next(chargee(trois));

      expect(page.instructionPlafond()).toBe('retirer');
    });

    it('laisse recocher un Bien déclaré supprimé qui réapparaît', () => {
      // `oublier` retire du choix sans rien mémoriser : un appelant qui se
      // tromperait — Bien déclaré supprimé trop tôt, ou recréé depuis — ne
      // doit pas laisser une case qui ne répond plus sans que rien ne le
      // dise. C'est la panne muette que la page évite ailleurs (#93).
      const page = pageAvec(trois);

      page.basculerComparaison(1);
      page.oublier(1);
      expect(page.selection()).toEqual([]);

      page.basculerComparaison(1);

      expect(page.selection()).toEqual([1]);
    });

    it('repart d’une comparaison vide à chaque ouverture de la page', () => {
      // C'est ce qui règle le sort des Biens supprimés sans que la liste ait
      // à trancher : la suppression se joue sur la fiche (#9), qui est une
      // autre route. La page est reconstruite au retour, et rien n'y
      // survit — ni le choix, ni les Biens oubliés.
      const page = pageAvec(trois);
      page.basculerComparaison(1);

      const rouverte = pageAvec(trois);

      expect(rouverte.selection()).toEqual([]);
      expect(rouverte.retenusMasques()).toBe(0);
    });

    it('ne compte aucun Bien masqué tant que la liste charge', () => {
      // Pendant le chargement, rien n'est masqué : tout est en route, et la
      // page le dit déjà par ailleurs.
      const liste = new Subject<ListeBiens>();
      const page = creerPage({ lister: () => liste });

      liste.next(chargee(trois));
      page.basculerComparaison(1);
      page.basculerComparaison(2);

      page.filtrer('visite');

      expect(page.retenusMasques()).toBe(0);
      expect(page.selection()).toEqual([1, 2]);
    });

    it('vide la comparaison sans toucher à la liste', () => {
      const page = pageAvec(trois);

      page.basculerComparaison(1);
      page.basculerComparaison(2);
      page.viderComparaison();

      expect(page.selection()).toEqual([]);
      expect(biensAffiches(page.liste())).toHaveLength(3);
    });
  });
});
