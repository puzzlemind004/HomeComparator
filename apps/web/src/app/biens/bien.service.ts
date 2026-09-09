import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { catchError, map, type Observable, of } from 'rxjs';
import type { Bien, CreationBien, ModificationBien } from './bien';
import type { BienApi, ReponseErreurValidationApi } from './bien.api';
import { versBien, versCreationBienApi, versModificationBienApi } from './bien.adapter';
import type { Statut } from '../criteres/statut';

const BIENS_URL = '/api/biens';

const API_INJOIGNABLE = "L'API est injoignable. Le Bien n'a pas été enregistré.";

const MODIFICATION_INJOIGNABLE = "L'API est injoignable. La modification n'a pas été enregistrée.";

const LISTE_INJOIGNABLE: ListeBiens = { chargee: false };

/**
 * L'issue d'une création. Un refus porte ses messages, une réussite porte
 * le Bien créé : le type interdit d'avoir les deux, ou aucun des deux.
 */
export type CreationBienResultat =
  | { cree: true; bien: Bien }
  | { cree: false; erreurs: string[] };

/**
 * L'issue d'une modification, sur le même principe : le Bien tel qu'il est
 * après enregistrement, ou les messages qui disent pourquoi il ne l'est pas.
 */
export type ModificationBienResultat =
  | { enregistre: true; bien: Bien }
  | { enregistre: false; erreurs: string[] };

/**
 * L'issue d'un chargement de la liste. Une API qui n'a pas répondu n'a par
 * définition aucun Bien à rapporter : le type refuse de confondre ce cas
 * avec une liste réellement vide, que l'écran affiche tout autrement.
 */
export type ListeBiens = { chargee: true; biens: Bien[] } | { chargee: false };

/**
 * L'issue du chargement d'une fiche. Le Bien introuvable est distingué de
 * l'API injoignable : le premier est un fait — une adresse qui ne désigne
 * plus rien —, le second un incident qui se répare en réessayant, et
 * l'écran n'a pas la même chose à dire dans les deux cas.
 */
export type FicheBien =
  | { etat: 'chargee'; bien: Bien }
  | { etat: 'introuvable' }
  | { etat: 'injoignable' };

@Injectable({ providedIn: 'root' })
export class BienService {
  private readonly http = inject(HttpClient);

  /**
   * Les Biens enregistrés, dans l'ordre où l'API les renvoie — tous, ou
   * ceux d'un seul Statut quand la liste est filtrée (#7).
   *
   * Une API injoignable est un état à afficher, pas une erreur à propager :
   * la rabattre sur une liste vide ferait dire à l'écran que le carnet est
   * vide, ce qui se lit comme une perte de données sur des Biens saisis à
   * la main (ADR-0001).
   */
  lister(statut?: Statut): Observable<ListeBiens> {
    /**
     * Le filtre part à l'API plutôt que de s'appliquer sur une liste déjà
     * reçue : c'est ce que la colonne permet (ADR-0004), et la liste n'a pas
     * à voyager en entier pour qu'on en regarde le quart.
     */
    const params = statut ? new HttpParams().set('statut', statut) : undefined;

    return this.http.get<BienApi[]>(BIENS_URL, { params }).pipe(
      map((biens): ListeBiens => ({ chargee: true, biens: biens.map(versBien) })),
      catchError(() => of(LISTE_INJOIGNABLE)),
    );
  }

  /** La fiche d'un Bien : tout ce qui a été noté à son sujet (#6). */
  consulter(id: number): Observable<FicheBien> {
    return this.http.get<BienApi>(`${BIENS_URL}/${id}`).pipe(
      map((bien): FicheBien => ({ etat: 'chargee', bien: versBien(bien) })),
      catchError((erreur: unknown) =>
        of<FicheBien>(
          erreur instanceof HttpErrorResponse && erreur.status === 404
            ? { etat: 'introuvable' }
            : { etat: 'injoignable' },
        ),
      ),
    );
  }

  /**
   * Un refus de l'API est un état à afficher dans le formulaire, pas une
   * exception à laisser fuir : les messages viennent de l'API, qui les
   * rédige pour être lus tels quels.
   */
  creer(saisie: CreationBien): Observable<CreationBienResultat> {
    return this.http.post<BienApi>(BIENS_URL, versCreationBienApi(saisie)).pipe(
      map((bien): CreationBienResultat => ({ cree: true, bien: versBien(bien) })),
      catchError((erreur: unknown) => of({ cree: false as const, erreurs: messages(erreur) })),
    );
  }

  /**
   * La modification de quelques Critères d'un Bien, jamais forcément tous
   * (#6).
   *
   * `PATCH` et non `PUT` : ce qui n'est pas transmis n'est pas touché, ce
   * qui permet à la fiche de n'envoyer que le champ modifié et à
   * l'assistant que la réponse à sa question.
   */
  modifier(id: number, modification: ModificationBien): Observable<ModificationBienResultat> {
    return this.http
      .patch<BienApi>(`${BIENS_URL}/${id}`, versModificationBienApi(modification))
      .pipe(
        map((bien): ModificationBienResultat => ({ enregistre: true, bien: versBien(bien) })),
        catchError((erreur: unknown) =>
          of({
            enregistre: false as const,
            erreurs: messages(erreur, MODIFICATION_INJOIGNABLE),
          }),
        ),
      );
  }
}

/**
 * Les messages à afficher pour un échec. L'API rédige ceux de validation
 * pour être lus tels quels ; tout le reste — API éteinte, panne, réponse
 * inattendue — se résume à un seul message, rien n'ayant de toute façon été
 * enregistré.
 */
function messages(erreur: unknown, defaut = API_INJOIGNABLE): string[] {
  if (!(erreur instanceof HttpErrorResponse)) {
    return [defaut];
  }

  const corps = erreur.error as Partial<ReponseErreurValidationApi> | null;

  return corps?.errors?.length ? corps.errors.map(({ message }) => message) : [defaut];
}
