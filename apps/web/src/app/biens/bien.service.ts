import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { catchError, map, type Observable, of } from 'rxjs';
import type { Bien, CreationBien } from './bien';
import type { BienApi, ReponseErreurValidationApi } from './bien.api';
import { versBien, versCreationBienApi } from './bien.adapter';

const BIENS_URL = '/api/biens';

const API_INJOIGNABLE = "L'API est injoignable. Le Bien n'a pas été enregistré.";

/**
 * L'issue d'une création. Un refus porte ses messages, une réussite porte
 * le Bien créé : le type interdit d'avoir les deux, ou aucun des deux.
 */
export type CreationBienResultat =
  | { cree: true; bien: Bien }
  | { cree: false; erreurs: string[] };

@Injectable({ providedIn: 'root' })
export class BienService {
  private readonly http = inject(HttpClient);

  /** Tous les Biens enregistrés, dans l'ordre où l'API les renvoie. */
  lister(): Observable<Bien[]> {
    return this.http.get<BienApi[]>(BIENS_URL).pipe(map((biens) => biens.map(versBien)));
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
