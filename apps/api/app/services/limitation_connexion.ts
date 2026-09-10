import { isIP } from 'node:net'
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

/**
 * Le préfixe des clés de ce compteur.
 *
 * Nommé ici et pas ailleurs, pour la même raison que `CLE_SESSION` : le
 * magasin est une table partagée, et deux orthographes divergentes feraient
 * deux compteurs là où il n'en faut qu'un — donc deux fois le quota pour
 * qui essaie.
 */
const PREFIXE_CLE = 'connexion_'

/**
 * Le compteur, tel que le magasin le connaît.
 *
 * Exporté pour que les tests interrogent le compteur réel plutôt que d'en
 * reconstruire un à l'identique : deux définitions qui divergeraient
 * laisseraient les tests au vert sur un quota qui n'est plus celui-là.
 */
export function compteur() {
  return limiter.use({ requests: TENTATIVES, duration: FENETRE })
}

/** La clé sous laquelle une adresse est comptée. */
export function cle(adresse: string) {
  return `${PREFIXE_CLE}${adresse}`
}

/**
 * L'adresse de l'appelant, ou rien si ce n'en est pas une.
 *
 * `X-Forwarded-For` n'est validé par personne : `proxy-addr` retient le
 * premier maillon non fiable tel quel, et `request.ip()` peut donc rendre
 * du texte arbitraire, de longueur arbitraire. Servi tel quel au compteur,
 * ce texte partait en clé vers une colonne bornée, et l'erreur de
 * PostgreSQL remontait en 500 portant le texte de la contrainte — sur la
 * route qui s'applique précisément à ne jamais rendre autre chose qu'un
 * 401 (ADR-0011).
 *
 * On ne tronque pas, on écarte : une clé tronquée rangerait sous un même
 * compteur des appelants qui n'ont rien à voir. Ce qui n'a pas la forme
 * d'une adresse n'est pas une adresse, et n'a pas de compteur.
 */
function adresseDe({ request }: HttpContext): string | null {
  const adresse = request.ip()

  return isIP(adresse) ? adresse : null
}

/**
 * L'adresse de l'appelant a-t-elle encore droit à une tentative ?
 *
 * Interrogé avant la comparaison du mot de passe, jamais après : au-delà du
 * quota, le mot de passe proposé n'est pas comparé du tout.
 */
export async function tentativeAutorisee(ctx: HttpContext): Promise<boolean> {
  const adresse = adresseDe(ctx)

  // Sans adresse reconnaissable, il n'y a personne à compter. La tentative
  // suit alors son cours et sera refusée comme les autres si le mot de
  // passe ne convient pas : c'est le comportement d'avant la limitation,
  // et il ne rend rien de plus à qui essaie.
  if (adresse === null) {
    return true
  }

  const etat = await compteur().get(cle(adresse))

  return etat === null || etat.remaining > 0
}

/**
 * Retient une tentative échouée, qui rapproche l'adresse de son quota.
 *
 * Seuls les échecs comptent : une connexion réussie ne consomme rien, sans
 * quoi un usage normal finirait par s'épuiser lui-même.
 */
export async function tentativeEchouee(ctx: HttpContext): Promise<void> {
  const adresse = adresseDe(ctx)

  if (adresse === null) {
    return
  }

  await compteur().increment(cle(adresse))
}

/**
 * Efface le compteur d'une adresse, après une connexion réussie.
 *
 * Qui vient de prouver qu'il connaît le mot de passe n'est pas celui qu'on
 * cherche à ralentir : le décompte de ses erreurs précédentes n'a plus lieu
 * d'être.
 */
export async function tentativeReussie(ctx: HttpContext): Promise<void> {
  const adresse = adresseDe(ctx)

  if (adresse === null) {
    return
  }

  await compteur().delete(cle(adresse))
}
