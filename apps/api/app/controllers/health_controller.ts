import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

/**
 * Route de santé : elle sert à savoir si l'API répond et si elle
 * atteint sa base. Elle doit donc rester joignable base éteinte,
 * et se contenter alors de le signaler.
 */
export default class HealthController {
  async handle({ response }: HttpContext) {
    const database = await this.checkDatabase()

    return response.status(database === 'ok' ? 200 : 503).send({
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
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
