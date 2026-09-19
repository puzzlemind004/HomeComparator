import { describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext, signal, type Signal } from '@angular/core';
import { of, Subject, type Observable } from 'rxjs';
import { BiensPage } from './biens-page';
import { BienService } from './bien.service';
import { SelectionComparaison } from './selection.service';
import type { Bien } from './bien';
import type { ListeBiens } from './bien.service';
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
function injecteur(
  service: { lister?: (statut?: Statut) => Observable<ListeBiens> },
  maximum: number | Signal<number> = MAXIMUM_DESKTOP,
) {
  // Un nombre suffit à la plupart des tests ; ceux qui font varier la
  // largeur en cours de route passent un signal, que la page relit.
  const maximumComparaison = typeof maximum === 'number' ? () => maximum : maximum;

  return Injector.create({
    providers: [
      {
        provide: BienService,
        useValue: { lister: () => of(chargee([])), ...service },
      },
      { provide: LargeurEcran, useValue: { maximumComparaison } },
      // Le vrai service, et non un double : c'est lui qui porte la règle de
      // la sélection, et le doubler reviendrait à réécrire le plafond dans le
      // test. Un exemplaire neuf par page, de sorte qu'un test ne trouve pas
      // la sélection d'un autre.
      SelectionComparaison,
    ],
  });
}

function creerPage(
  service: { lister?: (statut?: Statut) => Observable<ListeBiens> },
  maximum: number | Signal<number> = MAXIMUM_DESKTOP,
) {
  const injector = injecteur(service, maximum);

  return runInInjectionContext(injector, () => new BiensPage());
}

const bien: Bien = unBien();

function chargee(biens: Bien[]): ListeBiens {
  return { chargee: true, biens };
}

/** Les Biens que l'API a rendus, ou `null` si la liste n'a pas pu être chargée. */
function biensCharges(liste: ListeBiens | null) {
  return liste?.chargee ? liste.biens : null;
}

describe('BiensPage', () => {
  it('affiche les Biens déjà enregistrés dès son ouverture', () => {
    const page = creerPage({ lister: () => of(chargee([bien])) });

    expect(biensCharges(page.liste())).toEqual([bien]);
  });

  it('signale une API injoignable au lieu de la faire passer pour un carnet vide', () => {
    // Sans cette distinction, l'écran annonce « Aucun Bien pour l'instant »
    // alors que les Biens sont bien en base : cela se lit comme une perte.
    const page = creerPage({ lister: () => of({ chargee: false } as ListeBiens) });

    expect(page.liste()).toEqual({ chargee: false });
    expect(biensCharges(page.liste())).toBeNull();
  });

  describe('le filtre par Statut', () => {
    it('ne filtre rien à l’ouverture', () => {
      // Ouvrir le carnet montre tous les Biens, sorties comprises : un
      // filtre par défaut cacherait des Biens sans le dire (#7).
      const page = creerPage({ lister: () => of(chargee([bien])) });

      expect(page.filtre()).toBeNull();
      expect(page.biensAffiches()).toEqual([bien]);
    });

    it('ne charge la liste qu’une fois, sans filtre', () => {
      /**
       * Le filtre part en mémoire depuis la refonte : c'est ce qui permet
       * aux pastilles de porter leur compte — « À contacter 2 » — sans un
       * appel par Statut. Six pastilles feraient six requêtes à chaque
       * ouverture, là où le carnet tient en quelques dizaines de Biens.
       */
      const demandes: (Statut | undefined)[] = [];
      const page = creerPage({
        lister: (statut) => {
          demandes.push(statut);
          return of(chargee([bien]));
        },
      });

      page.filtrer('visite');
      page.filtrer('ecarte');
      page.filtrer(null);

      expect(demandes).toEqual([undefined]);
    });

    it('ne montre que les Biens du Statut choisi', () => {
      const aVisiter: Bien = unBien({ id: 1, statut: 'aVisiter' });
      const visite: Bien = unBien({ id: 2, statut: 'visite' });
      const page = creerPage({ lister: () => of(chargee([aVisiter, visite])) });

      page.filtrer('visite');

      expect(page.filtre()).toBe('visite');
      expect(page.biensAffiches()).toEqual([visite]);
    });

    it('revient à la liste complète', () => {
      const aVisiter: Bien = unBien({ id: 1, statut: 'aVisiter' });
      const visite: Bien = unBien({ id: 2, statut: 'visite' });
      const page = creerPage({ lister: () => of(chargee([aVisiter, visite])) });

      page.filtrer('ecarte');
      page.filtrer(null);

      expect(page.filtre()).toBeNull();
      expect(page.biensAffiches()).toEqual([aVisiter, visite]);
    });

    it('garde l’ordre rendu par l’API', () => {
      // La liste est rendue triée, et c'est ce tri-là que les cartes et le
      // tableau reprennent : filtrer ne doit pas réordonner.
      const premier: Bien = unBien({ id: 1, statut: 'visite' });
      const second: Bien = unBien({ id: 2, statut: 'visite' });
      const page = creerPage({ lister: () => of(chargee([premier, second])) });

      page.filtrer('visite');

      expect(page.biensAffiches()).toEqual([premier, second]);
    });

    it('ne montre aucun Bien tant que la liste n’a pas été chargée', () => {
      // Une API muette n'est pas un carnet vide : la page le dit ailleurs,
      // et la liste affichée doit rester vide plutôt que de mentir.
      const page = creerPage({ lister: () => of({ chargee: false } as ListeBiens) });

      expect(page.biensAffiches()).toEqual([]);
    });
  });

  describe('les comptes portés par les pastilles', () => {
    it('compte les Biens de chaque Statut, et le total sous « Tous »', () => {
      /**
       * Le compte est ce que la maquette met dans la pastille, et il vaut
       * mieux qu'un ornement : « À contacter 2 » est le nombre de coups de
       * téléphone qui restent, lisible sans essayer les filtres un par un.
       */
      const page = creerPage({
        lister: () =>
          of(
            chargee([
              unBien({ id: 1, statut: 'aContacter' }),
              unBien({ id: 2, statut: 'aContacter' }),
              unBien({ id: 3, statut: 'visite' }),
            ]),
          ),
      });

      const comptes = Object.fromEntries(
        page.filtres().map(({ libelle, compte }) => [libelle, compte]),
      );

      expect(comptes['Tous']).toBe(3);
      expect(comptes['À contacter']).toBe(2);
      expect(comptes['Visité']).toBe(1);
    });

    it('propose les six Statuts, y compris ceux que personne ne porte', () => {
      /**
       * Une pastille à zéro dit « aucun Bien écarté », ce qui est une
       * réponse. La faire disparaître ferait bouger la barre à chaque
       * changement de Statut, et l'acheteur chercherait un filtre qui était
       * là la veille.
       */
      const page = creerPage({
        lister: () => of(chargee([unBien({ id: 1, statut: 'aContacter' })])),
      });

      // Les six Statuts, plus « Tous ».
      expect(page.filtres()).toHaveLength(7);
      expect(page.filtres().find(({ libelle }) => libelle === 'Écarté')?.compte).toBe(0);
    });

    it('ne propose aucune pastille tant que la liste n’a pas été chargée', () => {
      // Des pastilles toutes à zéro pendant le chargement se liraient comme
      // un carnet vide.
      const page = creerPage({ lister: () => of({ chargee: false } as ListeBiens) });

      expect(page.filtres()).toEqual([]);
    });

    it('ne compte pas ce que le filtre courant masque', () => {
      // Les comptes portent sur le carnet entier et non sur ce qui est
      // affiché : une pastille qui compterait la liste filtrée tomberait à
      // zéro partout dès qu'un filtre est posé, et ne servirait plus à
      // choisir où aller.
      const page = creerPage({
        lister: () =>
          of(
            chargee([
              unBien({ id: 1, statut: 'aContacter' }),
              unBien({ id: 2, statut: 'visite' }),
            ]),
          ),
      });

      page.filtrer('visite');

      expect(page.filtres().find(({ libelle }) => libelle === 'À contacter')?.compte).toBe(1);
    });
  });

  describe('ce que le carnet porte, en une ligne', () => {
    it('annonce le nombre de Biens et ceux qui sont à visiter', () => {
      const page = creerPage({
        lister: () =>
          of(
            chargee([
              unBien({ id: 1, statut: 'aVisiter' }),
              unBien({ id: 2, statut: 'aVisiter' }),
              unBien({ id: 3, statut: 'visite' }),
            ]),
          ),
      });

      expect(page.resume()).toBe('3 Biens · 2 à visiter');
    });

    it('tait les visites quand il n’y en a aucune', () => {
      // « 10 Biens · 0 à visiter » annoncerait un vide, là où le silence est
      // la bonne réponse.
      const page = creerPage({
        lister: () => of(chargee([unBien({ id: 1, statut: 'visite' })])),
      });

      expect(page.resume()).toBe('1 Bien');
    });

    it('ne dit rien d’un carnet vide ou pas encore chargé', () => {
      expect(creerPage({ lister: () => of(chargee([])) }).resume()).toBe('');
      expect(creerPage({ lister: () => of({ chargee: false } as ListeBiens) }).resume()).toBe('');
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
      return creerPage({ lister: () => of(chargee(biens)) }, maximum);
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
      const page = creerPage({ lister: () => liste }, MAXIMUM_MOBILE);

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
      const page = creerPage({ lister: () => of(chargee(trois)) }, maximum);

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
      const page = creerPage({ lister: () => liste }, MAXIMUM_MOBILE);

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

    it('retrouve la sélection en revenant sur la page', () => {
      // La sélection a quitté la page pour `SelectionComparaison` (#124) :
      // elle survit donc au changement d'écran, ce qui est tout l'objet du
      // déplacement — aller regarder le face-à-face ou l'export et revenir ne
      // défait pas ce qu'on avait coché.
      //
      // C'est un renversement par rapport à ce que faisait la page tant que
      // la sélection était l'un de ses signaux, et cela déplace le sort des
      // Biens supprimés : la reconstruction de la page ne les évacue plus.
      // C'est l'écran de comparaison qui les constate, sur la liste entière
      // qu'il charge — `comparaison-page.spec` le tient.
      const injector = injecteur({ lister: () => of(chargee(trois)) });

      const page = runInInjectionContext(injector, () => new BiensPage());
      page.basculerComparaison(1);

      const rouverte = runInInjectionContext(injector, () => new BiensPage());

      expect(rouverte.selection()).toEqual([1]);
    });

    it('ne compte aucun Bien masqué tant que la liste charge', () => {
      /**
       * Pendant le chargement, rien n'est masqué : tout est en route, et la
       * page le dit déjà par ailleurs. Le compte doit rester à zéro plutôt
       * que de valoir la sélection entière — ce que donnerait une
       * soustraction faite sur une liste encore vide.
       *
       * La sélection est rétablie d'une session précédente, puisqu'il n'y a
       * encore aucun Bien à cocher : c'est très exactement le cas d'un
       * carnet rouvert, et le seul où l'écart se mesure avant la réponse.
       */
      const liste = new Subject<ListeBiens>();
      const injector = injecteur({ lister: () => liste });
      const selection = injector.get(SelectionComparaison);

      selection.basculer(1);
      selection.basculer(2);

      const page = runInInjectionContext(injector, () => new BiensPage());

      expect(page.retenusMasques()).toBe(0);

      liste.next(chargee(trois));

      expect(page.retenusMasques()).toBe(0);
      expect(page.selection()).toEqual([1, 2]);
    });

    it('compte les Biens retenus que le filtre courant masque', () => {
      /**
       * Un Bien retenu que le filtre ne montre pas garde sa place (#93).
       * Sans ce compte, l'acheteur verrait sa comparaison maigrir en
       * filtrant et croirait avoir perdu une sélection intacte.
       */
      const page = pageAvec(trois);

      page.basculerComparaison(1);
      page.basculerComparaison(2);

      // Les trois Biens du jeu sont « À contacter » : le filtre « Visité »
      // les masque tous, sans rien retirer à la sélection.
      page.filtrer('visite');

      expect(page.retenusMasques()).toBe(2);
      expect(page.selection()).toEqual([1, 2]);
    });

    it('vide la comparaison sans toucher à la liste', () => {
      const page = pageAvec(trois);

      page.basculerComparaison(1);
      page.basculerComparaison(2);
      page.viderComparaison();

      expect(page.selection()).toEqual([]);
      expect(biensCharges(page.liste())).toHaveLength(3);
    });
  });
});
