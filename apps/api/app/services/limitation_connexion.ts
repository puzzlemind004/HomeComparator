import limiter from '@adonisjs/limiter/services/main'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Ce qui compte les tentatives de connexion échouées, par adresse (#26).
 *
 * La connexion est la seule serrure du carnet : tout le reste est derrière
 * la session. Le message unique et la comparaison à temps constant, déjà en
 * place, visent l'attaquant qui *infère* quelque chose de la réponse ; ni
 * l'un ni l'autre ne gêne celui qui n'a rien à inférer et se contente
 * d'essayer vite et longtemps. C'est ce mode d'attaque-là que ce module
 * coupe, et le seul.
 *
 * Il ne sait pas comparer un mot de passe — c'est l'affaire de
 * `session_authentification`, qui reste le seul endroit à le savoir. Il dit
 * seulement si une adresse a encore droit à une tentative, et retient le
 * résultat de celle-ci.
 */

/**
 * Le nombre de tentatives échouées tolérées par adresse et par fenêtre.
 *
 * Dix laisse largement place à l'acheteur qui hésite sur son propre mot de
 * passe, et ne laisse rien à qui en essaie des listes.
 */
export const TENTATIVES = 10

/**
 * La durée pendant laquelle les échecs se cumulent, puis s'effacent.
 *
 * Quinze minutes ramènent un attaquant à quarante tentatives par heure, un
 * rythme auquel une liste de mots de passe courants prend des années. Le
 * propriétaire qui s'est verrouillé, lui, n'attend qu'un quart d'heure.
 */
export const FENETRE = '15 minutes'

/** Le compteur, tel que le magasin le connaît. */
function compteur() {
  return limiter.use({ requests: TENTATIVES, duration: FENETRE })
}

/**
 * La clé sous laquelle une adresse est comptée.
 *
 * Préfixée : le magasin est une table partagée, et une adresse ne doit pas
 * pouvoir entrer en collision avec la clé d'un autre usage ajouté plus tard.
 */
function cle(adresse: string) {
  return `connexion_${adresse}`
}

/**
 * L'adresse de l'appelant a-t-elle encore droit à une tentative ?
 *
 * Interrogé avant la comparaison du mot de passe, jamais après : au-delà du
 * quota, le mot de passe proposé n'est pas comparé du tout.
 */
export async function tentativeAutorisee({ request }: HttpContext): Promise<boolean> {
  const etat = await compteur().get(cle(request.ip()))

  return etat === null || etat.remaining > 0
}

/**
 * Retient une tentative échouée, qui rapproche l'adresse de son quota.
 *
 * Seuls les échecs comptent : une connexion réussie ne consomme rien, sans
 * quoi un usage normal finirait par s'épuiser lui-même.
 */
export async function tentativeEchouee({ request }: HttpContext): Promise<void> {
  await compteur().increment(cle(request.ip()))
}

/**
 * Efface le compteur d'une adresse, après une connexion réussie.
 *
 * Qui vient de prouver qu'il connaît le mot de passe n'est pas celui qu'on
 * cherche à ralentir : le décompte de ses erreurs précédentes n'a plus lieu
 * d'être.
 */
export async function tentativeReussie({ request }: HttpContext): Promise<void> {
  await compteur().delete(cle(request.ip()))
}
