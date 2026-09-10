import { describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { FicheBienPage } from './fiche-bien-page';
import {
  BienService,
  type FicheBien,
  type ModificationBienResultat,
  type SuppressionBienResultat,
} from './bien.service';
import type { ModificationBien } from './bien';
import { unBien } from './bien.test-helper';

/**
 * La fiche est construite sans TestBed : son service et sa route sont
 * injectés, et les assertions portent sur ses signaux plutôt que sur le DOM.
 */
function creerFiche(
  service: {
    consulter?: (id: number) => Observable<FicheBien>;
    modifier?: (id: number, modification: ModificationBien) => Observable<ModificationBienResultat>;
    supprimer?: (id: number) => Observable<SuppressionBienResultat>;
  },
  id = '1',
  /** Les adresses vers lesquelles la fiche a navigué, quand un test les lit. */
  navigations: unknown[][] = [],
) {
  const injector = Injector.create({
    providers: [
      {
        provide: BienService,
        useValue: {
          consulter: () => of<FicheBien>({ etat: 'chargee', bien: unBien() }),
          modifier: () => of<ModificationBienResultat>({ enregistre: true, bien: unBien() }),
          supprimer: () => of<SuppressionBienResultat>({ supprime: true }),
          ...service,
        },
      },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['id', id]]) } } },
      {
        provide: Router,
        useValue: {
          navigate: (adresse: unknown[]) => {
            navigations.push(adresse);
            return Promise.resolve(true);
          },
        },
      },
    ],
  });

  return runInInjectionContext(injector, () => new FicheBienPage());
}

/** Le Bien affiché, ou `undefined` si la fiche n'a pas pu être chargée. */
function bienAffiche(fiche: FicheBienPage) {
  const etat = fiche.fiche();

  return etat?.etat === 'chargee' ? etat.bien : undefined;
}

describe('FicheBienPage', () => {
  it('charge la fiche du Bien de l’adresse dès son ouverture', () => {
    const ids: number[] = [];
    const fiche = creerFiche(
      {
        consulter: (id) => {
          ids.push(id);
          return of<FicheBien>({ etat: 'chargee', bien: unBien({ id: 7 }) });
        },
      },
      '7',
    );

    expect(ids).toEqual([7]);
    expect(bienAffiche(fiche)?.id).toBe(7);
  });

  it('signale un Bien introuvable', () => {
    const fiche = creerFiche({ consulter: () => of<FicheBien>({ etat: 'introuvable' }) });

    expect(fiche.fiche()).toEqual({ etat: 'introuvable' });
  });

  it('groupe les Critères comme la définition les déclare', () => {
    // La fiche ne les énumère pas à la main : un Critère ajouté à la
    // définition apparaît sans qu'elle soit retouchée (ADR-0004).
    const groupes = creerFiche({}).groupes();

    expect(groupes.map(({ groupe }) => groupe)).toEqual([
      'budget',
      'logement',
      'localisation',
      'confort',
    ]);
    expect(groupes.flatMap(({ criteres }) => criteres)).toHaveLength(15);
  });

  it('ordonne les Critères de chaque groupe', () => {
    const [budget] = creerFiche({}).groupes();

    expect(budget.criteres.map(({ critere }) => critere.id)).toEqual([
      'prixDemande',
      'taxeFonciere',
      'chargesCopropriete',
    ]);
  });

  it('distingue un Critère non renseigné d’un Critère à zéro', () => {
    // C'est ce qui dit à l'acheteur quoi demander à l'agence : une place de
    // stationnement notée « 0 » est une réponse, pas une question restée
    // ouverte.
    const fiche = creerFiche({
      consulter: () =>
        of<FicheBien>({
          etat: 'chargee',
          bien: unBien({ criteres: { capaciteStationnement: 0 } }),
        }),
    });

    const lignes = fiche.groupes().flatMap(({ criteres }) => criteres);
    const stationnement = lignes.find(({ critere }) => critere.id === 'capaciteStationnement');
    const prix = lignes.find(({ critere }) => critere.id === 'prixDemande');

    expect(stationnement?.renseigne).toBe(true);
    expect(prix?.renseigne).toBe(false);
  });

  it('compte les Critères qui restent à renseigner', () => {
    const fiche = creerFiche({
      consulter: () =>
        of<FicheBien>({ etat: 'chargee', bien: unBien({ criteres: { prixDemande: 250000 } }) }),
    });

    expect(fiche.nombreManquants()).toBe(14);
  });

  it('n’envoie que le Critère modifié', () => {
    // Une mise à jour partielle : les quatorze autres Critères ne doivent
    // pas transiter, et donc pas risquer d'être effacés.
    const envois: ModificationBien[] = [];
    const fiche = creerFiche({
      modifier: (_id, modification) => {
        envois.push(modification);
        return of<ModificationBienResultat>({ enregistre: true, bien: unBien() });
      },
    });

    fiche.enregistrer('prixDemande', 245000);

    expect(envois).toEqual([{ prixDemande: 245000 }]);
  });

  it('modifie le Libellé comme n’importe quel Critère', () => {
    const envois: ModificationBien[] = [];
    const fiche = creerFiche({
      modifier: (_id, modification) => {
        envois.push(modification);
        return of<ModificationBienResultat>({ enregistre: true, bien: unBien() });
      },
    });

    fiche.enregistrer('libelle', 'celui avec la cuisine refaite');

    expect(envois).toEqual([{ libelle: 'celui avec la cuisine refaite' }]);
  });

  it('remplace le Bien affiché par celui que l’API a enregistré', () => {
    // Et non par la saisie : c'est l'API qui dit ce qui est en base, et un
    // écart entre les deux se verrait immédiatement.
    const fiche = creerFiche({
      modifier: () =>
        of<ModificationBienResultat>({
          enregistre: true,
          bien: unBien({ criteres: { prixDemande: 245000 } }),
        }),
    });

    fiche.enregistrer('prixDemande', 245000);

    expect(bienAffiche(fiche)?.criteres['prixDemande']).toBe(245000);
  });

  it('affiche les messages d’un refus de l’API', () => {
    const fiche = creerFiche({
      modifier: () =>
        of<ModificationBienResultat>({
          enregistre: false,
          erreurs: ['Le Libellé est obligatoire'],
        }),
    });

    fiche.enregistrer('libelle', '');

    expect(fiche.erreurs()).toEqual(['Le Libellé est obligatoire']);
  });

  it('ne touche pas au Bien affiché quand l’enregistrement échoue', () => {
    // Montrer une valeur que l'API a refusée ferait croire qu'elle est en
    // base : la fiche doit rester sur ce qui y est réellement.
    const fiche = creerFiche({
      consulter: () =>
        of<FicheBien>({ etat: 'chargee', bien: unBien({ criteres: { prixDemande: 250000 } }) }),
      modifier: () => of<ModificationBienResultat>({ enregistre: false, erreurs: ['refus'] }),
    });

    fiche.enregistrer('prixDemande', 1);

    expect(bienAffiche(fiche)?.criteres['prixDemande']).toBe(250000);
  });

  it('affiche les Notes du Bien avec leurs sauts de ligne', () => {
    // Ce qui a été écrit se relit tel quel : une liste de travaux se lit en
    // lignes (#8).
    const notes = 'Cuisine refaite.\nChaudière à remplacer.';
    const fiche = creerFiche({
      consulter: () => of<FicheBien>({ etat: 'chargee', bien: unBien({ notes }) }),
    });

    expect(fiche.notes()).toBe(notes);
  });

  it('laisse les Notes vides sans rien signaler', () => {
    // Un Bien repéré le soir n'a pas encore été visité : des Notes vides sont
    // le cas ordinaire, et rien n'en fait un manque (ADR-0008).
    const fiche = creerFiche({});

    expect(fiche.notes()).toBeNull();
  });

  it('n’enregistre les Notes que sous leur propre champ', () => {
    const envois: ModificationBien[] = [];
    const fiche = creerFiche({
      modifier: (_id, modification) => {
        envois.push(modification);
        return of<ModificationBienResultat>({ enregistre: true, bien: unBien() });
      },
    });

    fiche.enregistrer('notes', 'Chaudière à remplacer.');

    expect(envois).toEqual([{ notes: 'Chaudière à remplacer.' }]);
  });

  it('reprend les Notes telles que l’API les a enregistrées', () => {
    const fiche = creerFiche({
      modifier: () =>
        of<ModificationBienResultat>({
          enregistre: true,
          bien: unBien({ notes: 'Chaudière à remplacer.' }),
        }),
    });

    fiche.enregistrer('notes', '  Chaudière à remplacer.  ');

    expect(fiche.notes()).toBe('Chaudière à remplacer.');
  });

  it('ne compte pas les Notes parmi les Critères à renseigner', () => {
    // Les Notes ne sont pas un Critère : ce qui manque à un Bien, c'est ce
    // qu'il reste à demander à l'agence, et des Notes vides attendent une
    // visite, pas un coup de téléphone (#8).
    const sansNotes = creerFiche({});
    const avecNotes = creerFiche({
      consulter: () =>
        of<FicheBien>({ etat: 'chargee', bien: unBien({ notes: 'Chaudière à remplacer.' }) }),
    });

    expect(sansNotes.nombreManquants()).toBe(15);
    expect(avecNotes.nombreManquants()).toBe(15);
  });

  it('oublie les erreurs précédentes à l’enregistrement suivant', () => {
    let refuse = true;
    const fiche = creerFiche({
      modifier: () =>
        of<ModificationBienResultat>(
          refuse ? { enregistre: false, erreurs: ['refus'] } : { enregistre: true, bien: unBien() },
        ),
    });

    fiche.enregistrer('libelle', '');
    refuse = false;
    fiche.enregistrer('libelle', 'le T3');

    expect(fiche.erreurs()).toEqual([]);
  });
});

describe('l’assistant depuis la fiche', () => {
  it('ne démarre pas de lui-même', () => {
    // Il n'est jamais imposé : c'est un outil disponible à tout moment
    // (ADR-0008).
    expect(creerFiche({}).assistant()).toBeNull();
  });

  it('se lance sur la première question manquante', () => {
    const fiche = creerFiche({});

    fiche.lancerAssistant();

    expect(fiche.questionCourante()?.id).toBe('prixDemande');
  });

  it('n’enchaîne que les Critères manquants', () => {
    const fiche = creerFiche({
      consulter: () =>
        of<FicheBien>({ etat: 'chargee', bien: unBien({ criteres: { prixDemande: 250000 } }) }),
    });

    fiche.lancerAssistant();

    expect(fiche.questionCourante()?.id).toBe('taxeFonciere');
  });

  it('passe une question sans rien enregistrer', () => {
    const envois: ModificationBien[] = [];
    const fiche = creerFiche({
      modifier: (_id, modification) => {
        envois.push(modification);
        return of<ModificationBienResultat>({ enregistre: true, bien: unBien() });
      },
    });

    fiche.lancerAssistant();
    fiche.passerQuestion();

    expect(fiche.questionCourante()?.id).toBe('taxeFonciere');
    expect(envois).toEqual([]);
  });

  it('enregistre chaque réponse au fil de l’assistant', () => {
    // Enregistrer au fur et à mesure est ce qui fait qu'interrompre
    // l'assistant ne perd rien de ce qui a été saisi.
    const envois: ModificationBien[] = [];
    const fiche = creerFiche({
      modifier: (_id, modification) => {
        envois.push(modification);
        return of<ModificationBienResultat>({ enregistre: true, bien: unBien() });
      },
    });

    fiche.lancerAssistant();
    fiche.repondreQuestion(250000);

    expect(envois).toEqual([{ prixDemande: 250000 }]);
  });

  it('quitte l’assistant en conservant ce qui a été saisi', () => {
    const envois: ModificationBien[] = [];
    const fiche = creerFiche({
      modifier: (_id, modification) => {
        envois.push(modification);
        return of<ModificationBienResultat>({
          enregistre: true,
          bien: unBien({ criteres: { prixDemande: 250000 } }),
        });
      },
    });

    fiche.lancerAssistant();
    fiche.repondreQuestion(250000);
    fiche.quitterAssistant();

    expect(fiche.assistant()).toBeNull();
    // La réponse était déjà partie : quitter n'annule rien.
    expect(envois).toEqual([{ prixDemande: 250000 }]);
    expect(bienAffiche(fiche)?.criteres['prixDemande']).toBe(250000);
  });

  it('se termine une fois toutes les questions traitées', () => {
    const fiche = creerFiche({});

    fiche.lancerAssistant();
    for (let restantes = 15; restantes > 0; restantes -= 1) {
      fiche.passerQuestion();
    }

    expect(fiche.questionCourante()).toBeUndefined();
  });
  it('ne perd pas une réponse que l’API refuse', () => {
    // L'assistant n'avance qu'une fois l'API d'accord. Avancer d'abord
    // écarterait définitivement la question — `repondre` inscrit la clé dans
    // `reponses` —, et l'acheteur croirait avoir saisi une valeur qui n'est
    // nulle part.
    const fiche = creerFiche({
      modifier: () =>
        of<ModificationBienResultat>({
          enregistre: false,
          erreurs: ['Le Prix demandé ne peut pas être négatif'],
        }),
    });

    fiche.lancerAssistant();
    fiche.repondreQuestion(-5);

    expect(fiche.questionCourante()?.id).toBe('prixDemande');
    expect(fiche.erreurs()).toEqual(['Le Prix demandé ne peut pas être négatif']);
  });

  it('avance une fois la réponse acceptée', () => {
    const fiche = creerFiche({
      modifier: () =>
        of<ModificationBienResultat>({
          enregistre: true,
          bien: unBien({ criteres: { prixDemande: 250000 } }),
        }),
    });

    fiche.lancerAssistant();
    fiche.repondreQuestion(250000);

    expect(fiche.questionCourante()?.id).toBe('taxeFonciere');
  });

  describe('le cycle de vie', () => {
    it('affiche le Statut du Bien', () => {
      const fiche = creerFiche({
        consulter: () => of<FicheBien>({ etat: 'chargee', bien: unBien({ statut: 'visite' }) }),
      });

      expect(fiche.statut()).toBe('visite');
    });

    it('propose les six Statuts, quel que soit l’état courant', () => {
      /**
       * Aucune transition n'est interdite : les sorties sont atteignables
       * depuis n'importe quel état, et tout retour arrière est permis (#7).
       * Un sélecteur qui n'en proposerait qu'une partie réintroduirait par
       * l'écran la contrainte que le modèle refuse.
       */
      const fiche = creerFiche({
        consulter: () => of<FicheBien>({ etat: 'chargee', bien: unBien({ statut: 'vendu' }) }),
      });

      expect(fiche.statuts.map(({ valeur }) => valeur)).toEqual([
        'aContacter',
        'aVisiter',
        'visite',
        'offreFaite',
        'ecarte',
        'vendu',
      ]);
    });

    it('enregistre un changement de Statut comme une modification partielle', () => {
      const envoyees: ModificationBien[] = [];
      const fiche = creerFiche({
        modifier: (_id, modification) => {
          envoyees.push(modification);
          return of<ModificationBienResultat>({
            enregistre: true,
            bien: unBien({ statut: 'offreFaite' }),
          });
        },
      });

      fiche.changerStatut('offreFaite');

      // Le Statut seul part : le reste du Bien n'a pas à transiter pour
      // rester en place (#6).
      expect(envoyees).toEqual([{ statut: 'offreFaite' }]);
      expect(fiche.statut()).toBe('offreFaite');
    });

    it('permet de reculer dans le cycle', () => {
      // Une offre refusée ramène le Bien à Visité (#7).
      const envoyees: ModificationBien[] = [];
      const fiche = creerFiche({
        consulter: () =>
          of<FicheBien>({ etat: 'chargee', bien: unBien({ statut: 'offreFaite' }) }),
        modifier: (_id, modification) => {
          envoyees.push(modification);
          return of<ModificationBienResultat>({
            enregistre: true,
            bien: unBien({ statut: 'visite' }),
          });
        },
      });

      fiche.changerStatut('visite');

      expect(envoyees).toEqual([{ statut: 'visite' }]);
      expect(fiche.statut()).toBe('visite');
    });

    it('laisse le Statut affiché intact quand l’API refuse', () => {
      // Montrer un Statut que l'API a refusé ferait croire qu'il y est.
      const fiche = creerFiche({
        consulter: () => of<FicheBien>({ etat: 'chargee', bien: unBien({ statut: 'visite' }) }),
        modifier: () =>
          of<ModificationBienResultat>({
            enregistre: false,
            erreurs: ['Le Statut n’est pas une étape connue du cycle'],
          }),
      });

      fiche.changerStatut('aVendre');

      expect(fiche.statut()).toBe('visite');
      expect(fiche.erreurs()).toEqual(['Le Statut n’est pas une étape connue du cycle']);
    });

    it('n’affiche aucun champ lié au Statut à « À contacter »', () => {
      // Un Bien tout juste repéré n'a ni visite ni offre à porter
      // (ADR-0002).
      const fiche = creerFiche({
        consulter: () =>
          of<FicheBien>({ etat: 'chargee', bien: unBien({ statut: 'aContacter' }) }),
      });

      expect(fiche.champsStatut()).toEqual([]);
    });

    it('affiche la date de visite à partir de « À visiter »', () => {
      const fiche = creerFiche({
        consulter: () => of<FicheBien>({ etat: 'chargee', bien: unBien({ statut: 'aVisiter' }) }),
      });

      expect(fiche.champsStatut().map(({ champ }) => champ.id)).toEqual(['dateVisite']);
    });

    it('affiche le montant d’offre à partir de « Offre faite »', () => {
      const fiche = creerFiche({
        consulter: () =>
          of<FicheBien>({ etat: 'chargee', bien: unBien({ statut: 'offreFaite' }) }),
      });

      expect(fiche.champsStatut().map(({ champ }) => champ.id)).toEqual([
        'dateVisite',
        'montantDerniereOffre',
      ]);
    });

    it('porte la valeur saisie sur un champ lié au Statut', () => {
      const fiche = creerFiche({
        consulter: () =>
          of<FicheBien>({
            etat: 'chargee',
            bien: unBien({ statut: 'aVisiter', champsStatut: { dateVisite: '2026-09-12' } }),
          }),
      });

      expect(fiche.champsStatut()[0].valeur).toBe('2026-09-12');
    });

    it('laisse la date de visite vide tant que le rendez-vous n’est pas fixé', () => {
      // « À visiter » sans date est l'état ordinaire du Bien qu'on vient
      // d'appeler (#7).
      const fiche = creerFiche({
        consulter: () => of<FicheBien>({ etat: 'chargee', bien: unBien({ statut: 'aVisiter' }) }),
      });

      expect(fiche.champsStatut()[0].valeur).toBeNull();
    });

    it('retire le champ de l’écran en reculant, sans effacer sa valeur', () => {
      /**
       * La conséquence assumée d'ADR-0002 : reculer laisse des données
       * orphelines, et on les conserve. Le champ disparaît de la fiche,
       * mais rien n'est envoyé pour le vider — la seule modification qui
       * part est celle du Statut.
       */
      const envoyees: ModificationBien[] = [];
      const fiche = creerFiche({
        consulter: () =>
          of<FicheBien>({
            etat: 'chargee',
            bien: unBien({
              statut: 'offreFaite',
              champsStatut: { dateVisite: '2026-09-12', montantDerniereOffre: 240000 },
            }),
          }),
        modifier: (_id, modification) => {
          envoyees.push(modification);
          return of<ModificationBienResultat>({
            enregistre: true,
            bien: unBien({
              statut: 'aVisiter',
              // L'API rend le Bien tel qu'elle l'a écrit : les valeurs sont
              // toujours là, c'est l'écran qui choisit de ne pas les montrer.
              champsStatut: { dateVisite: '2026-09-12', montantDerniereOffre: 240000 },
            }),
          });
        },
      });

      expect(fiche.champsStatut()).toHaveLength(2);

      fiche.changerStatut('aVisiter');

      // Le montant d'offre n'est plus à l'écran...
      expect(fiche.champsStatut().map(({ champ }) => champ.id)).toEqual(['dateVisite']);
      // ...et rien n'a été envoyé pour l'effacer.
      expect(envoyees).toEqual([{ statut: 'aVisiter' }]);
      expect(bienAffiche(fiche)?.champsStatut['montantDerniereOffre']).toBe(240000);
    });

    it('ne compte pas les champs liés au Statut parmi les Critères manquants', () => {
      /**
       * Ce qui manque à un Bien, c'est ce qu'il reste à demander à l'agence.
       * Une date de visite non fixée n'est pas de cet ordre : elle attend le
       * rendez-vous, pas un coup de téléphone. La compter gonflerait le
       * chiffre d'un Critère que l'assistant ne pourrait pas poser.
       */
      const surAVisiter = creerFiche({
        consulter: () => of<FicheBien>({ etat: 'chargee', bien: unBien({ statut: 'aVisiter' }) }),
      });
      const surAContacter = creerFiche({
        consulter: () =>
          of<FicheBien>({ etat: 'chargee', bien: unBien({ statut: 'aContacter' }) }),
      });

      expect(surAVisiter.nombreManquants()).toBe(surAContacter.nombreManquants());
    });

    it('n’affiche le Statut dans aucun bloc de Critères', () => {
      // Le Statut n'est pas un Critère : il a son propre bloc, et n'a rien
      // à faire dans « Budget » ou « Logement ».
      const fiche = creerFiche({});
      const identifiants = fiche
        .groupes()
        .flatMap(({ criteres }) => criteres.map(({ critere }) => critere.id));

      expect(identifiants).not.toContain('statut');
      expect(identifiants).not.toContain('dateVisite');
      expect(identifiants).not.toContain('montantDerniereOffre');
    });
  });
});

/**
 * La suppression définitive (#9).
 *
 * Elle ne fait pas double emploi avec le Statut Écarté : écarter garde le
 * Bien et sa raison, supprimer corrige une saisie ou un doublon. Et comme
 * elle ne se rattrape pas, tout ici tourne autour d'une seule question :
 * combien de gestes distincts séparent la fiche d'un Bien qui n'existe plus.
 */
describe('la suppression d’un Bien', () => {
  it('ne propose rien d’autre qu’un premier geste au départ', () => {
    // La confirmation n'est pas ouverte à l'ouverture de la fiche : le
    // bouton qui supprime pour de bon n'est nulle part à portée de doigt.
    const fiche = creerFiche({});

    expect(fiche.confirmationSuppression()).toBe(false);
  });

  it('demande confirmation au lieu de supprimer', () => {
    // Le premier geste n'appelle pas l'API : c'est tout ce qui sépare un
    // effleurement d'une perte de données.
    const appels: number[] = [];
    const fiche = creerFiche({
      supprimer: (id) => {
        appels.push(id);
        return of<SuppressionBienResultat>({ supprime: true });
      },
    });

    fiche.demanderSuppression();

    expect(fiche.confirmationSuppression()).toBe(true);
    expect(appels).toEqual([]);
  });

  it('renonce sans rien supprimer', () => {
    const appels: number[] = [];
    const fiche = creerFiche({
      supprimer: (id) => {
        appels.push(id);
        return of<SuppressionBienResultat>({ supprime: true });
      },
    });

    fiche.demanderSuppression();
    fiche.renoncerSuppression();

    expect(fiche.confirmationSuppression()).toBe(false);
    expect(appels).toEqual([]);
  });

  it('supprime le Bien de l’adresse une fois confirmé', () => {
    const appels: number[] = [];
    const fiche = creerFiche(
      {
        supprimer: (id) => {
          appels.push(id);
          return of<SuppressionBienResultat>({ supprime: true });
        },
      },
      '7',
    );

    fiche.demanderSuppression();
    fiche.confirmerSuppression();

    expect(appels).toEqual([7]);
  });

  it('ne supprime rien tant que la confirmation n’a pas été demandée', () => {
    /**
     * Le garde-fou tient dans le composant et non dans le seul gabarit :
     * une confirmation qui ne serait qu'un bouton caché disparaîtrait au
     * premier remaniement du HTML, sans qu'un test s'en aperçoive.
     */
    const appels: number[] = [];
    const fiche = creerFiche({
      supprimer: (id) => {
        appels.push(id);
        return of<SuppressionBienResultat>({ supprime: true });
      },
    });

    fiche.confirmerSuppression();

    expect(appels).toEqual([]);
  });

  it('ramène au carnet une fois le Bien supprimé', () => {
    // La fiche d'un Bien supprimé n'a plus rien à montrer, et y rester
    // laisserait à l'écran un Bien qui n'existe plus.
    const navigations: unknown[][] = [];
    const fiche = creerFiche({}, '1', navigations);

    fiche.demanderSuppression();
    fiche.confirmerSuppression();

    expect(navigations).toEqual([['/']]);
  });

  it('ramène au carnet quand le Bien avait déjà disparu', () => {
    // Supprimé depuis un autre onglet : l'état visé est atteint, et
    // afficher une erreur pour un Bien absent ferait s'inquiéter d'un
    // succès.
    const navigations: unknown[][] = [];
    const fiche = creerFiche(
      { supprimer: () => of<SuppressionBienResultat>({ supprime: false, disparu: true, erreurs: [] }) },
      '1',
      navigations,
    );

    fiche.demanderSuppression();
    fiche.confirmerSuppression();

    expect(navigations).toEqual([['/']]);
    expect(fiche.erreurs()).toEqual([]);
  });

  it('reste sur la fiche quand la suppression échoue', () => {
    const navigations: unknown[][] = [];
    const fiche = creerFiche(
      {
        supprimer: () =>
          of<SuppressionBienResultat>({
            supprime: false,
            disparu: false,
            erreurs: ["L'API est injoignable. Le Bien n'a pas été supprimé."],
          }),
      },
      '1',
      navigations,
    );

    fiche.demanderSuppression();
    fiche.confirmerSuppression();

    expect(navigations).toEqual([]);
    // Le Bien est toujours là : la fiche continue de le montrer.
    expect(bienAffiche(fiche)?.id).toBe(1);
  });

  it('dit dans le bloc de suppression ce qui l’a empêchée', () => {
    /**
     * Le message est porté par son propre signal, et non par celui de la
     * fiche : le geste se fait en bas d'une page longue, et `erreurs`
     * s'affiche tout en haut — hors de l'écran au moment précis où il
     * faudrait le lire. Sans cela, l'échec ressemblerait à une réussite.
     */
    const fiche = creerFiche({
      supprimer: () =>
        of<SuppressionBienResultat>({
          supprime: false,
          disparu: false,
          erreurs: ["L'API est injoignable. Le Bien n'a pas été supprimé."],
        }),
    });

    fiche.demanderSuppression();
    fiche.confirmerSuppression();

    expect(fiche.erreurSuppression()).toEqual([
      "L'API est injoignable. Le Bien n'a pas été supprimé.",
    ]);
  });

  it('laisse la confirmation ouverte sur un échec', () => {
    // Le Bien est toujours là et l'acheteur voulait le supprimer : le geste
    // à refaire est celui-là même. Refermer l'obligerait à repartir du
    // premier appui, sur un bouton qui ne dit pas ce qui a échoué.
    const fiche = creerFiche({
      supprimer: () =>
        of<SuppressionBienResultat>({
          supprime: false,
          disparu: false,
          erreurs: ['injoignable'],
        }),
    });

    fiche.demanderSuppression();
    fiche.confirmerSuppression();

    expect(fiche.confirmationSuppression()).toBe(true);
    expect(fiche.suppression()).toBe(false);
  });

  it('n’enchaîne pas deux suppressions sur un double appui', () => {
    /**
     * Deux appels d'affilée n'appellent l'API qu'une fois. Le premier laisse
     * `suppression` armé le temps de la réponse, et c'est ce drapeau — et
     * non la fermeture de la confirmation, qui n'a plus lieu sur un échec —
     * qui arrête le second.
     */
    const appels: number[] = [];
    const fiche = creerFiche({
      supprimer: (id) => {
        appels.push(id);
        // Une réponse qui n'arrive jamais : la requête est encore en vol,
        // comme pendant le double appui qu'on décrit.
        return new Observable<SuppressionBienResultat>(() => undefined);
      },
    });

    fiche.demanderSuppression();
    fiche.confirmerSuppression();
    fiche.confirmerSuppression();

    expect(appels).toEqual([1]);
    expect(fiche.suppression()).toBe(true);
  });

  it('signale la suppression en cours', () => {
    // La confirmation reste montée le temps de la réponse : la refermer
    // aussitôt ferait revenir « Supprimer ce Bien » comme si rien n'avait
    // été demandé, et l'acheteur n'aurait plus rien à regarder.
    const fiche = creerFiche({
      supprimer: () => new Observable<SuppressionBienResultat>(() => undefined),
    });

    fiche.demanderSuppression();
    fiche.confirmerSuppression();

    expect(fiche.suppression()).toBe(true);
    expect(fiche.confirmationSuppression()).toBe(true);
  });

  it('oublie le message d’un échec précédent en réessayant', () => {
    let echoue = true;
    const fiche = creerFiche({
      supprimer: () =>
        of<SuppressionBienResultat>(
          echoue
            ? { supprime: false, disparu: false, erreurs: ['injoignable'] }
            : { supprime: true },
        ),
    });

    fiche.demanderSuppression();
    fiche.confirmerSuppression();
    expect(fiche.erreurSuppression()).toEqual(['injoignable']);

    echoue = false;
    fiche.confirmerSuppression();

    expect(fiche.erreurSuppression()).toEqual([]);
  });

  it('ne supprime pas par-dessus un Critère en cours d’enregistrement', () => {
    /**
     * Les Critères s'enregistrent au `blur` : quitter un champ pour venir
     * supprimer lance les deux écritures coup sur coup. Sans ce garde, le
     * `PATCH` reviendrait sur un Bien qui n'existe plus, et son 404 — que le
     * service ne distingue pas d'une panne — s'afficherait comme « L'API est
     * injoignable » sur une fiche déjà quittée.
     */
    const appels: number[] = [];
    const fiche = creerFiche({
      // Un enregistrement qui n'a pas encore répondu : la requête est en vol.
      modifier: () => new Observable<ModificationBienResultat>(() => undefined),
      supprimer: (id) => {
        appels.push(id);
        return of<SuppressionBienResultat>({ supprime: true });
      },
    });

    fiche.enregistrer('prixDemande', 250_000);
    fiche.demanderSuppression();
    fiche.confirmerSuppression();

    expect(fiche.enregistrement()).toBe(true);
    expect(appels).toEqual([]);
  });

  it('supprime une fois le Critère enregistré', () => {
    // Le garde retient, il ne condamne pas : l'enregistrement terminé, le
    // même geste passe.
    const appels: number[] = [];
    const fiche = creerFiche({
      supprimer: (id) => {
        appels.push(id);
        return of<SuppressionBienResultat>({ supprime: true });
      },
    });

    fiche.enregistrer('prixDemande', 250_000);
    expect(fiche.enregistrement()).toBe(false);

    fiche.demanderSuppression();
    fiche.confirmerSuppression();

    expect(appels).toEqual([1]);
  });

  it('oublie le message d’un échec en renonçant', () => {
    const fiche = creerFiche({
      supprimer: () =>
        of<SuppressionBienResultat>({ supprime: false, disparu: false, erreurs: ['injoignable'] }),
    });

    fiche.demanderSuppression();
    fiche.confirmerSuppression();
    fiche.renoncerSuppression();

    expect(fiche.erreurSuppression()).toEqual([]);
    expect(fiche.confirmationSuppression()).toBe(false);
  });

  it('ne touche pas aux erreurs d’un enregistrement en cours', () => {
    /**
     * Les deux messages ont leur propre signal : un Critère refusé reste
     * affiché en tête de fiche pendant qu'une suppression échoue plus bas,
     * et l'un n'efface pas l'autre. Ils disent des choses différentes, sur
     * des gestes différents.
     */
    const fiche = creerFiche({
      modifier: () =>
        of<ModificationBienResultat>({
          enregistre: false,
          erreurs: ['Le Libellé est obligatoire'],
        }),
      supprimer: () =>
        of<SuppressionBienResultat>({ supprime: false, disparu: false, erreurs: ['injoignable'] }),
    });

    fiche.enregistrer('libelle', '');
    fiche.demanderSuppression();
    fiche.confirmerSuppression();

    expect(fiche.erreurs()).toEqual(['Le Libellé est obligatoire']);
    expect(fiche.erreurSuppression()).toEqual(['injoignable']);
  });
});
