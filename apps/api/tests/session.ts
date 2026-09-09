import env from '#start/env'
import type { ApiClient, ApiRequest, ApiResponse } from '@japa/api-client'

/**
 * Ce qu'un navigateur fait d'une session, réduit à ce dont les tests ont
 * besoin : se connecter, puis représenter le cookie obtenu à chaque appel.
 *
 * Toutes les routes sauf la connexion et la santé exigent la session (#4) :
 * sans ce détour, chaque test de Biens vérifierait surtout qu'on est refusé.
 */

/** Le nom du cookie de session, tel que `config/session.ts` le déclare. */
export const COOKIE_SESSION = 'homecomparator_session'

/**
 * Une session telle que le navigateur la détient : l'identifiant seul, les
 * données vivant en base (`config/session.ts`). Un type nommé plutôt qu'une
 * chaîne nue, pour que les tests ne puissent pas passer n'importe quoi.
 */
export type Session = { identifiant: string }

/** Ouvre une session comme le ferait l'écran de connexion. */
export function connecter(client: ApiClient, motDePasse = env.get('APP_PASSWORD')) {
  return client.post('/auth/session').json({ motDePasse })
}

/** Le cookie de session porté par une réponse. */
export function sessionDe(response: ApiResponse): Session {
  const identifiant = response.cookie(COOKIE_SESSION)?.value

  if (typeof identifiant !== 'string') {
    throw new Error('La réponse ne porte aucun cookie de session')
  }

  return { identifiant }
}

/** Une session ouverte, prête à être présentée aux routes protégées. */
export async function ouvrirSession(client: ApiClient): Promise<Session> {
  return sessionDe(await connecter(client))
}

/**
 * Présente une session à une requête, comme le navigateur renverrait le
 * cookie reçu. C'est très exactement ce que signifie « la session persiste
 * d'une visite à l'autre ».
 */
export function avecSession<T extends ApiRequest>(requete: T, { identifiant }: Session): T {
  return requete.cookie(COOKIE_SESSION, identifiant) as T
}
