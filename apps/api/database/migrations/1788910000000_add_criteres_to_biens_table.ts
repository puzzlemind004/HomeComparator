import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'biens'

  /**
   * Les quinze Critères identifiés à l'expression du besoin, chacun dans sa
   * propre colonne typée plutôt que dans un objet JSON (ADR-0004) : c'est ce
   * qui garde le tri et le filtrage du côté de SQL, là où le tableau desktop
   * (#10) ira les chercher.
   *
   * Toutes nullables, sans exception et sans valeur par défaut. Créer un Bien
   * ne demande qu'un Libellé (ADR-0008) ; un Critère non renseigné doit se
   * distinguer d'un Critère à zéro, ce qu'un défaut à `0` rendrait
   * impossible — le tableau doit ranger les absents en fin de tri et non les
   * traiter comme le moins cher.
   *
   * Les énumérations sont écrites en `string` et non en type `enum`
   * PostgreSQL : la liste des valeurs vit dans la définition centralisée
   * côté front, et un `ALTER TYPE` à chaque valeur ajoutée coûterait plus
   * cher que la contrainte ne rapporte sur un carnet à un utilisateur.
   */
  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Argent : des entiers en euros. Le centime n'a pas de sens sur un
      // prix affiché ni sur une taxe annuelle, et il ferait saisir deux
      // caractères de plus à chaque fois.
      table.integer('prix_demande').nullable()
      table.integer('taxe_fonciere').nullable()
      table.integer('charges_copropriete').nullable()

      // La surface se négocie au dixième de mètre carré près : les annonces
      // affichent « 72,5 m² », et arrondir fausserait le prix au m².
      table.decimal('surface_habitable', 8, 2).nullable()

      table.integer('nombre_pieces').nullable()
      table.integer('capacite_stationnement').nullable()

      // En minutes : l'unité dans laquelle un service de cartographie rend
      // la réponse que l'acheteur recopie à la main (ADR-0009).
      table.integer('temps_trajet_travail').nullable()

      table.integer('annee_construction').nullable()

      // L'adresse est souvent absente de l'annonce, où les agences ne
      // publient qu'un quartier (ADR-0008) : les deux colonnes coexistent
      // parce que la seconde est renseignable quand la première ne l'est pas.
      table.string('adresse').nullable()
      table.string('ville_quartier').nullable()

      table.string('dpe').nullable()
      table.string('type_chauffage').nullable()
      table.string('type_bien').nullable()
      table.string('exterieur').nullable()
      table.string('travaux_a_prevoir').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('prix_demande')
      table.dropColumn('taxe_fonciere')
      table.dropColumn('charges_copropriete')
      table.dropColumn('surface_habitable')
      table.dropColumn('nombre_pieces')
      table.dropColumn('capacite_stationnement')
      table.dropColumn('temps_trajet_travail')
      table.dropColumn('annee_construction')
      table.dropColumn('adresse')
      table.dropColumn('ville_quartier')
      table.dropColumn('dpe')
      table.dropColumn('type_chauffage')
      table.dropColumn('type_bien')
      table.dropColumn('exterieur')
      table.dropColumn('travaux_a_prevoir')
    })
  }
}
