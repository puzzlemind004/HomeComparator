import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import { estAuthentifie } from '#services/session_authentification'
import { derniereSauvegardeReussie } from '#services/derniere_sauvegarde'

/**
 * Route de santé : elle sert à savoir si l'API répond et si elle
 * atteint sa base. Elle doit donc rester joignable base éteinte,
 * et se contenter alors de le signaler.
 *
 * Elle répond à deux niveaux (#67). Sans session, l'état du service et
 * celui de la base, et rien de plus : c'est ce que le healthcheck Docker
 * interroge, et c'est tout ce qu'un appelant anonyme a à apprendre. Avec
 * une session valide, elle y ajoute la version déployée et la date de la
 * dernière sauvegarde réussie — deux renseignements qui n'ont pas à être
 * publics, une date ancienne annonçant à qui la lit que les données ne
 * sont plus protégées.
 *
 * Aux deux niveaux, une base qui ne répond plus est signalée et non subie :
 * la sonde est rattrapée, le statut passe à `degraded`, et la réponse part
 * quand même. C'est la raison d'être de la route — on l'interroge quand
 * plus rien ne répond — et c'est aussi pourquoi la version et la date de
 * sauvegarde ne se lisent pas en base : ni l'une ni l'autre ne tombe avec
 * elle.
 *
 * Ce contrôleur tient donc sa part, mais elle ne suffit pas encore : base
 * réellement éteinte, le middleware de session tombe avant qu'on arrive
 * ici, et la route rend un 500 (#73). Le rattrapage ci-dessous est ce qui
 * la rendra joignable le jour où ce middleware ne la devancera plus.
 */
export default class HealthController {
  async handle(ctx: HttpContext) {
    const { response } = ctx
    const database = await this.checkDatabase()
    const sain = database === 'ok'

    const sante = {
      status: sain ? 'ok' : 'degraded',
      database,
    }

    if (!estAuthentifie(ctx)) {
      return response.status(sain ? 200 : 503).send(sante)
    }

    const derniereSauvegarde = await derniereSauvegardeReussie()

    return response.status(sain ? 200 : 503).send({
      ...sante,
      version: env.get('APP_VERSION'),
      /**
       * `null` et non une clé absente : l'absence de sauvegarde se dit, et
       * se distingue ainsi d'une route qui ne saurait pas la dire. Un
       * appelant qui ne trouve pas la clé ne peut pas conclure — il ne sait
       * pas s'il interroge un carnet non sauvegardé ou une version de l'API
       * antérieure à ce renseignement.
       */
      derniereSauvegarde: derniereSauvegarde?.toUTC().toISO() ?? null,
    })
  }

  private async checkDatabase(): Promise<'ok' | 'unreachable'> {
    try {
      await db.connection().rawQuery('select 1')
      return 'ok'
    } catch {
      return 'unreachable'
    }
  }
}
