import { timingSafeEqual } from 'node:crypto'
import env from '#start/env'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * L'accès à l'outil, protégé par un mot de passe unique (#4).
 *
 * Un seul utilisateur ne justifie ni comptes, ni inscription, ni
 * réinitialisation : le mot de passe vit dans l'environnement, et la session
 * ne retient que le fait qu'il a été donné. Ce module est le seul endroit
 * qui sache l'un et l'autre — le middleware et le contrôleur passent par lui.
 */

/**
 * La clé sous laquelle la session retient l'authentification. Nommée ici et
 * pas ailleurs : deux orthographes divergentes rendraient l'API ouverte.
 */
const CLE_SESSION = 'authentifie'

/** La session en cours atteste-t-elle du mot de passe ? */
export function estAuthentifie({ session }: HttpContext): boolean {
  return session.get(CLE_SESSION) === true
}

/**
 * Marque la session comme authentifiée.
 *
 * L'identifiant de session est régénéré : sans cela, un identifiant obtenu
 * avant la connexion resterait valable après, et une session fixée par un
 * tiers deviendrait la session de l'acheteur.
 */
export function ouvrirSession({ session }: HttpContext): void {
  session.regenerate()
  session.put(CLE_SESSION, true)
}

/** Referme la session : le cookie ne vaut plus rien après cet appel. */
export function fermerSession({ session }: HttpContext): void {
  session.clear()
  session.regenerate()
}

/**
 * Le mot de passe saisi est-il celui de l'environnement ?
 *
 * La comparaison est à temps constant : une comparaison ordinaire s'arrête
 * au premier caractère différent, et la durée de la réponse trahirait alors
 * le préfixe correct, caractère par caractère.
 */
export function motDePasseValide(saisi: string): boolean {
  const attendu = Buffer.from(env.get('APP_PASSWORD'), 'utf8')
  const propose = Buffer.from(saisi, 'utf8')

  // `timingSafeEqual` exige deux tampons de même longueur. Comparer les
  // longueurs d'abord ne divulgue que celle du mot de passe, qu'une mesure
  // de temps ne donne de toute façon pas.
  if (attendu.length !== propose.length) {
    return false
  }

  return timingSafeEqual(attendu, propose)
}
