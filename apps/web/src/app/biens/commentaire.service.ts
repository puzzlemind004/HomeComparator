import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { catchError, map, type Observable, of } from 'rxjs';
import type { AjoutCommentaire, Commentaire } from './commentaire';
import type { CommentaireApi } from './commentaire.api';
import { versCommentaire } from './commentaire.adapter';
import type { ReponseErreurValidationApi } from './bien.api';
import { urlCommentaire, urlCommentaires } from './routes';

const AJOUT_INJOIGNABLE = "L'API est injoignable. Le Commentaire n'a pas été ajouté.";

const SUPPRESSION_INJOIGNABLE = "L'API est injoignable. Le Commentaire n'a pas été supprimé.";

/**
 * L'issue d'un chargement. Une API qui n'a pas répondu n'a par définition
 * aucun Commentaire à rapporter : le type refuse de confondre ce cas avec un
 * Bien réellement sans Commentaire, que l'écran invite à commenter.
 */
export type Commentaires =
  | { chargee: true; commentaires: Commentaire[] }
  | { chargee: false };

/** L'issue d'un ajout : le Commentaire tel qu'il est, ou ce qui a bloqué. */
export type AjoutCommentaireResultat =
  | { ajoute: true; commentaire: Commentaire }
  | { ajoute: false; erreurs: string[] };

/**
 * L'issue d'une suppression, sur le même principe que celle d'une photo : un
 * Commentaire déjà parti est l'état visé, et l'écran peut le retirer sans
 * mentir.
 */
export type SuppressionCommentaireResultat =
  | { supprime: true }
  | { supprime: false; disparu: boolean; erreurs: string[] };

const INJOIGNABLE: Commentaires = { chargee: false };

@Injectable({ providedIn: 'root' })
export class CommentaireService {
  private readonly http = inject(HttpClient);

  /** Les Commentaires d'un Bien, du plus récent au plus ancien. */
  lister(bienId: number): Observable<Commentaires> {
    return this.http.get<CommentaireApi[]>(urlCommentaires(bienId)).pipe(
      map(
        (commentaires): Commentaires => ({
          chargee: true,
          commentaires: commentaires.map(versCommentaire),
        }),
      ),
      catchError(() => of(INJOIGNABLE)),
    );
  }

  /**
   * L'ajout d'un Commentaire, photo comprise, en un seul envoi.
   *
   * `FormData` et non JSON : la photo part avec le texte, et l'encoder en
   * base64 la gonflerait d'un tiers sur la connexion mobile qui est
   * justement celle de la visite. C'est aussi ce qui fait qu'un Commentaire
   * illustré coûte un aller-retour et non deux — celui qui échoue au second
   * laisserait une photo que personne n'a demandée.
   *
   * Les champs vides ne sont pas envoyés du tout : un `texte` absent se dit
   * mieux par son absence que par une chaîne vide, que l'API aurait à
   * démêler.
   */
  ajouter(bienId: number, ajout: AjoutCommentaire): Observable<AjoutCommentaireResultat> {
    const corps = new FormData();

    const texte = ajout.texte.trim();

    if (texte) {
      corps.append('texte', texte);
    }

    if (ajout.note !== null) {
      corps.append('note', String(ajout.note));
    }

    if (ajout.photo) {
      corps.append('photo', ajout.photo);
    }

    return this.http.post<CommentaireApi>(urlCommentaires(bienId), corps).pipe(
      map(
        (commentaire): AjoutCommentaireResultat => ({
          ajoute: true,
          commentaire: versCommentaire(commentaire),
        }),
      ),
      catchError((erreur: unknown) =>
        of({ ajoute: false as const, erreurs: messages(erreur, AJOUT_INJOIGNABLE) }),
      ),
    );
  }

  /**
   * La suppression d'un Commentaire.
   *
   * Sa photo n'est pas emportée : elle est dans la galerie du Bien comme
   * n'importe quelle autre, et c'est de là qu'on la retire (#13).
   */
  supprimer(bienId: number, commentaireId: number): Observable<SuppressionCommentaireResultat> {
    return this.http.delete<void>(urlCommentaire(bienId, commentaireId)).pipe(
      map((): SuppressionCommentaireResultat => ({ supprime: true })),
      catchError((erreur: unknown) => {
        // Le Commentaire n'existe déjà plus : l'état visé est atteint, et
        // l'écran peut le retirer sans inventer un succès.
        const disparu = erreur instanceof HttpErrorResponse && erreur.status === 404;

        return of<SuppressionCommentaireResultat>({
          supprime: false,
          disparu,
          erreurs: disparu ? [] : messages(erreur, SUPPRESSION_INJOIGNABLE),
        });
      }),
    );
  }
}

/**
 * Les messages à afficher pour un échec. L'API rédige ceux de refus pour
 * être lus tels quels — ils nomment le fichier en cause quand c'est la photo
 * qui est refusée.
 */
function messages(erreur: unknown, defaut: string): string[] {
  if (!(erreur instanceof HttpErrorResponse)) {
    return [defaut];
  }

  const corps = erreur.error as Partial<ReponseErreurValidationApi> | null;

  return corps?.errors?.length ? corps.errors.map(({ message }) => message) : [defaut];
}
