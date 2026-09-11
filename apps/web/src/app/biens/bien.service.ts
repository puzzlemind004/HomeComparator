import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { catchError, map, type Observable, of } from 'rxjs';
import type { Bien, CreationBien, ModificationBien } from './bien';
import type { BienApi, ReponseErreurValidationApi } from './bien.api';
import { versBien, versCreationBienApi, versModificationBienApi } from './bien.adapter';
import type { Statut } from '../criteres/statut';
import { urlBien, urlBiens } from './routes';

const API_INJOIGNABLE = "L'API est injoignable. Le Bien n'a pas été enregistré.";

const MODIFICATION_INJOIGNABLE = "L'API est injoignable. La modification n'a pas été enregistrée.";

const SUPPRESSION_INJOIGNABLE = "L'API est injoignable. Le Bien n'a pas été supprimé.";

const LISTE_INJOIGNABLE: ListeBiens = { chargee: false };

/**
 * L'issue d'une création. Un refus porte ses messages, une réussite porte
 * le Bien créé : le type interdit d'avoir les deux, ou aucun des deux.
 */
export type CreationBienResultat = { cree: true; bien: Bien } | { cree: false; erreurs: string[] };

/**
 * L'issue d'une modification, sur le même principe : le Bien tel qu'il est
 * après enregistrement, ou les messages qui disent pourquoi il ne l'est pas.
 */
export type ModificationBienResultat =
  { enregistre: true; bien: Bien } | { enregistre: false; erreurs: string[] };

/**
 * L'issue d'une suppression (#9).
 *
 * L'échec porte `disparu` parce que les deux façons d'échouer ne se
 * ressemblent pas. Un 404 dit que le Bien n'est plus là — c'était le but, et
 * l'écran peut refermer la fiche sans mentir. Tout le reste laisse le Bien
 * en place, et il faut le dire : croire à une suppression qui n'a pas eu
 * lieu ferait chercher un Bien qu'on retrouverait au rechargement suivant.
 */
export type SuppressionBienResultat =
  { supprime: true } | { supprime: false; disparu: boolean; erreurs: string[] };

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
  { etat: 'chargee'; bien: Bien } | { etat: 'introuvable' } | { etat: 'injoignable' };

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

    return this.http.get<BienApi[]>(urlBiens(), { params }).pipe(
      map((biens): ListeBiens => ({ chargee: true, biens: biens.map(versBien) })),
      catchError(() => of(LISTE_INJOIGNABLE)),
    );
  }

  /** La fiche d'un Bien : tout ce qui a été noté à son sujet (#6). */
  consulter(id: number): Observable<FicheBien> {
    return this.http.get<BienApi>(urlBien(id)).pipe(
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
    return this.http.post<BienApi>(urlBiens(), versCreationBienApi(saisie)).pipe(
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
    return this.http.patch<BienApi>(urlBien(id), versModificationBienApi(modification)).pipe(
      map((bien): ModificationBienResultat => ({ enregistre: true, bien: versBien(bien) })),
      catchError((erreur: unknown) =>
        of({
          enregistre: false as const,
          erreurs: messages(erreur, MODIFICATION_INJOIGNABLE),
        }),
      ),
    );
  }

  /**
   * La suppression définitive d'un Bien (#9).
   *
   * Rien n'est rendu en cas de succès : le Bien n'est plus là, et il n'y a
   * rien à en dire. C'est l'écran qui décide de ce qu'il montre ensuite.
   *
   * La confirmation ne se joue pas ici. Elle est affaire d'écran — c'est là
   * qu'un geste se déclenche par accident —, et un service qui la
   * redemanderait ne ferait qu'ajouter un garde-fou que les tests
   * devraient contourner.
   */
  supprimer(id: number): Observable<SuppressionBienResultat> {
    return this.http.delete<void>(urlBien(id)).pipe(
      map((): SuppressionBienResultat => ({ supprime: true })),
      catchError((erreur: unknown) => {
        // Le Bien n'existe déjà plus : l'état visé est atteint, mais ce
        // n'est pas cet appel qui l'a obtenu, et l'écran mérite de le
        // savoir plutôt que de l'apprendre par un succès inventé.
        const disparu = erreur instanceof HttpErrorResponse && erreur.status === 404;

        return of<SuppressionBienResultat>({
          supprime: false,
          disparu,
          // Un Bien déjà disparu n'a rien à faire lire : la fiche se referme
          // sur le même constat qu'une suppression réussie.
          erreurs: disparu ? [] : messages(erreur, SUPPRESSION_INJOIGNABLE),
        });
      }),
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
