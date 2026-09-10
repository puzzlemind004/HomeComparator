import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BienService, type FicheBien } from './bien.service';
import type { ModificationBien } from './bien';
import type { Critere, GroupeCritere } from '../criteres/critere';
import { GROUPES, criteresDuGroupe } from '../criteres/definition';
import {
  STATUTS,
  STATUT_INITIAL,
  champsPertinents,
  type ChampStatut,
  type Statut,
} from '../criteres/statut';
import { estRenseigne } from '../criteres/valeurs';
import type { ValeurCritere } from '../criteres/comparaison';
import {
  demarrer,
  passer,
  questionCourante,
  repondre,
  type Assistant,
} from '../criteres/assistant';

/** Un Critère prêt à s'afficher : sa déclaration, sa valeur, et son état. */
export interface LigneCritere {
  critere: Critere;

  /** La valeur brute, celle que le champ de saisie reçoit et renvoie. */
  valeur: ValeurCritere;

  /**
   * Vrai dès qu'une valeur a été saisie, zéro compris. C'est la distinction
   * dont l'écran tire sa mise en évidence : ce qui n'est pas renseigné est
   * ce qu'il reste à demander à l'agence (#6).
   */
  renseigne: boolean;
}

/**
 * Un champ lié au Statut, prêt à s'afficher : sa déclaration et sa valeur.
 *
 * Il n'a pas de `renseigne` à la différence d'une `LigneCritere` : ce qui
 * manque à un Bien, c'est ce qu'il reste à demander à l'agence, et une date
 * de visite non fixée n'est pas de cet ordre — elle attend le rendez-vous,
 * pas un coup de téléphone. Elle ne compte donc pas dans les Critères
 * manquants et ne se signale pas comme eux (#7).
 */
export interface LigneChampStatut {
  champ: ChampStatut;
  valeur: ValeurCritere;
}

/** Les Critères d'un groupe, prêts à s'afficher en bloc. */
export interface BlocCriteres {
  groupe: GroupeCritere;
  libelle: string;
  criteres: LigneCritere[];
}

/**
 * La fiche d'un Bien : consulter tout ce qui a été noté, et modifier
 * n'importe quel Critère à tout moment (#6).
 *
 * Le formulaire se construit depuis la définition centralisée et n'énumère
 * aucun Critère à la main (ADR-0004) : un Critère ajouté à la définition
 * apparaît ici sans que cet écran soit retouché.
 *
 * Rien n'est obligatoire et rien ne bloque : un Critère peut rester vide
 * indéfiniment (ADR-0008). Ce que la fiche fait, c'est rendre visible ce qui
 * manque — c'est cela qui dit à l'acheteur quoi demander à l'agence.
 */
@Component({
  selector: 'app-fiche-bien-page',
  imports: [FormsModule, RouterLink],
  styleUrl: './fiche-bien-page.scss',
  templateUrl: './fiche-bien-page.html',
})
export class FicheBienPage {
  private readonly bienService = inject(BienService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** L'identifiant du Bien, tel que l'adresse le porte. */
  private readonly id = Number(this.route.snapshot.paramMap.get('id'));

  /**
   * La fiche, ou l'aveu qu'on n'a pas pu la charger. `null` tant que l'API
   * n'a pas répondu : le chargement, le Bien introuvable et l'API
   * injoignable se disent différemment à l'écran.
   */
  readonly fiche = signal<FicheBien | null>(null);
  readonly erreurs = signal<string[]>([]);
  readonly enregistrement = signal(false);

  /**
   * Vrai quand la suppression a été demandée et attend d'être confirmée
   * (#9).
   *
   * Le garde-fou vit ici plutôt que dans le seul gabarit : une confirmation
   * qui ne serait qu'un bouton affiché sous condition disparaîtrait au
   * premier remaniement du HTML sans qu'aucun test s'en aperçoive, et la
   * suppression est précisément ce qui ne se rattrape pas.
   */
  readonly confirmationSuppression = signal(false);

  /**
   * Vrai le temps que l'API réponde à la suppression.
   *
   * La confirmation reste ouverte pendant ce temps : c'est elle qui porte
   * le bouton, et la refermer aussitôt ferait revenir « Supprimer ce Bien »
   * comme si rien n'avait été demandé. Sur une API lente, l'acheteur
   * n'aurait plus rien à regarder.
   */
  readonly suppression = signal(false);

  /**
   * Ce qui a empêché la suppression, affiché dans le bloc où le geste a été
   * fait plutôt qu'en tête de fiche (#9).
   *
   * Séparé d'`erreurs` parce que l'endroit compte : la suppression est en
   * bas d'une fiche longue, et un message affiché tout en haut serait hors
   * de l'écran au moment précis où il faut le lire. Sans lui, un échec ne
   * se distinguerait pas d'une réussite — le bouton reprend son état
   * initial dans les deux cas, et l'acheteur croirait le Bien supprimé.
   */
  readonly erreurSuppression = signal<string[]>([]);

  /**
   * L'assistant en cours, ou `null` quand il ne l'est pas — c'est-à-dire à
   * l'ouverture de la fiche. Il n'est jamais imposé (ADR-0008).
   */
  readonly assistant = signal<Assistant | null>(null);

  /**
   * La saisie en cours dans l'assistant, remise à vide à chaque question.
   *
   * Un champ nu plutôt qu'un signal : il n'est lu que par le gabarit qui
   * l'écrit, et aucun calcul n'en dépend.
   */
  reponse = '';

  /** Le Bien affiché, ou `undefined` tant qu'il n'y en a pas. */
  private readonly bien = computed(() => {
    const fiche = this.fiche();

    return fiche?.etat === 'chargee' ? fiche.bien : undefined;
  });

  /** Le Libellé du Bien, qui titre la fiche. */
  readonly libelle = computed(() => this.bien()?.libelle ?? '');

  readonly urlAnnonce = computed(() => this.bien()?.urlAnnonce ?? null);

  /**
   * Les Notes du Bien, ou `null` tant que rien n'y a été écrit (#8).
   *
   * Elles ne comptent pas dans `nombreManquants` et l'assistant ne les
   * demande pas (ADR-0012) : ce qui manque à un Bien, c'est ce qu'il reste à
   * demander à l'agence, et des Notes vides attendent une visite, pas un coup
   * de téléphone. C'est la même raison qui tient les champs liés au Statut
   * hors du compte (#7).
   */
  readonly notes = computed(() => this.bien()?.notes ?? null);

  /** Les six Statuts, tels que le sélecteur les propose. */
  readonly statuts = STATUTS;

  /**
   * Le Statut du Bien affiché. `STATUT_INITIAL` tant qu'il n'y a pas de
   * Bien : le sélecteur a toujours une option sélectionnée, plutôt qu'un
   * état vide qui ne correspond à aucun Statut.
   */
  readonly statut = computed<Statut>(() => this.bien()?.statut ?? STATUT_INITIAL);

  /**
   * Les champs que le Statut courant rend pertinents, avec leur valeur
   * (ADR-0002).
   *
   * Reculer dans le cycle les fait disparaître de l'écran **sans que leur
   * valeur soit effacée** : elle reste dans `champsStatut`, et réapparaît
   * telle quelle en avançant de nouveau. C'est un choix d'affichage, pas
   * une suppression — perdre une date de visite sur un mauvais clic
   * coûterait plus cher que d'afficher une donnée hors-contexte.
   */
  readonly champsStatut = computed<LigneChampStatut[]>(() => {
    const valeurs = this.bien()?.champsStatut ?? {};

    return champsPertinents(this.statut()).map((champ) => ({
      champ,
      valeur: valeurs[champ.id] ?? null,
    }));
  });

  /**
   * Les Critères groupés et ordonnés selon la définition, prêts à s'afficher.
   *
   * Un groupe sans aucun Critère déclaré ne figure pas : la fiche n'affiche
   * pas de bloc vide.
   */
  readonly groupes = computed<BlocCriteres[]>(() => {
    const criteres = this.bien()?.criteres ?? {};

    return GROUPES.map(({ groupe, libelle }) => ({
      groupe,
      libelle,
      criteres: criteresDuGroupe(groupe).map((critere) => ligne(critere, criteres[critere.id])),
    })).filter((bloc) => bloc.criteres.length > 0);
  });

  /**
   * Le nombre de Critères qu'il reste à renseigner : ce que l'acheteur a
   * encore à demander, résumé en un chiffre au-dessus de la fiche.
   */
  readonly nombreManquants = computed(
    () => this.groupes().reduce((total, { criteres }) => total + manquants(criteres), 0),
  );

  /** Le Critère sur lequel l'assistant interroge, s'il est en cours. */
  readonly questionCourante = computed(() => {
    const assistant = this.assistant();

    return assistant ? questionCourante(assistant) : undefined;
  });

  constructor() {
    this.bienService.consulter(this.id).subscribe((fiche) => this.fiche.set(fiche));
  }

  /**
   * L'enregistrement d'un seul Critère.
   *
   * Seul le champ modifié part : ce qui n'est pas transmis n'est pas touché,
   * et c'est ce qui permet de corriger une valeur sans risquer les autres.
   */
  enregistrer(champ: string, valeur: ValeurCritere): void {
    this.envoyer({ [champ]: valeur });
  }

  /**
   * Le changement de Statut, enregistré aussitôt comme n'importe quelle
   * modification.
   *
   * Aucune transition n'est vérifiée, ni ici ni à l'API : toutes sont
   * permises depuis n'importe quel état, retours arrière compris (#7). Un
   * outil personnel n'a pas à empêcher son unique utilisateur de corriger
   * un état.
   */
  changerStatut(statut: string): void {
    this.envoyer({ statut });
  }

  /** L'assistant, lancé sur les Critères manquants du Bien affiché. */
  lancerAssistant(): void {
    this.assistant.set(demarrer(this.bien()?.criteres ?? {}));
  }

  /**
   * La fin de l'assistant, à la demande ou une fois la dernière question
   * traitée. Rien n'est à enregistrer : chaque réponse l'a déjà été au
   * moment où elle a été donnée, ce qui est précisément ce qui fait
   * qu'interrompre ne perd rien.
   */
  quitterAssistant(): void {
    this.assistant.set(null);
  }

  /**
   * La réponse à la question courante, enregistrée aussitôt.
   *
   * Enregistrer au fil de l'eau plutôt qu'à la fin est ce qui rend
   * l'interruption sans conséquence : une visite s'interrompt, et la
   * réponse donnée au troisième Critère ne doit pas dépendre du quinzième.
   *
   * L'assistant n'avance **qu'une fois l'API d'accord**. Avancer d'abord
   * perdrait la réponse refusée : `repondre` inscrit la clé dans `reponses`,
   * que le parcours écarte définitivement, et la question ne reviendrait
   * jamais. L'acheteur croirait avoir saisi une valeur qui n'est nulle part
   * — précisément ce que le refus des Critères inconnus cherche à éviter.
   */
  repondreQuestion(valeur: ValeurCritere): void {
    const assistant = this.assistant();
    const question = this.questionCourante();

    if (!assistant || !question) {
      return;
    }

    // Une réponse laissée vide dit « ce Critère n'a pas de valeur » — ce
    // qui n'est pas la même chose que passer la question, où rien n'est
    // envoyé du tout.
    const saisie = typeof valeur === 'string' && valeur.trim() === '' ? null : valeur;

    this.envoyer({ [question.id]: saisie }, () => {
      this.assistant.set(repondre(assistant, saisie));
      this.reponse = '';
    });
  }

  /**
   * La question courante, laissée de côté. Rien n'est envoyé : le Critère
   * reste manquant, et la fiche continuera de le signaler.
   */
  passerQuestion(): void {
    const assistant = this.assistant();

    if (assistant) {
      this.assistant.set(passer(assistant));
      this.reponse = '';
    }
  }

  /**
   * Le premier des deux gestes de la suppression : il n'appelle pas l'API,
   * il ouvre la confirmation (#9).
   *
   * Deux gestes et non un seul parce que la suppression est définitive :
   * pas de corbeille, pas de restauration, et les sauvegardes quotidiennes
   * pour seul recours (ADR-0007). Un bouton qui supprimerait au premier
   * appui ferait de l'effleurement — celui qu'on ne remarque pas, sur une
   * fiche qu'on fait défiler au pouce — une perte de données.
   */
  demanderSuppression(): void {
    this.erreurSuppression.set([]);
    this.confirmationSuppression.set(true);
  }

  /** La suppression abandonnée, sans que rien n'ait été appelé. */
  renoncerSuppression(): void {
    this.confirmationSuppression.set(false);
    this.erreurSuppression.set([]);
  }

  /**
   * Le second geste : la suppression, pour de bon.
   *
   * Elle ne fait rien tant que le premier n'a pas eu lieu. C'est ce qui
   * rend le double appui inoffensif — le second trouve la confirmation
   * refermée — et ce qui empêche qu'un remaniement du gabarit ne branche
   * par mégarde la suppression sur un bouton toujours visible.
   *
   * Un Bien déjà disparu n'est pas traité comme un échec : l'état visé est
   * atteint, et afficher une erreur ferait s'inquiéter d'un succès. Seul
   * l'incident — l'API injoignable — retient sur la fiche, où le Bien est
   * toujours là et doit continuer de se voir.
   */
  confirmerSuppression(): void {
    // Ni sans confirmation ouverte, ni deux fois : le second appui d'un
    // double-clic trouve une suppression déjà en cours.
    if (!this.confirmationSuppression() || this.suppression()) {
      return;
    }

    this.suppression.set(true);
    this.erreurSuppression.set([]);

    this.bienService.supprimer(this.id).subscribe((resultat) => {
      this.suppression.set(false);

      if (resultat.supprime || resultat.disparu) {
        // La fiche d'un Bien supprimé n'a plus rien à montrer : y rester
        // laisserait à l'écran un Bien qui n'existe plus.
        this.confirmationSuppression.set(false);
        void this.router.navigate(['/']);
        return;
      }

      /**
       * L'échec laisse la confirmation ouverte, avec son message juste
       * au-dessous. Le Bien est toujours là, l'acheteur voulait le
       * supprimer, et le geste à refaire est celui-là même : refermer
       * l'obligerait à repartir du premier appui pour retrouver un bouton
       * qui ne dit pas ce qui a échoué.
       */
      this.erreurSuppression.set(resultat.erreurs);
    });
  }

  /**
   * L'envoi d'une modification partielle, et la reprise du Bien tel que
   * l'API le rend — et non tel qu'il a été saisi, pour qu'un écart entre les
   * deux se voie aussitôt.
   *
   * L'API rend l'instance qu'elle vient d'écrire, pas une relecture de la
   * base : une valeur que la colonne arrondit — `decimal(8, 2)` ramène
   * 72,555 à 72,56 — s'affiche ici non arrondie jusqu'au prochain
   * chargement de la fiche. L'écart est borné au dixième que la surface
   * admet, et le seul Critère décimal d'aujourd'hui est celle-ci.
   *
   * Un refus laisse le Bien affiché intact : montrer une valeur que l'API a
   * refusée ferait croire qu'elle y est. `apresEnregistrement` n'est donc
   * appelé que sur un succès — c'est ce qui retient l'assistant d'avancer
   * sur une réponse que l'API n'a pas voulue.
   */
  private envoyer(modification: ModificationBien, apresEnregistrement?: () => void): void {
    this.enregistrement.set(true);
    this.erreurs.set([]);

    this.bienService.modifier(this.id, modification).subscribe((resultat) => {
      this.enregistrement.set(false);

      if (!resultat.enregistre) {
        this.erreurs.set(resultat.erreurs);
        return;
      }

      this.fiche.set({ etat: 'chargee', bien: resultat.bien });
      apresEnregistrement?.();
    });
  }
}

/** Un Critère et sa valeur, prêts à s'afficher. */
function ligne(critere: Critere, valeur: ValeurCritere | undefined): LigneCritere {
  const valeurConnue = valeur ?? null;

  return {
    critere,
    valeur: valeurConnue,
    renseigne: estRenseigne(valeurConnue),
  };
}

/** Le nombre de Critères d'un bloc restés sans valeur. */
function manquants(criteres: readonly LigneCritere[]): number {
  return criteres.filter(({ renseigne }) => !renseigne).length;
}
