import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { catchError, map, type Observable, of, tap } from 'rxjs';
import type { ConnexionApi, RefusApi, SessionApi } from './auth.api';

const SESSION_URL = '/api/auth/session';

const API_INJOIGNABLE = "L'API est injoignable. La connexion n'a pas pu aboutir.";

/**
 * L'issue d'une tentative de connexion. Un refus porte son message, une
 * réussite n'a rien à porter : le type interdit d'avoir les deux.
 */
export type ConnexionResultat = { connecte: true } | { connecte: false; erreur: string };

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  /**
   * Ce que le front sait de la session, `null` tant qu'il ne sait rien.
   *
   * Le vrai gardien de l'accès est l'API, qui refuse tout appel non
   * authentifié : ce signal ne fait qu'éviter d'afficher un écran vide en
   * attendant le 401. Le confondre avec une autorisation serait mettre la
   * sécurité dans le navigateur, où elle ne tient pas.
   */
  private readonly session = signal<boolean | null>(null);

  /** L'état de session, tel que les écrans le lisent. */
  readonly authentifie = this.session.asReadonly();

  /**
   * Demande à l'API si la session vaut encore. C'est la seule source de
   * vérité : le cookie est `httpOnly`, donc invisible au script d'ici.
   *
   * Une API injoignable est traitée comme une session absente : l'écran de
   * connexion est ce qu'on peut montrer de plus utile, et il dira lui-même
   * que l'API ne répond pas si l'acheteur tente de se connecter.
   */
  verifier(): Observable<boolean> {
    return this.http.get<SessionApi>(SESSION_URL).pipe(
      map(({ authentifie }) => authentifie),
      catchError(() => of(false)),
      tap((authentifie) => this.session.set(authentifie)),
    );
  }

  /**
   * Un refus de l'API est un état à afficher dans le formulaire, pas une
   * exception à laisser fuir : le message vient de l'API, qui le rédige pour
   * être lu tel quel et le rend identique quelle que soit la cause du refus.
   */
  connecter(motDePasse: string): Observable<ConnexionResultat> {
    const corps: ConnexionApi = { motDePasse };

    return this.http.post<SessionApi>(SESSION_URL, corps).pipe(
      map((): ConnexionResultat => ({ connecte: true })),
      tap((resultat) => this.session.set(resultat.connecte)),
      catchError((erreur: unknown) => of({ connecte: false as const, erreur: message(erreur) })),
    );
  }

  /**
   * Referme la session. L'état local passe à « non authentifié » même si
   * l'appel échoue : le laisser à `true` ferait croire à une session ouverte
   * que l'acheteur a justement voulu fermer, et l'API refuserait de toute
   * façon les appels suivants.
   */
  deconnecter(): Observable<void> {
    return this.http.delete<SessionApi>(SESSION_URL).pipe(
      map(() => undefined),
      catchError(() => of(undefined)),
      tap(() => this.session.set(false)),
    );
  }

  /**
   * Enregistre qu'une session a expiré, sans rien demander à l'API : c'est
   * ce que l'intercepteur appelle quand une réponse revient en 401.
   */
  sessionPerdue(): void {
    this.session.set(false);
  }
}

/**
 * Le message à afficher pour un échec de connexion. Un 401 porte le message
 * de l'API, rédigé pour être lu tel quel ; tout le reste — API éteinte,
 * panne, réponse inattendue — se résume au constat qu'on n'a pas pu essayer.
 */
function message(erreur: unknown): string {
  if (!(erreur instanceof HttpErrorResponse) || erreur.status !== 401) {
    return API_INJOIGNABLE;
  }

  const corps = erreur.error as Partial<RefusApi> | null;

  return corps?.message ?? API_INJOIGNABLE;
}
