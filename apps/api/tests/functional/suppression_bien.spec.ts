import { test } from '@japa/runner'
import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import sharp from 'sharp'
import db from '@adonisjs/lucid/services/db'
import Bien from '#models/bien'
import Photo from '#models/photo'
import { avecSession, ouvrirSession, type Session } from '#tests/session'
import { PROPRIETAIRE_UNIQUE } from '#services/proprietaire'
import { STATUT_INITIAL } from '#services/statut'
import { cheminPhoto, racineStockage } from '#services/stockage_photos'

/**
 * La suppression définitive d'un Bien (#9).
 *
 * Elle ne remplace pas le Statut Écarté : écarter est une décision qu'on
 * garde en mémoire, supprimer corrige une erreur de saisie ou un doublon.
 *
 * Pas de corbeille et pas de restauration : ce que ces tests décrivent est
 * une disparition, et les sauvegardes quotidiennes couvrent la fausse
 * manœuvre (ADR-0007).
 */
test.group('Suppression d’un Bien', (group) => {
  let session: Session

  group.each.setup(async ({ context }) => {
    await db.from('photos').delete()
    await db.from('biens').delete()
    await rm(racineStockage(), { recursive: true, force: true })
    session = await ouvrirSession(context.client)
  })

  group.teardown(async () => {
    await rm(racineStockage(), { recursive: true, force: true })
  })

  async function unBien(criteres: Partial<Bien> = {}) {
    return Bien.create({
      libelle: 'le T3 avec la terrasse',
      urlAnnonce: null,
      proprietaireId: PROPRIETAIRE_UNIQUE,
      statut: STATUT_INITIAL,
      ...criteres,
    })
  }

  /** Une vraie image : `sharp` la relit pour produire les deux versions. */
  async function uneImage() {
    return sharp({
      create: {
        width: 1200,
        height: 900,
        channels: 3,
        background: { r: 120, g: 140, b: 160 },
      },
    })
      .jpeg()
      .toBuffer()
  }

  test('supprime un Bien', async ({ client, assert }) => {
    const bien = await unBien()

    const response = await avecSession(client.delete(`/biens/${bien.id}`), session)

    response.assertStatus(204)
    assert.isNull(await Bien.find(bien.id))
  })

  test('rend un corps vide plutôt qu’un Bien qui n’existe plus', async ({ client, assert }) => {
    // Rendre le Bien supprimé inviterait l'écran à l'afficher encore. Il n'y
    // a rien à dire d'un Bien qui n'est plus là.
    const bien = await unBien()

    const response = await avecSession(client.delete(`/biens/${bien.id}`), session)

    assert.isEmpty(response.body())
  })

  test('fait disparaître le Bien supprimé de la liste', async ({ client, assert }) => {
    const supprime = await unBien({ libelle: 'le doublon' })
    const garde = await unBien({ libelle: 'celui avec la cuisine refaite' })

    await avecSession(client.delete(`/biens/${supprime.id}`), session)

    const liste = await avecSession(client.get('/biens'), session)

    liste.assertStatus(200)
    assert.deepEqual(
      liste.body().map(({ id }: { id: number }) => id),
      [garde.id]
    )
  })

  test('rend la fiche d’un Bien supprimé inaccessible', async ({ client }) => {
    const bien = await unBien()

    await avecSession(client.delete(`/biens/${bien.id}`), session)

    const fiche = await avecSession(client.get(`/biens/${bien.id}`), session)

    fiche.assertStatus(404)
  })

  test('répond 404 pour un Bien qui n’existe pas', async ({ client }) => {
    // La suppression n'est pas idempotente au sens du 204 : l'écran a
    // demandé la disparition d'un Bien précis, et apprendre qu'il n'était
    // déjà plus là vaut mieux qu'un succès qui ne dit rien.
    const response = await avecSession(client.delete('/biens/404'), session)

    response.assertStatus(404)
  })

  test('répond 404 sur un identifiant qui n’est pas un nombre', async ({ client, assert }) => {
    const response = await avecSession(client.delete('/biens/abc'), session)

    response.assertStatus(404)
    // Le 500 de PostgreSQL porterait le texte de la requête dans sa réponse.
    assert.notInclude(JSON.stringify(response.body()), 'select')
  })

  test('ne laisse aucune donnée liée au Bien supprimé', async ({ client, assert }) => {
    /**
     * Tout ce qui est noté d'un Bien part avec lui : les Critères en
     * colonnes (ADR-0004), les Notes dans la leur (ADR-0012), les champs
     * liés au Statut dans les leurs (ADR-0002) — et depuis #13 les photos,
     * qui sont la première chose à s'y rattacher.
     *
     * Ce test tenait autrefois cette propriété en exigeant qu'**aucune**
     * clé étrangère ne pointe vers `biens`. C'était le bon garde tant que
     * rien ne s'y rattachait, et il devait échouer le jour où quelque chose
     * s'y rattacherait : c'est arrivé, et la réponse n'est pas de
     * l'assouplir mais de le remplacer par ce qu'il gardait vraiment — que
     * la ligne partie, il ne reste rien du Bien **nulle part**.
     *
     * « Nulle part » comprend le volume Docker, que l'ancien garde ne
     * regardait pas et ne pouvait pas regarder : `ON DELETE CASCADE` règle
     * les lignes, les fichiers n'ont pas cet équivalent. C'est très
     * exactement le trou que ce test ferme maintenant.
     */
    const bien = await unBien({
      prixDemande: 250_000,
      notes: 'des travaux dans la salle de bain',
      dpe: 'C',
    })

    const ajout = await avecSession(
      client.post(`/biens/${bien.id}/photos`).file('photos', await uneImage(), {
        filename: 'salon.jpg',
      }),
      session
    )

    const photo = await Photo.findOrFail(ajout.body()[0].id)

    // Les fichiers sont bien là avant : sans quoi le test passerait tout
    // aussi bien sur un stockage qui n'a jamais rien écrit.
    assert.isTrue(existsSync(cheminPhoto(photo.fichier)))
    assert.isTrue(existsSync(cheminPhoto(photo.fichierVignette)))

    await avecSession(client.delete(`/biens/${bien.id}`), session)

    const restant = await db.from('biens').where('id', bien.id)
    assert.isEmpty(restant)

    // Les lignes de photos, que la clé étrangère emporte en cascade.
    assert.isEmpty(await db.from('photos').where('bien_id', bien.id))

    // Et les fichiers, que rien en base n'emporte : c'est le contrôleur qui
    // les efface, avant de supprimer la ligne (#9, #13).
    assert.isFalse(existsSync(cheminPhoto(photo.fichier)))
    assert.isFalse(existsSync(cheminPhoto(photo.fichierVignette)))
  })

  test('supprime un Bien dont un fichier de photo a déjà disparu', async ({ client, assert }) => {
    /**
     * Le cas qui n'a pas d'équivalent en base : le fichier n'est plus là
     * quand on vient l'effacer — volume restauré d'une sauvegarde plus
     * ancienne, effacement manuel, précédente tentative interrompue.
     *
     * C'est un succès et non une erreur : l'état visé est atteint. Refuser
     * de supprimer le Bien pour cette raison garderait dans le carnet un
     * Bien dont l'acheteur a demandé la disparition, pour une raison de
     * disque qui ne le concerne pas.
     */
    const bien = await unBien()

    const ajout = await avecSession(
      client.post(`/biens/${bien.id}/photos`).file('photos', await uneImage(), {
        filename: 'salon.jpg',
      }),
      session
    )

    const photo = await Photo.findOrFail(ajout.body()[0].id)

    await rm(cheminPhoto(photo.fichier), { force: true })

    const response = await avecSession(client.delete(`/biens/${bien.id}`), session)

    response.assertStatus(204)
    assert.isNull(await Bien.find(bien.id))
    // La vignette, elle, est bien partie : un fichier absent n'interrompt
    // pas l'effacement des autres.
    assert.isFalse(existsSync(cheminPhoto(photo.fichierVignette)))
  })

  test('garde le Bien quand les fichiers de ses photos résistent', async ({ client, assert }) => {
    /**
     * Le chemin d'échec de l'ordre choisi (ADR-0014), un cran plus haut que
     * pour une photo seule : un fichier récalcitrant arrête la suppression
     * du Bien. La supprimer malgré tout laisserait sur le volume des
     * fichiers que plus rien ne désigne — l'orphelin que cet ordre existe
     * pour éviter.
     *
     * Le Bien reste au carnet, et c'est lui qui permet de réessayer une fois
     * le disque libéré.
     */
    const bien = await unBien()

    const ajout = await avecSession(
      client.post(`/biens/${bien.id}/photos`).file('photos', await uneImage(), {
        filename: 'salon.jpg',
      }),
      session
    )

    const photo = await Photo.findOrFail(ajout.body()[0].id)

    // Un dossier à la place du fichier : `unlink` y échoue autrement que
    // par `ENOENT`, qui serait le cas « déjà absent », lui un succès.
    await rm(cheminPhoto(photo.fichier), { force: true })
    await mkdir(cheminPhoto(photo.fichier), { recursive: true })

    const response = await avecSession(client.delete(`/biens/${bien.id}`), session)

    response.assertStatus(503)
    assert.isNotNull(await Bien.find(bien.id))
  })

  test('exige la session pour supprimer', async ({ client, assert }) => {
    const bien = await unBien()

    const response = await client.delete(`/biens/${bien.id}`)

    response.assertStatus(401)
    // Un refus qui aurait tout de même supprimé serait le pire des deux.
    assert.isNotNull(await Bien.find(bien.id))
  })
})
