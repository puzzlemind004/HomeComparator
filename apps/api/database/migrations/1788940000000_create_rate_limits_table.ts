import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Le compteur des tentatives de connexion échouées, par adresse (#26).
 *
 * Le schéma est celui qu'attend `rate-limiter-flexible`, sur lequel repose
 * le magasin base de `@adonisjs/limiter` : les noms de colonnes ne sont pas
 * libres.
 *
 * Comme la table `sessions`, ce n'est pas une donnée du carnet : elle se
 * reconstitue d'elle-même, et une sauvegarde qui l'omettrait ne perdrait
 * rien d'irremplaçable (ADR-0007).
 */
export default class extends BaseSchema {
  protected tableName = 'rate_limits'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('key', 255).notNullable().primary()
      table.integer('points', 9).notNullable().defaultTo(0)
      table.bigint('expire').unsigned()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
