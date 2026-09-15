import { test } from '@japa/runner'
import { rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import sharp from 'sharp'
import db from '@adonisjs/lucid/services/db'
import Bien from '#models/bien'
import Commentaire from '#models/commentaire'
import Photo from '#models/photo'
import { avecSession, ouvrirSession, type Session } from '#tests/session'
import { PROPRIETAIRE_UNIQUE } from '#services/proprietaire'
import { STATUT_INITIAL } from '#services/statut'
import { cheminPhoto, racineStockage } from '#services/stockage_photos'

/**
 * Les Commentaires d'un Bien : ce qu'on note pendant la visite.
 *
 * Ces tests décrivent le geste du couloir — une photo, deux étoiles, trois
 * mots, en un seul envoi — et ce qui le distingue des Notes (ADR-0012) :
 * chaque Commentaire s'ajoute sans toucher aux précédents.
 */
test.group('Commentaires d’un Bien', (group) => {
  let session: Session

  group.each.setup(async ({ context }) => {
    await db.from('commentaires').delete()
    await db.from('photos').delete()
    await db.from('biens').delete()
    await rm(racineStockage(), { recursive: true, force: true })
    session = await ouvrirSession(context.client)
  })

  group.teardown(async () => {
    await rm(racineStockage(), { recursive: true, force: true })
  })

  async function unBien() {
    return Bien.create({
      libelle: 'le T3 avec la terrasse',
      urlAnnonce: null,
      proprietaireId: PROPRIETAIRE_UNIQUE,
      statut: STATUT_INITIAL,
    })
  }

  /**
   * Une vraie image, et non quelques octets déguisés : `sharp` la relit
   * pour la redimensionner, et un fichier qui n'en est pas une échouerait
   * pour une raison qui n'a rien à voir avec ce qu'on teste.
   */
  async function uneImage() {
    return sharp({
      create: { width: 1200, height: 900, channels: 3, background: { r: 120, g: 140, b: 160 } },
    })
      .jpeg()
      .toBuffer()
  }

  test('un Commentaire porte un texte, une photo et une appréciation en un seul envoi', async ({
    client,
    assert,
  }) => {
    const bien = await unBien()
    const image = await uneImage()

    const reponse = await avecSession(
      client
        .post(`/biens/${bien.id}/commentaires`)
        .field('texte', 'La salle de bain est à refaire')
        .field('note', '2')
        .file('photo', image, { filename: 'sdb.jpg' }),
      session
    )

    reponse.assertStatus(201)
    assert.equal(reponse.body().texte, 'La salle de bain est à refaire')
    assert.equal(reponse.body().note, 2)
    assert.isNotNull(reponse.body().photoId)

    /**
     * La photo est dans la galerie du Bien, pas dans un stockage à part :
     * rien ne distingue les photos en base (ADR-0014), et une photo de
     * visite rangée ailleurs serait introuvable le jour où on la cherche.
     */
    const photos = await Photo.duBien(bien.id)
    assert.lengthOf(photos, 1)
    assert.isTrue(existsSync(cheminPhoto(photos[0].fichier)))
    assert.equal(reponse.body().photoId, photos[0].id)
  })

  test('les trois champs sont facultatifs : un texte seul suffit', async ({ client, assert }) => {
    const bien = await unBien()

    const reponse = await avecSession(
      client.post(`/biens/${bien.id}/commentaires`).field('texte', 'Très lumineux le matin'),
      session
    )

    reponse.assertStatus(201)
    assert.isNull(reponse.body().photoId)
    assert.isNull(reponse.body().note)
  })

  test('une appréciation seule suffit, sans un mot', async ({ client, assert }) => {
    const bien = await unBien()

    const reponse = await avecSession(
      client.post(`/biens/${bien.id}/commentaires`).field('note', '5'),
      session
    )

    reponse.assertStatus(201)
    assert.equal(reponse.body().note, 5)
    assert.isNull(reponse.body().texte)
  })

  test('une photo seule suffit : un mur fissuré se passe de légende', async ({
    client,
    assert,
  }) => {
    const bien = await unBien()

    const reponse = await avecSession(
      client
        .post(`/biens/${bien.id}/commentaires`)
        .file('photo', await uneImage(), { filename: 'mur.jpg' }),
      session
    )

    reponse.assertStatus(201)
    assert.isNull(reponse.body().texte)
    assert.isNotNull(reponse.body().photoId)
  })

  /**
   * Un Commentaire entièrement vide ne dirait rien, et s'enregistrerait au
   * moindre appui sur « Ajouter » alors que rien n'a été saisi.
   */
  test('un Commentaire sans rien du tout est refusé', async ({ client }) => {
    const bien = await unBien()

    const reponse = await avecSession(client.post(`/biens/${bien.id}/commentaires`), session)

    reponse.assertStatus(422)
  })

  /** Un texte de seuls espaces ne dit rien de plus qu'un texte absent. */
  test('un texte de seuls espaces ne tient pas lieu de Commentaire', async ({ client }) => {
    const bien = await unBien()

    const reponse = await avecSession(
      client.post(`/biens/${bien.id}/commentaires`).field('texte', '   '),
      session
    )

    reponse.assertStatus(422)
  })

  /**
   * Une appréciation hors bornes est refusée plutôt que ramenée dedans :
   * une note qu'on n'a pas donnée ne doit pas s'inventer.
   */
  test('une appréciation hors des cinq étoiles est refusée', async ({ client }) => {
    const bien = await unBien()

    const reponse = await avecSession(
      client.post(`/biens/${bien.id}/commentaires`).field('texte', 'bien').field('note', '7'),
      session
    )

    reponse.assertStatus(422)
  })

  test('les Commentaires reviennent du plus récent au plus ancien, photo comprise', async ({
    client,
    assert,
  }) => {
    const bien = await unBien()

    await avecSession(
      client.post(`/biens/${bien.id}/commentaires`).field('texte', 'le premier'),
      session
    )
    await avecSession(
      client
        .post(`/biens/${bien.id}/commentaires`)
        .field('texte', 'le second')
        .file('photo', await uneImage(), { filename: 'cuisine.jpg' }),
      session
    )

    const reponse = await avecSession(client.get(`/biens/${bien.id}/commentaires`), session)

    reponse.assertStatus(200)
    assert.lengthOf(reponse.body(), 2)
    assert.equal(reponse.body()[0].texte, 'le second')
    assert.equal(reponse.body()[1].texte, 'le premier')

    /**
     * La photo voyage avec le Commentaire : l'écran compose son adresse à
     * partir d'elle, et une seconde requête par Commentaire ferait autant
     * d'allers-retours que de vignettes.
     */
    assert.isNotNull(reponse.body()[0].photo)
    assert.isNull(reponse.body()[1].photo)
  })

  /**
   * La photo n'est pas emportée par la suppression du Commentaire : elle
   * est dans la galerie comme les autres, et retirer une phrase mal écrite
   * ne demande pas d'effacer le cliché qu'elle accompagnait.
   */
  test('supprimer un Commentaire laisse sa photo dans la galerie', async ({ client, assert }) => {
    const bien = await unBien()

    const ajout = await avecSession(
      client
        .post(`/biens/${bien.id}/commentaires`)
        .field('texte', 'à refaire')
        .file('photo', await uneImage(), { filename: 'sdb.jpg' }),
      session
    )

    const reponse = await avecSession(
      client.delete(`/biens/${bien.id}/commentaires/${ajout.body().id}`),
      session
    )

    reponse.assertStatus(204)
    assert.lengthOf(await Commentaire.duBien(bien.id), 0)
    assert.lengthOf(await Photo.duBien(bien.id), 1)
  })

  /**
   * L'inverse : la photo supprimée depuis la galerie laisse le Commentaire
   * en place, sans son image. Le texte et l'appréciation ne se réécrivent
   * pas.
   */
  test('supprimer la photo depuis la galerie laisse le Commentaire sans image', async ({
    client,
    assert,
  }) => {
    const bien = await unBien()

    const ajout = await avecSession(
      client
        .post(`/biens/${bien.id}/commentaires`)
        .field('texte', 'à refaire')
        .file('photo', await uneImage(), { filename: 'sdb.jpg' }),
      session
    )

    const suppressionPhoto = await avecSession(
      client.delete(`/biens/${bien.id}/photos/${ajout.body().photoId}`),
      session
    )
    suppressionPhoto.assertStatus(204)

    const commentaire = await Commentaire.find(ajout.body().id)
    assert.isNotNull(commentaire)
    assert.isNull(commentaire!.photoId)
    assert.equal(commentaire!.texte, 'à refaire')
  })

  /** Supprimer un Bien emporte ses Commentaires, comme ses photos (#9). */
  test('supprimer le Bien emporte ses Commentaires', async ({ client, assert }) => {
    const bien = await unBien()

    await avecSession(
      client.post(`/biens/${bien.id}/commentaires`).field('texte', 'à refaire'),
      session
    )

    const suppression = await avecSession(client.delete(`/biens/${bien.id}`), session)
    suppression.assertStatus(204)

    assert.lengthOf(await Commentaire.duBien(bien.id), 0)
  })

  test('un Bien qui n’existe pas n’a pas de Commentaires', async ({ client }) => {
    const reponse = await avecSession(client.get('/biens/999999/commentaires'), session)

    reponse.assertStatus(404)
  })

  test('les Commentaires exigent la session, comme le reste du carnet', async ({ client }) => {
    const bien = await unBien()

    const reponse = await client.get(`/biens/${bien.id}/commentaires`)

    reponse.assertStatus(401)
  })
})
