import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'biens'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      /**
       * Le Libellé est la seule donnée obligatoire à la création d'un Bien
       * (ADR-0008). Les Critères arrivent ensuite, chacun apportant sa
       * propre colonne (ADR-0004) par sa propre migration.
       */
      table.string('libelle').notNullable()

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
