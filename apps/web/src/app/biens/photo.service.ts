import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { catchError, map, type Observable, of } from 'rxjs';
import type { Photo } from './photo';
import type { PhotoApi } from './photo.api';
import { versPhoto } from './photo.adapter';
import type { ReponseErreurValidationApi } from './bien.api';
import { urlPhoto, urlPhotos } from './routes';

const AJOUT_INJOIGNABLE = "L'API est injoignable. Les photos n'ont pas été ajoutées.";

const SUPPRESSION_INJOIGNABLE = "L'API est injoignable. La photo n'a pas été supprimée.";

/**
 * L'issue d'un chargement de galerie. Une API qui n'a pas répondu n'a par
 * définition aucune photo à rapporter : le type refuse de confondre ce cas
 * avec un Bien réellement sans photo, que l'écran invite à en ajouter.
 */
export type Galerie = { chargee: true; photos: Photo[] } | { chargee: false };

/** L'issue d'un ajout : les photos telles qu'elles sont, ou ce qui a bloqué. */
export type AjoutPhotosResultat =
  { ajoutees: true; photos: Photo[] } | { ajoutees: false; erreurs: string[] };

/**
 * L'issue d'une suppression, sur le même principe que celle d'un Bien : une
 * photo déjà partie est l'état visé, et l'écran peut la retirer sans mentir.
 */
export type SuppressionPhotoResultat =
  { supprimee: true } | { supprimee: false; disparue: boolean; erreurs: string[] };

const GALERIE_INJOIGNABLE: Galerie = { chargee: false };

@Injectable({ providedIn: 'root' })
export class PhotoService {
  private readonly http = inject(HttpClient);

  /** Les photos d'un Bien, dans l'ordre de la galerie (#13). */
  lister(bienId: number): Observable<Galerie> {
    return this.http.get<PhotoApi[]>(urlPhotos(bienId)).pipe(
      map((photos): Galerie => ({ chargee: true, photos: photos.map(versPhoto) })),
      catchError(() => of(GALERIE_INJOIGNABLE)),
    );
  }

  /**
   * L'ajout d'une série de photos.
   *
   * `FormData` et non JSON : ce sont des fichiers, et les encoder en base64
   * les gonflerait d'un tiers sur la connexion mobile qui est justement
   * celle de la visite.
   *
   * Toutes sous le même nom de champ, `photos` : c'est ce que l'API lit,
   * pour un envoi comme pour huit.
   */
  ajouter(bienId: number, fichiers: readonly File[]): Observable<AjoutPhotosResultat> {
    const corps = new FormData();

    for (const fichier of fichiers) {
      corps.append('photos', fichier);
    }

    return this.http.post<PhotoApi[]>(urlPhotos(bienId), corps).pipe(
      map((photos): AjoutPhotosResultat => ({ ajoutees: true, photos: photos.map(versPhoto) })),
      catchError((erreur: unknown) =>
        of({ ajoutees: false as const, erreurs: messages(erreur, AJOUT_INJOIGNABLE) }),
      ),
    );
  }

  /**
   * La suppression d'une photo, fichier compris — c'est l'API qui efface le
   * fichier avant la ligne (#13).
   */
  supprimer(bienId: number, photoId: number): Observable<SuppressionPhotoResultat> {
    return this.http.delete<void>(urlPhoto(bienId, photoId)).pipe(
      map((): SuppressionPhotoResultat => ({ supprimee: true })),
      catchError((erreur: unknown) => {
        // La photo n'existe déjà plus : l'état visé est atteint, et l'écran
        // peut la retirer de la galerie sans inventer un succès.
        const disparue = erreur instanceof HttpErrorResponse && erreur.status === 404;

        return of<SuppressionPhotoResultat>({
          supprimee: false,
          disparue,
          erreurs: disparue ? [] : messages(erreur, SUPPRESSION_INJOIGNABLE),
        });
      }),
    );
  }
}

/**
 * Les messages à afficher pour un échec. L'API rédige ceux de refus pour
 * être lus tels quels — ils nomment le fichier en cause, sans quoi
 * l'acheteur ne saurait pas laquelle de ses huit photos a été refusée.
 */
function messages(erreur: unknown, defaut: string): string[] {
  if (!(erreur instanceof HttpErrorResponse)) {
    return [defaut];
  }

  const corps = erreur.error as Partial<ReponseErreurValidationApi> | null;

  return corps?.errors?.length ? corps.errors.map(({ message }) => message) : [defaut];
}
