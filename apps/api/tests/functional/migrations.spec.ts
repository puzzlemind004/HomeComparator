import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'

test.group('Migrations', () => {
  test('les migrations sont jouées avant les tests', async ({ assert }) => {
    // Le même mécanisme est joué au démarrage du conteneur par
    // docker-entrypoint.sh : ce test garantit qu'il produit un schéma.
    const hasBiens = await db.connection().schema.hasTable('biens')

    assert.isTrue(hasBiens)
  })

  test('la colonne de propriétaire est en place et obligatoire', async ({ assert }) => {
    // Elle ne sert aucun écran : c'est la migration seule qui la porte, et
    // rien d'autre ne signalerait sa disparition (#4).
    const colonne = await db.connection().columnsInfo('biens', 'proprietaire_id')

    assert.isFalse(colonne.nullable)
  })
})
