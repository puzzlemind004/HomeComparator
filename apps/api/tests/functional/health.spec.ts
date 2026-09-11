import { test } from '@japa/runner'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import { avecSession, ouvrirSession } from '#tests/session'
import { cheminHorodatageSauvegarde } from '#services/derniere_sauvegarde'

/**
 * La route de santé, à deux niveaux (#67).
 *
 * Sans session elle dit ce qu'un healthcheck a besoin de savoir, et rien de
 * plus : le service répond, la base répond. Avec session elle ajoute la
 * version déployée et la date de la dernière sauvegarde réussie — deux
 * renseignements qui n'ont pas à être publics, une date ancienne annonçant
 * à qui la lit que les données ne sont plus protégées.
 *
 * L'horodatage vit dans un fichier à part pendant les tests
 * (`HORODATAGE_SAUVEGARDE` dans `.env.test`), écrit et effacé ici : ils ne
 * touchent jamais celui du volume réel.
 */
test.group('Route de santé', (group) => {
  group.each.setup(async () => {
    await rm(cheminHorodatageSauvegarde(), { force: true })
  })

  group.teardown(async () => {
    await rm(cheminHorodatageSauvegarde(), { force: true })
  })

  /** Dépose l'horodatage que la sauvegarde déposera un jour elle-même. */
  async function sauvegardeDatee(date: string) {
    await mkdir(dirname(cheminHorodatageSauvegarde()), { recursive: true })
    await writeFile(cheminHorodatageSauvegarde(), `${date}\n`, 'utf8')
  }

  /**
   * La base éteinte **pour le contrôleur**, simulée sans l'éteindre.
   *
   * Seul `rawQuery` est rejeté, qui est tout ce que la sonde du contrôleur
   * appelle : une promesse rejetée suffit, sans bâtir un query builder.
   *
   * La portée de ce leurre est à énoncer, parce qu'elle est plus étroite
   * qu'il n'y paraît. Le magasin de session passe par le query builder et
   * non par `rawQuery` : il continue donc de répondre ici, là où une vraie
   * panne l'emporterait avec le reste. Ces tests décrivent le contrôleur
   * face à une base qui ne répond plus, et non la route face à une panne
   * totale — laquelle échoue aujourd'hui dans le middleware de session,
   * avant que le contrôleur ne soit atteint (#73).
   *
   * Rend de quoi tout remettre en place, l'objet `db` étant partagé par
   * toute la suite.
   */
  function baseEteinte() {
    const original = db.connection.bind(db)

    db.connection = ((...args: Parameters<typeof original>) => {
      const connection = original(...args)
      connection.rawQuery = (() =>
        Promise.reject(new Error('connexion refusée'))) as unknown as typeof connection.rawQuery
      return connection
    }) as typeof db.connection

    return () => {
      db.connection = original
    }
  }

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
    const retablir = baseEteinte()

    try {
      const response = await client.get('/health')

      response.assertStatus(503)
      assert.equal(response.body().database, 'unreachable')
    } finally {
      retablir()
    }
  })

  test('ne dit ni la version ni la sauvegarde à un appelant anonyme', async ({
    client,
    assert,
  }) => {
    // Une date de sauvegarde ancienne annoncerait à qui la lit que les
    // données ne sont plus protégées : elle n'a rien à faire ici.
    await sauvegardeDatee('2026-09-10T02:00:00.000Z')

    const response = await client.get('/health')

    response.assertStatus(200)
    assert.notProperty(response.body(), 'version')
    assert.notProperty(response.body(), 'derniereSauvegarde')
  })

  test('ajoute la version déployée à un appelant muni d’une session', async ({
    client,
    assert,
  }) => {
    const session = await ouvrirSession(client)

    const response = await avecSession(client.get('/health'), session)

    response.assertStatus(200)
    assert.equal(response.body().version, env.get('APP_VERSION'))
  })

  test('ajoute la date de la dernière sauvegarde réussie', async ({ client, assert }) => {
    await sauvegardeDatee('2026-09-10T02:00:00.000Z')
    const session = await ouvrirSession(client)

    const response = await avecSession(client.get('/health'), session)

    response.assertStatus(200)
    assert.equal(response.body().derniereSauvegarde, '2026-09-10T02:00:00.000Z')
  })

  test('dit l’absence de sauvegarde plutôt que de se taire', async ({ client, assert }) => {
    // Rien ne dépose encore cet horodatage — c'est le ticket de sauvegarde
    // qui le fera. D'ici là la route rend l'absence, et l'absence dite se
    // distingue d'une route qui ne saurait pas : la clé est là, à `null`.
    const session = await ouvrirSession(client)

    const response = await avecSession(client.get('/health'), session)

    response.assertStatus(200)
    assert.property(response.body(), 'derniereSauvegarde')
    assert.isNull(response.body().derniereSauvegarde)
  })

  test('reste joignable base éteinte pour un appelant muni d’une session', async ({
    client,
    assert,
  }) => {
    /**
     * La session est ouverte **avant** d'éteindre la base : elle vit en
     * base (ADR-0011), et l'appelant du vrai incident a la sienne depuis
     * bien avant la panne. Ce que le test vérifie est qu'une base qui ne
     * répond plus au contrôleur ne fait pas retomber la route au niveau
     * anonyme — la version ne dépend de rien qui puisse tomber, et la
     * sauvegarde se lit sur le volume et non en base.
     */
    const session = await ouvrirSession(client)
    const retablir = baseEteinte()

    try {
      const response = await avecSession(client.get('/health'), session)

      response.assertStatus(503)
      assert.equal(response.body().database, 'unreachable')
      assert.equal(response.body().version, env.get('APP_VERSION'))
      assert.property(response.body(), 'derniereSauvegarde')
    } finally {
      retablir()
    }
  })
})
