import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'

test.group('Migrations', () => {
  test('les migrations sont jouées avant les tests', async ({ assert }) => {
    // Le même mécanisme est joué au démarrage du conteneur par
    // docker-entrypoint.sh : ce test garantit qu'il produit un schéma.
    const hasBiens = await db.connection().schema.hasTable('biens')

    assert.isTrue(hasBiens)
  })
})
