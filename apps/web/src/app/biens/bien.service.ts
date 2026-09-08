import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { catchError, map, type Observable, of } from 'rxjs';
import type { Bien, CreationBien } from './bien';
import type { BienApi, ReponseErreurValidationApi } from './bien.api';
import { versBien, versCreationBienApi } from './bien.adapter';

const BIENS_URL = '/api/biens';

const API_INJOIGNABLE = "L'API est injoignable. Le Bien n'a pas été enregistré.";

const LISTE_INJOIGNABLE: ListeBiens = { chargee: false };

/**
 * L'issue d'une création. Un refus porte ses messages, une réussite porte
 * le Bien créé : le type interdit d'avoir les deux, ou aucun des deux.
 */
export type CreationBienResultat =
  | { cree: true; bien: Bien }
  | { cree: false; erreurs: string[] };

/**
 * L'issue d'un chargement de la liste. Une API qui n'a pas répondu n'a par
 * définition aucun Bien à rapporter : le type refuse de confondre ce cas
 * avec une liste réellement vide, que l'écran affiche tout autrement.
 */
export type ListeBiens = { chargee: true; biens: Bien[] } | { chargee: false };

@Injectable({ providedIn: 'root' })
export class BienService {
  private readonly http = inject(HttpClient);

  /**
   * Tous les Biens enregistrés, dans l'ordre où l'API les renvoie.
   *
   * Une API injoignable est un état à afficher, pas une erreur à propager :
   * la rabattre sur une liste vide ferait dire à l'écran que le carnet est
   * vide, ce qui se lit comme une perte de données sur des Biens saisis à
   * la main (ADR-0001).
   */
  lister(): Observable<ListeBiens> {
    return this.http.get<BienApi[]>(BIENS_URL).pipe(
      map((biens): ListeBiens => ({ chargee: true, biens: biens.map(versBien) })),
      catchError(() => of(LISTE_INJOIGNABLE)),
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
}

/**
 * Les messages à afficher pour un échec de création. L'API rédige ceux de
 * validation pour être lus tels quels ; tout le reste — API éteinte, panne,
 * réponse inattendue — se résume à un seul message, le Bien n'ayant de toute
 * façon pas été enregistré.
 */
function messages(erreur: unknown): string[] {
  if (!(erreur instanceof HttpErrorResponse)) {
    return [API_INJOIGNABLE];
  }

  const corps = erreur.error as Partial<ReponseErreurValidationApi> | null;

  return corps?.errors?.length ? corps.errors.map(({ message }) => message) : [API_INJOIGNABLE];
}
