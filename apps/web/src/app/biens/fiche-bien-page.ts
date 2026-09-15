import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BienService, type FicheBien } from './bien.service';
import { GaleriePhotos } from './galerie-photos';
import { CarrouselCommentaires } from './carrousel-commentaires';
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
import { completude, estRenseigne, type Completude } from '../criteres/valeurs';
import type { ValeurCritere } from '../criteres/comparaison';
import {
  demarrer,
  passer,
  progression,
  questionCourante,
  questionsSuivantes,
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
  imports: [FormsModule, RouterLink, GaleriePhotos, CarrouselCommentaires],
  styleUrl: './fiche-bien-page.scss',
  templateUrl: './fiche-bien-page.html',
})
export class FicheBienPage {
  private readonly bienService = inject(BienService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /**
   * L'identifiant du Bien, tel que l'adresse le porte.
   *
   * Lisible depuis le gabarit, qui le passe à la galerie de photos : celle-ci
   * charge et envoie pour son propre compte (#13), les photos n'étant pas un
   * champ du Bien mais une collection à côté.
   */
  readonly id = Number(this.route.snapshot.paramMap.get('id'));

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
  readonly nombreManquants = computed(() =>
    this.groupes().reduce((total, { criteres }) => total + manquants(criteres), 0),
  );

  /**
   * Où en est la saisie de ce Bien, que la jauge de l'encart affiche.
   *
   * Elle dit la même chose que `nombreManquants` par l'autre bout — ce qui
   * est fait plutôt que ce qui reste —, et c'est ce que l'acheteur veut voir
   * en ouvrant la fiche : un carnet qui avance. Le compte seul ne le dit pas,
   * puisqu'il décroît.
   *
   * Elle sort de `completude` et non d'un calcul local : les cartes montrent
   * la même barre (#11), et deux calculs auraient fini par se contredire sur
   * un même Bien au premier Critère ajouté (ADR-0004).
   */
  readonly completude = computed(() => completude(this.bien()?.criteres ?? {}));

  /** Le Critère sur lequel l'assistant interroge, s'il est en cours. */
  readonly questionCourante = computed(() => {
    const assistant = this.assistant();

    return assistant ? questionCourante(assistant) : undefined;
  });

  /**
   * Les questions qui suivent celle posée, annoncées sous les réponses
   * (#121).
   *
   * Elles servent à anticiper : lire « surface habitable » pendant qu'on
   * répond au prix fait chercher le chiffre sur l'annonce avant que la
   * question n'arrive. C'est pourquoi ce sont les libellés qui s'affichent
   * et non un décompte — « encore deux » ne prépare à rien.
   *
   * Vide hors assistant comme sur la dernière question : l'écran n'a alors
   * rien à promettre.
   */
  readonly questionsSuivantes = computed<readonly Critere[]>(() => {
    const assistant = this.assistant();

    return assistant ? questionsSuivantes(assistant) : [];
  });

  /**
   * Ce qui vient après, en une phrase : « Question suivante : taxe foncière,
   * puis charges de copropriété. » (#121)
   *
   * Chaîne vide sur la dernière question comme hors assistant, ce que le
   * gabarit traite en n'affichant rien : « Question suivante : » sans suite
   * serait une promesse non tenue, et c'est exactement ce que la dernière
   * question ne doit pas faire.
   *
   * La phrase est calculée ici et non assemblée dans le gabarit : une
   * virgule, un « puis » et un point s'écrivent mal en interpolations, et
   * surtout ne se vérifient pas — c'est la phrase entière qui se lit, pas
   * ses morceaux.
   */
  readonly annonceDeLaSuite = computed(() => {
    const suivantes = this.questionsSuivantes();

    if (suivantes.length === 0) {
      return '';
    }

    const [premiere, ...ensuite] = suivantes.map(({ libelle }) => enTeteDePhrase(libelle));

    return `Question suivante : ${[premiere, ...ensuite].join(', puis ')}.`;
  });

  /**
   * Où en est la saisie pendant l'assistant, pour la jauge et le compte que
   * son écran affiche (#121).
   *
   * Elle suit les valeurs que l'assistant tient à jour plutôt que le Bien
   * chargé : chaque réponse la fait avancer sur-le-champ. Hors assistant,
   * elle retombe sur la complétude du Bien, la même que l'encart de la fiche
   * — deux mesures d'une même chose ne doivent pas pouvoir se contredire
   * (ADR-0004).
   *
   * Savoir qu'il reste deux questions décide de continuer ; ne pas le savoir
   * décide de quitter, et c'est la différence entre une fiche remplie et une
   * fiche à moitié.
   */
  readonly progressionAssistant = computed<Completude>(() => {
    const assistant = this.assistant();

    return assistant ? progression(assistant) : this.completude();
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
    /**
     * Ni sans confirmation ouverte, ni deux fois — le second appui d'un
     * double-clic trouve une suppression déjà en cours —, ni par-dessus un
     * Critère en cours d'enregistrement.
     *
     * Ce dernier cas n'a rien de théorique : les Critères s'enregistrent au
     * `blur`, donc quitter un champ pour venir supprimer lance les deux
     * écritures coup sur coup. Le `PATCH` reviendrait sur un Bien qui
     * n'existe plus, et son 404 — que le service ne sait pas distinguer
     * d'une panne — s'afficherait comme « L'API est injoignable » sur une
     * fiche qu'on a déjà quittée.
     *
     * Le garde vit ici et pas dans le seul `[disabled]` du gabarit, pour la
     * même raison que la confirmation elle-même : un remaniement du HTML ne
     * doit pas pouvoir le faire disparaître en silence.
     */
    if (!this.confirmationSuppression() || this.suppression() || this.enregistrement()) {
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

/**
 * Un libellé de Critère tel qu'il s'écrit au milieu d'une phrase plutôt
 * qu'en tête d'étiquette : « Taxe foncière » devient « taxe foncière ».
 *
 * Seule la première lettre s'abaisse, et seulement si le mot qu'elle ouvre
 * n'est pas déjà tout en capitales. Deux libellés d'aujourd'hui l'exigent :
 * « DPE », un sigle qu'un abaissement rendrait illisible, et « Type de
 * Bien », dont la capitale est celle du glossaire — le Bien est l'objet
 * qu'on compare, et il la porte partout.
 *
 * Abaisser toute la chaîne aurait donné « dpe » et « type de bien », soit une
 * faute et un terme du glossaire perdu.
 */
function enTeteDePhrase(libelle: string): string {
  const [premierMot] = libelle.split(' ');

  if (premierMot === premierMot.toLocaleUpperCase('fr-FR')) {
    return libelle;
  }

  return libelle.charAt(0).toLocaleLowerCase('fr-FR') + libelle.slice(1);
}

/** Le nombre de Critères d'un bloc restés sans valeur. */
function manquants(criteres: readonly LigneCritere[]): number {
  return criteres.filter(({ renseigne }) => !renseigne).length;
}
