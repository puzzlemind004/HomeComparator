import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'biens'

  /**
   * Les Notes : le texte libre attaché à un Bien (#8, ADR-0012).
   *
   * `text` et non `string` : les autres colonnes de texte sont des
   * `varchar(255)` parce qu'elles portent une adresse ou un quartier, tandis
   * que les Notes accueillent des impressions de visite et la liste des
   * travaux à prévoir. Une borne à 255 caractères ferait perdre en cours de
   * frappe ce qu'on est venu écrire, et c'est justement ce que les Notes
   * absorbent — l'imprévu que la liste figée des Critères ne couvrira jamais.
   *
   * Nullable et sans défaut, comme tout le reste : un Bien sans Notes est le
   * cas ordinaire au repérage (ADR-0008). `null` vaut « rien d'écrit », et
   * la chaîne vide n'est jamais stockée — le validateur la ramène à `null`.
   */
  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.text('notes').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('notes')
    })
  }
}
