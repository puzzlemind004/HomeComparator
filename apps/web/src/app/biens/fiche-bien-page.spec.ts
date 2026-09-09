import { describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { of, type Observable } from 'rxjs';
import { FicheBienPage } from './fiche-bien-page';
import { BienService, type FicheBien, type ModificationBienResultat } from './bien.service';
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
  },
  id = '1',
) {
  const injector = Injector.create({
    providers: [
      {
        provide: BienService,
        useValue: {
          consulter: () => of<FicheBien>({ etat: 'chargee', bien: unBien() }),
          modifier: () => of<ModificationBienResultat>({ enregistre: true, bien: unBien() }),
          ...service,
        },
      },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['id', id]]) } } },
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
