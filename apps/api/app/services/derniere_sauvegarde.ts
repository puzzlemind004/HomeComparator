import { readFile } from 'node:fs/promises'
import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'

/**
 * La date de la dernière sauvegarde réussie (#67).
 *
 * La sauvegarde quotidienne tourne hors de l'API — le service `sauvegarde`
 * de la pile, qui produit un `pg_dump` et une archive des Photos chaque nuit
 * (#71, ADR-0007) —, et l'API n'a aucun moyen de l'observer : elle ne la
 * déclenche pas, ne la supervise pas, et un carnet redémarré ne se souvient
 * de rien. L'horodatage est donc **déposé** par qui sauvegarde et **lu**
 * ici, sur le volume que les deux partagent.
 *
 * Ce volume ne porte que cet horodatage : les archives vivent dans un second
 * volume que l'API ne monte pas (#75). Un dump porte le carnet entier, et
 * rien dans le besoin de l'API ne justifie qu'elle le voie.
 *
 * Ce module est le seul à savoir qu'un fichier est derrière. Le contrôleur
 * pose une question — quand, ou jamais — et reçoit une date ou son absence ;
 * le jour où l'horodatage vivrait ailleurs, en base ou dans un service de
 * supervision, c'est ici seulement que cela se verrait.
 *
 * L'absence garde un sens après #71, et ce n'est plus le même : elle
 * signifiait « rien ne sauvegarde encore », elle signifie désormais
 * « aucune sauvegarde n'a réussi » — le service tourne, mais il n'a pas
 * encore abouti une fois, ou plus rien n'aboutit. C'est la même réponse et
 * elle reste exacte ; c'est ce qu'elle doit déclencher qui a changé.
 */

/**
 * Le chemin de l'horodatage, tel que la configuration le donne.
 *
 * Exporté pour les tests, qui déposent et effacent ce fichier. Ce qui
 * appelle en production n'en a pas besoin : la question se pose sans chemin.
 */
export function cheminHorodatageSauvegarde(): string {
  return env.get('HORODATAGE_SAUVEGARDE')
}

/**
 * Quand la dernière sauvegarde a réussi, ou `null` si aucune n'a réussi.
 *
 * `null` couvre trois cas que l'appelant n'a pas à distinguer : le fichier
 * absent, le fichier illisible, et le fichier dont le contenu n'est pas une
 * date. Les trois disent la même chose à l'acheteur — rien n'atteste qu'une
 * sauvegarde ait réussi —, et c'est très exactement l'information sur
 * laquelle il agirait. Un fichier corrompu se distingue tout de même dans
 * les journaux : il signale une sauvegarde qui écrit mal, là où l'absence
 * signale une sauvegarde qui ne tourne pas.
 */
export async function derniereSauvegardeReussie(): Promise<DateTime | null> {
  let contenu: string

  try {
    contenu = await readFile(cheminHorodatageSauvegarde(), 'utf8')
  } catch (erreur) {
    // Absent : aucune sauvegarde n'a encore réussi, ce qui est un état
    // normal tant que rien ne dépose l'horodatage, et n'a rien à signaler.
    if (erreur instanceof Error && 'code' in erreur && erreur.code === 'ENOENT') {
      return null
    }

    logger.warn({ erreur }, "L'horodatage de la dernière sauvegarde n'a pas pu être lu")

    return null
  }

  /**
   * ISO 8601, le format que la sauvegarde écrit (`date -u -Iseconds`) et le
   * seul accepté : un horodatage en base dix ou en langue locale se lirait
   * de plusieurs façons, et une date mal relue vaudrait moins que pas de
   * date du tout — elle rassurerait à tort.
   */
  const date = DateTime.fromISO(contenu.trim(), { zone: 'utc' })

  if (!date.isValid) {
    logger.warn(
      { contenu: contenu.trim() },
      "L'horodatage de la dernière sauvegarde n'est pas une date ISO 8601"
    )

    return null
  }

  return date
}
