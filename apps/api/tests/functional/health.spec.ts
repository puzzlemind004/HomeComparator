import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'

test.group('Route de santé', () => {
  test('répond 200 et annonce le service en bonne santé', async ({ client }) => {
    const response = await client.get('/health')

    response.assertStatus(200)
    response.assertBodyContains({ status: 'ok' })
  })

  test('rend compte de la connexion à la base', async ({ client }) => {
    const response = await client.get('/health')

    response.assertStatus(200)
    response.assertBodyContains({ database: 'ok' })
  })

  test('signale la base en panne sans faire échouer la route', async ({ client, assert }) => {
    // La route de santé doit rester joignable même base éteinte : c'est
    // précisément le cas qu'elle sert à diagnostiquer.
    const original = db.connection.bind(db)
    db.connection = ((...args: Parameters<typeof original>) => {
      const connection = original(...args)
      // Le contrôleur ne fait qu'attendre le résultat : une promesse
      // rejetée suffit à simuler la panne, sans bâtir un query builder.
      connection.rawQuery = (() =>
        Promise.reject(new Error('connexion refusée'))) as unknown as typeof connection.rawQuery
      return connection
    }) as typeof db.connection

    try {
      const response = await client.get('/health')

      response.assertStatus(503)
      assert.equal(response.body().database, 'unreachable')
    } finally {
      db.connection = original
    }
  })
})
