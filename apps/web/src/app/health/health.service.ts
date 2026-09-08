import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, type Observable, of } from 'rxjs';

/** État de la base, tel que l'API le rapporte. */
export type DatabaseStatus = 'ok' | 'unreachable';

/** État du service, tel que l'API le rapporte. */
export type ApiStatus = 'ok' | 'degraded';

/** Réponse brute de la route de santé de l'API. */
interface HealthResponse {
  status: ApiStatus;
  database: DatabaseStatus;
}

/**
 * État de santé tel que l'interface a besoin de l'afficher. Une API qui n'a
 * pas répondu n'a par définition ni statut ni état de base à rapporter :
 * le type l'exprime plutôt que de le combler avec des chaînes inventées.
 */
export type Health =
  | { reachable: true; status: ApiStatus; database: DatabaseStatus }
  | { reachable: false };

const API_UNREACHABLE: Health = { reachable: false };

@Injectable({ providedIn: 'root' })
export class HealthService {
  private readonly http = inject(HttpClient);

  /**
   * Une API injoignable est un état à afficher, pas une erreur à propager :
   * c'est précisément ce que cet écran sert à montrer.
   */
  check(): Observable<Health> {
    return this.http.get<HealthResponse>('/api/health').pipe(
      map(({ status, database }): Health => ({ reachable: true, status, database })),
      catchError(() => of(API_UNREACHABLE)),
    );
  }
}
