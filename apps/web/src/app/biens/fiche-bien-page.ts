import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BienService, type FicheBien } from './bien.service';
import type { ModificationBien } from './bien';
import type { Critere, GroupeCritere } from '../criteres/critere';
import { criteresDuGroupe } from '../criteres/definition';
import { formaterValeur } from '../criteres/formatage';
import { estRenseigne } from '../criteres/valeurs';
import type { ValeurCritere } from '../criteres/comparaison';
import {
  demarrer,
  passer,
  questionCourante,
  repondre,
  termine,
  type Assistant,
} from '../criteres/assistant';

/** Un Critère prêt à s'afficher : sa déclaration, sa valeur, et son état. */
export interface LigneCritere {
  critere: Critere;

  /** La valeur brute, celle que le champ de saisie reçoit et renvoie. */
  valeur: ValeurCritere;

  /** La valeur écrite selon le type et l'unité du Critère. */
  affichage: string;

  /**
   * Vrai dès qu'une valeur a été saisie, zéro compris. C'est la distinction
   * dont l'écran tire sa mise en évidence : ce qui n'est pas renseigné est
   * ce qu'il reste à demander à l'agence (#6).
   */
  renseigne: boolean;
}

/** Les Critères d'un groupe, prêts à s'afficher en bloc. */
export interface BlocCriteres {
  groupe: GroupeCritere;
  libelle: string;
  criteres: LigneCritere[];
}

/**
 * Les groupes dans l'ordre où la fiche les présente, avec leur titre.
 *
 * L'ordre est celui d'un déroulé de visite : ce que ça coûte, ce que c'est,
 * où c'est, comment on y vit.
 */
const GROUPES: readonly { groupe: GroupeCritere; libelle: string }[] = [
  { groupe: 'budget', libelle: 'Budget' },
  { groupe: 'logement', libelle: 'Logement' },
  { groupe: 'localisation', libelle: 'Localisation' },
  { groupe: 'confort', libelle: 'Confort' },
];

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

  /** Vrai quand l'assistant en cours n'a plus rien à demander. */
  readonly assistantTermine = computed(() => {
    const assistant = this.assistant();

    return assistant ? termine(assistant) : false;
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

    this.assistant.set(repondre(assistant, saisie));
    this.reponse = '';
    this.envoyer({ [question.id]: saisie });
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
   * L'envoi d'une modification partielle, et la reprise du Bien tel que
   * l'API l'a enregistré — et non tel qu'il a été saisi : c'est la base qui
   * dit ce qui est vrai, et un écart entre les deux se verrait aussitôt.
   *
   * Un refus laisse le Bien affiché intact : montrer une valeur que l'API a
   * refusée ferait croire qu'elle y est.
   */
  private envoyer(modification: ModificationBien): void {
    this.enregistrement.set(true);
    this.erreurs.set([]);

    this.bienService.modifier(this.id, modification).subscribe((resultat) => {
      this.enregistrement.set(false);

      if (!resultat.enregistre) {
        this.erreurs.set(resultat.erreurs);
        return;
      }

      this.fiche.set({ etat: 'chargee', bien: resultat.bien });
    });
  }
}

/** Un Critère et sa valeur, prêts à s'afficher. */
function ligne(critere: Critere, valeur: ValeurCritere | undefined): LigneCritere {
  const valeurConnue = valeur ?? null;

  return {
    critere,
    valeur: valeurConnue,
    affichage: formaterValeur(critere, valeurConnue),
    renseigne: estRenseigne(valeurConnue),
  };
}

/** Le nombre de Critères d'un bloc restés sans valeur. */
function manquants(criteres: readonly LigneCritere[]): number {
  return criteres.filter(({ renseigne }) => !renseigne).length;
}
