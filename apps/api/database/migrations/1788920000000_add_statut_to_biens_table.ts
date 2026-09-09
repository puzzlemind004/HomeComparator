import { BaseSchema } from '@adonisjs/lucid/schema'
import { STATUT_INITIAL } from '#services/statut'

export default class extends BaseSchema {
  protected tableName = 'biens'

  /**
   * Le Statut et les deux champs qui en dépendent (#7).
   *
   * Le Statut est la seule colonne obligatoire du carnet avec le Libellé :
   * un Bien est toujours quelque part dans la recherche, et « pas de
   * Statut » ne veut rien dire. Les deux autres colonnes sont nullables au
   * même titre que les Critères — la date de visite reste vide tant que le
   * rendez-vous n'est pas fixé (#7), et le montant d'offre n'existe pas
   * avant qu'une offre soit faite.
   *
   * `string` et non un type `enum` PostgreSQL, comme pour les énumérations
   * de Critères (ADR-0004) : la liste vit dans la définition centralisée, et
   * un `ALTER TYPE` à chaque valeur ajoutée coûterait plus cher que la
   * contrainte ne rapporte.
   */
  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('statut').nullable()

      // Un jour sans heure : c'est la date du rendez-vous, et l'heure ne se
      // compare pas d'un Bien à l'autre. Un `timestamp` ferait en outre
      // dépendre la date affichée du fuseau du navigateur.
      table.date('date_visite').nullable()

      // En euros entiers, comme le prix demandé : le centime n'a pas de sens
      // sur une offre d'achat immobilier.
      table.integer('montant_derniere_offre').nullable()
    })

    // Les Biens déjà saisis sont au début du cycle : rien ne dit qu'ils ont
    // été contactés, et c'est là que la création les aurait mis.
    this.defer(async (db) => {
      await db.from(this.tableName).whereNull('statut').update({ statut: STATUT_INITIAL })
    })

    // `notNullable` une fois les lignes existantes remplies : l'ordre
    // inverse échouerait sur une base qui porte déjà des Biens.
    this.schema.alterTable(this.tableName, (table) => {
      table.string('statut').notNullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('statut')
      table.dropColumn('date_visite')
      table.dropColumn('montant_derniere_offre')
    })
  }
}
