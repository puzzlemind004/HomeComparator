import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subject, forkJoin, of, switchMap } from 'rxjs';
import { BienService, type ListeBiens } from './bien.service';
import { CommentaireService } from './commentaire.service';
import { Preferences } from './preferences.service';
import { DiagrammeScores, type BarreScore } from './diagramme-scores';
import { ROUTE_BIENS } from './carnet.routes';
import type { Bien } from './bien';
import type { Commentaire } from './commentaire';
import { CRITERES_ORDONNES } from '../criteres/definition';
import {
  POIDS_MAXIMUM,
  POIDS_PAR_DEFAUT,
  type CritereNotable,
  type Poids,
  scorer,
} from '../criteres/score';
import { critereDuTheme, moyenneDuTheme } from '../criteres/themes';

/** Les Commentaires d'un Bien, tels que l'écran les tient à plat. */
interface CommentairesDuBien {
  bienId: number;
  commentaires: readonly Commentaire[];
}

/**
 * Le tableau de bord (#126) : le carnet entier classé selon ce qui compte
 * pour l'acheteur.
 *
 * **Ce que le face-à-face ne fait pas.** `/comparer` met deux à quatre Biens
 * côte à côte et dit « lequel de ces deux-là ». Il ne dit pas « lesquels,
 * parmi les douze, méritent une seconde visite » — c'est une question sur le
 * carnet entier, et elle demande qu'on ait dit ce qui compte. Les poids sont
 * cette réponse, et le classement en est la conséquence immédiate.
 *
 * **Le calcul n'est pas ici** : il est dans `score.ts`, sans Angular ni
 * Biens, et les thèmes dans `themes.ts`. Cette page fait ce qu'une page
 * fait — charger, assembler, et donner à voir.
 *
 * **Tout est dérivé.** Les poids sont l'unique état écrit ; le classement,
 * les barres et les contributions en découlent par `computed`. C'est ce qui
 * rend le temps réel gratuit : bouger un curseur écrit un poids, et Angular
 * recalcule tout ce qui en dépend — il n'y a pas de « rafraîchir le
 * classement » à appeler, donc pas d'endroit où oublier de le faire.
 */
@Component({
  selector: 'app-tableau-de-bord-page',
  imports: [DiagrammeScores, RouterLink],
  styleUrl: './tableau-de-bord-page.scss',
  templateUrl: './tableau-de-bord-page.html',
})
export class TableauDeBordPage {
  private readonly bienService = inject(BienService);
  private readonly commentaireService = inject(CommentaireService);
  private readonly preferences = inject(Preferences);

  readonly routeBiens = ROUTE_BIENS;
  readonly poidsMaximum = POIDS_MAXIMUM;
  readonly poidsParDefaut = POIDS_PAR_DEFAUT;

  readonly liste = signal<ListeBiens | null>(null);

  /**
   * Les Commentaires de tous les Biens, chargés Bien par Bien.
   *
   * L'API n'a pas d'adresse pour « tous les Commentaires du carnet » : ils
   * pendent à un Bien (`GET /biens/:id/commentaires`). Un `forkJoin` les
   * demande donc en parallèle — un aller-retour par Bien, tous en même
   * temps. C'est acceptable pour un carnet qui compte des dizaines de Biens
   * et non des milliers ; le jour où il en compterait, c'est l'API qui
   * gagnerait une adresse, pas cet écran qui gagnerait une boucle.
   */
  readonly commentaires = signal<readonly CommentairesDuBien[]>([]);

  readonly themes = this.preferences.themes;
  readonly rattachements = this.preferences.rattachements;
  readonly poids = this.preferences.poids;
  readonly aucunPoidsPose = this.preferences.aucunPoidsPose;

  /** Le thème en cours de saisie, le temps qu'on lui donne un nom. */
  readonly nouveauTheme = signal('');

  /** Le Bien dont on déplie les Commentaires pour les rattacher. */
  readonly bienDeplie = signal<number | null>(null);

  readonly chargee = computed(() => this.liste()?.chargee === true);

  readonly biens = computed<readonly Bien[]>(() => {
    const liste = this.liste();

    return liste?.chargee ? liste.biens : [];
  });

  /**
   * Les Critères que l'acheteur peut pondérer : ceux qui se classent.
   *
   * Un Critère `sensComparaison: 'aucun'` n'a pas de curseur, et c'est la
   * définition qui le dit (ADR-0004) : rien ne permet d'affirmer qu'une
   * adresse ou un type de chauffage vaut mieux qu'un autre, donc rien ne
   * permet d'en faire un score. Lui donner un curseur serait demander à
   * l'acheteur de pondérer une question sans réponse.
   */
  readonly criteresPonderables = computed<readonly CritereNotable[]>(() =>
    CRITERES_ORDONNES.filter((critere) => critere.sensComparaison !== 'aucun').map(
      (critere) => ({
        id: critere.id,
        libelle: critere.libelle,
        critere,
        valeurDe: (bienId: number) =>
          this.biens().find((bien) => bien.id === bienId)?.criteres[critere.id] ?? null,
      }),
    ),
  );

  /**
   * Les thèmes, devenus des Critères pondérables comme les autres (#126).
   *
   * C'est ici que les Commentaires entrent dans le score : chaque thème rend
   * la moyenne des Appréciations qu'on lui a rattachées, et plus rien en
   * aval ne le distingue d'un prix ou d'une surface.
   */
  readonly themesPonderables = computed<readonly CritereNotable[]>(() =>
    this.themes().map((theme) => ({
      id: theme.id,
      libelle: theme.libelle,
      critere: critereDuTheme(theme),
      valeurDe: (bienId: number) =>
        moyenneDuTheme(
          theme.id,
          bienId,
          this.commentaires().find((entree) => entree.bienId === bienId)?.commentaires ?? [],
          this.rattachements(),
        ),
    })),
  );

  /** Tout ce qui se pondère, les Critères saisis puis les thèmes. */
  readonly notables = computed<readonly CritereNotable[]>(() => [
    ...this.criteresPonderables(),
    ...this.themesPonderables(),
  ]);

  /** Le classement, recalculé à chaque mouvement de curseur. */
  readonly classement = computed(() =>
    scorer(
      this.biens().map((bien) => bien.id),
      this.notables(),
      this.poids(),
    ),
  );

  /**
   * Le classement tel que l'écran l'affiche : le score, et le Bien qui le
   * porte. Le rang se pose ici parce qu'il dépend de l'ordre du classement
   * et non du Bien — le même Bien change de rang quand un poids bouge.
   */
  readonly lignes = computed(() => {
    // Les Biens sont indexés une fois plutôt que cherchés à chaque ligne :
    // `lignes` se recalcule à chaque mouvement de curseur, et deux `find`
    // linéaires par Bien y feraient un travail quadratique pour rien.
    const parId = new Map(this.biens().map((bien) => [bien.id, bien]));

    return this.classement().map((score, index) => {
      const bien = parId.get(score.porteurId);

      return {
        ...score,
        rang: index + 1,
        bien,
        libelle: bien?.libelle ?? '',
      };
    });
  });

  /** Ce que le diagramme dessine : un bâton par Bien classé. */
  readonly barres = computed<readonly BarreScore[]>(() =>
    this.lignes().map((ligne) => ({
      bienId: ligne.porteurId,
      libelle: ligne.libelle,
      score: ligne.score,
      rang: ligne.rang,
      manquants: ligne.manquants,
    })),
  );

  /** Les Biens qu'aucun Critère pondéré ne renseigne : listés à part. */
  readonly sansScore = computed(() => this.lignes().filter((ligne) => ligne.score === null));

  /** Vrai dès qu'il y a un classement à montrer. */
  readonly classementAffiche = computed(() =>
    this.lignes().some((ligne) => ligne.score !== null),
  );

  private readonly chargements = new Subject<void>();

  constructor() {
    this.chargements
      .pipe(
        switchMap(() => this.bienService.lister()),
        switchMap((liste) => {
          this.liste.set(liste);

          if (!liste.chargee) {
            return of([] as CommentairesDuBien[]);
          }

          this.preferences.oublierLesDisparus(liste.biens.map((bien) => bien.id));

          if (liste.biens.length === 0) {
            return of([] as CommentairesDuBien[]);
          }

          return forkJoin(
            liste.biens.map((bien) =>
              this.commentaireService.lister(bien.id).pipe(
                switchMap((resultat) =>
                  of({
                    bienId: bien.id,
                    commentaires: resultat.chargee ? resultat.commentaires : [],
                  }),
                ),
              ),
            ),
          );
        }),
      )
      .subscribe((commentaires) => this.commentaires.set(commentaires));

    this.rafraichir();
  }

  rafraichir(): void {
    this.chargements.next();
  }

  /** Le poids posé sur un Critère, ou le défaut tant que rien n'a été dit. */
  poidsDe(critereId: string): Poids {
    return this.poids()[critereId] ?? POIDS_PAR_DEFAUT;
  }

  /** Le curseur a bougé : c'est la seule écriture de tout l'écran. */
  poser(critereId: string, valeur: string): void {
    this.preferences.poser(critereId, Number(valeur) as Poids);
  }

  reinitialiser(): void {
    this.preferences.reinitialiserPoids();
  }

  creerTheme(): void {
    if (this.preferences.creerTheme(this.nouveauTheme()) !== null) {
      this.nouveauTheme.set('');
    }
  }

  supprimerTheme(themeId: string): void {
    this.preferences.supprimerTheme(themeId);
  }

  /** Déplie les Commentaires d'un Bien, ou les replie s'ils l'étaient. */
  basculerDepli(bienId: number): void {
    this.bienDeplie.update((courant) => (courant === bienId ? null : bienId));
  }

  basculerRattachement(commentaireId: number, bienId: number, themeId: string): void {
    this.preferences.basculerRattachement(commentaireId, bienId, themeId);
  }

  /** Vrai quand ce Commentaire porte ce thème. */
  estRattache(commentaireId: number, themeId: string): boolean {
    return this.rattachements().some(
      (rattachement) =>
        rattachement.commentaireId === commentaireId && rattachement.themeId === themeId,
    );
  }

  /** Les Commentaires d'un Bien, pour l'écran de rattachement. */
  commentairesDe(bienId: number): readonly Commentaire[] {
    return this.commentaires().find((entree) => entree.bienId === bienId)?.commentaires ?? [];
  }

  /**
   * Les Commentaires qui peuvent porter un thème : ceux qui ont une
   * Appréciation.
   *
   * Un Commentaire sans étoiles décrit sans juger, et ne pèserait rien dans
   * une moyenne (voir `moyenneDuTheme`) : le proposer au rattachement ferait
   * croire qu'il compte.
   */
  commentairesNotesDe(bienId: number): readonly Commentaire[] {
    return this.commentairesDe(bienId).filter((commentaire) => commentaire.note !== null);
  }
}
