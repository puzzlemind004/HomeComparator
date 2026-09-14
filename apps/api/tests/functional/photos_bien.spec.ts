import { test } from '@japa/runner'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import db from '@adonisjs/lucid/services/db'
import Bien from '#models/bien'
import Photo from '#models/photo'
import { avecSession, ouvrirSession, type Session } from '#tests/session'
import { PROPRIETAIRE_UNIQUE } from '#services/proprietaire'
import { STATUT_INITIAL } from '#services/statut'
import { TAILLE_MAX_MO, cheminPhoto, racineStockage } from '#services/stockage_photos'
import { PREFIXE_TEMPORAIRE_ENVOI } from '#config/bodyparser'

/**
 * Les photos d'un Bien (#13).
 *
 * C'est la fonctionnalité qui répond le plus directement au problème
 * d'origine : sans image, « le T3 rue Victor Hugo » n'évoquera plus rien
 * dans un mois. Ces tests décrivent l'ajout — depuis un téléphone, en
 * série —, l'affichage, et la suppression qui **efface le fichier** et pas
 * seulement la ligne.
 *
 * Le stockage est un dossier à part (`STOCKAGE_PHOTOS` dans `.env.test`),
 * vidé entre les tests : ils ne touchent jamais le volume réel.
 */
test.group('Photos d’un Bien', (group) => {
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

  async function unBien() {
    return Bien.create({
      libelle: 'le T3 avec la terrasse',
      urlAnnonce: null,
      proprietaireId: PROPRIETAIRE_UNIQUE,
      statut: STATUT_INITIAL,
    })
  }

  /**
   * Une vraie image, et non quelques octets déguisés : `sharp` la relit pour
   * la redimensionner, et un fichier qui n'en est pas une échouerait pour
   * une raison qui n'a rien à voir avec ce qu'on teste.
   */
  async function uneImage(largeur = 2400, hauteur = 1800) {
    return sharp({
      create: {
        width: largeur,
        height: hauteur,
        channels: 3,
        background: { r: 120, g: 140, b: 160 },
      },
    })
      .jpeg()
      .toBuffer()
  }

  /**
   * Les fichiers du dossier temporaire du système **issus des envois**, et
   * eux seuls : on compare un avant et un après, et ni les dossiers voisins
   * ni les fichiers des autres processus n'ont à entrer dans la comparaison.
   *
   * Le dossier temporaire est partagé, et rien ne s'y tient tranquille le
   * temps d'un test : sur l'exécuteur GitHub, `runc` y crée et y supprime
   * ses propres fichiers en parallèle (#99). Les nôtres se reconnaissent au
   * préfixe que `config/bodyparser.ts` leur donne sous `NODE_ENV=test`.
   */
  async function temporaires(): Promise<string[]> {
    const entrees = await readdir(tmpdir(), { withFileTypes: true })

    return entrees
      .filter((entree) => entree.isFile() && entree.name.startsWith(PREFIXE_TEMPORAIRE_ENVOI))
      .map(({ name }) => name)
      .sort()
  }

  /** Les fichiers présents sur le volume, quels qu'ils soient. */
  async function fichiersStockes(): Promise<string[]> {
    if (!existsSync(racineStockage())) {
      return []
    }

    return readdir(racineStockage())
  }

  test('ajoute une photo à un Bien', async ({ client, assert }) => {
    const bien = await unBien()

    const response = await avecSession(
      client.post(`/biens/${bien.id}/photos`).file('photos', await uneImage(), {
        filename: 'salon.jpg',
      }),
      session
    )

    response.assertStatus(201)
    assert.lengthOf(response.body(), 1)

    const photos = await Photo.query().where('bien_id', bien.id)
    assert.lengthOf(photos, 1)

    // La ligne ne vaut que si le fichier est là : c'est lui que la galerie
    // affiche, et la base n'en porte que le nom.
    assert.isTrue(existsSync(cheminPhoto(photos[0].fichier)))
    assert.isTrue(existsSync(cheminPhoto(photos[0].fichierVignette)))
  })

  test('ajoute plusieurs photos en un seul envoi', async ({ client, assert }) => {
    // Pendant une visite on prend une série, et la boîte de sélection d'un
    // téléphone permet d'en cocher plusieurs : exiger un appel par photo
    // ferait répéter le geste autant de fois qu'il y a de pièces.
    const bien = await unBien()

    const response = await avecSession(
      client
        .post(`/biens/${bien.id}/photos`)
        .file('photos', await uneImage(), { filename: 'salon.jpg' })
        .file('photos', await uneImage(), { filename: 'cuisine.jpg' })
        .file('photos', await uneImage(), { filename: 'balcon.jpg' }),
      session
    )

    response.assertStatus(201)
    assert.lengthOf(response.body(), 3)
    assert.lengthOf(await Photo.query().where('bien_id', bien.id), 3)
  })

  test('ajoute des photos en plusieurs fois, à la suite des précédentes', async ({
    client,
    assert,
  }) => {
    // Un second envoi se range derrière le premier plutôt que de s'y mêler :
    // on revient photographier après coup, et l'ordre de la galerie ne doit
    // pas s'en trouver rebattu.
    const bien = await unBien()

    await avecSession(
      client
        .post(`/biens/${bien.id}/photos`)
        .file('photos', await uneImage(), { filename: 'salon.jpg' }),
      session
    )

    await avecSession(
      client
        .post(`/biens/${bien.id}/photos`)
        .file('photos', await uneImage(), { filename: 'cuisine.jpg' }),
      session
    )

    const photos = await Photo.query().where('bien_id', bien.id).orderBy('rang', 'asc')

    assert.lengthOf(photos, 2)
    assert.deepEqual(
      photos.map(({ rang }) => rang),
      [0, 1]
    )
  })

  test('redimensionne les photos pour qu’elles restent consultables', async ({
    client,
    assert,
  }) => {
    /**
     * Le critère porte sur ce qui est **stocké**, pas sur ce qu'un écran
     * veut bien envoyer : une photo de 2400px de large arrive redimensionnée
     * quel que soit le chemin qu'elle a pris.
     */
    const bien = await unBien()

    await avecSession(
      client
        .post(`/biens/${bien.id}/photos`)
        .file('photos', await uneImage(2400, 1800), { filename: 'salon.jpg' }),
      session
    )

    const photo = await Photo.query().where('bien_id', bien.id).firstOrFail()

    const consultable = await sharp(cheminPhoto(photo.fichier)).metadata()
    const vignette = await sharp(cheminPhoto(photo.fichierVignette)).metadata()

    assert.isAtMost(consultable.width!, 1600)
    // La vignette est nettement plus petite : c'est elle que portent la
    // liste et les cartes, où la photo fait quelques centimètres.
    assert.isAtMost(vignette.width!, 400)

    // Le poids sur le disque, et non celui que `sharp` déduit de ses
    // métadonnées : c'est le nombre d'octets qui traversera la connexion
    // mobile qui fait l'intérêt de la vignette.
    const poidsConsultable = await stat(cheminPhoto(photo.fichier))
    const poidsVignette = await stat(cheminPhoto(photo.fichierVignette))

    assert.isBelow(poidsVignette.size, poidsConsultable.size)
  })

  test('rend les photos d’un Bien en galerie', async ({ client, assert }) => {
    const bien = await unBien()

    await avecSession(
      client
        .post(`/biens/${bien.id}/photos`)
        .file('photos', await uneImage(), { filename: 'salon.jpg' })
        .file('photos', await uneImage(), { filename: 'cuisine.jpg' }),
      session
    )

    const galerie = await avecSession(client.get(`/biens/${bien.id}/photos`), session)

    galerie.assertStatus(200)
    assert.lengthOf(galerie.body(), 2)
    // La représentative est la première : « représentative » ne se choisit
    // pas, c'est la première prise.
    assert.deepEqual(
      galerie.body().map(({ rang }: { rang: number }) => rang),
      [0, 1]
    )
  })

  test('rend la photo représentative avec la liste des Biens', async ({ client, assert }) => {
    /**
     * La liste et les cartes ont besoin d'une photo pour reconnaître un Bien
     * d'un coup d'œil, et d'une seule : rapatrier vingt photos de chaque
     * Bien pour n'en montrer qu'une ferait voyager vingt fois trop, la
     * raison même pour laquelle les Notes sont absentes de la liste (#8).
     */
    const bien = await unBien()

    await avecSession(
      client
        .post(`/biens/${bien.id}/photos`)
        .file('photos', await uneImage(), { filename: 'salon.jpg' })
        .file('photos', await uneImage(), { filename: 'cuisine.jpg' }),
      session
    )

    const liste = await avecSession(client.get('/biens'), session)

    liste.assertStatus(200)

    const [rendu] = liste.body()

    // Une seule, et c'est la première : « représentative » ne se choisit pas.
    assert.lengthOf(rendu.photos, 1)
    assert.equal(rendu.photos[0].rang, 0)
  })

  test('rend un tableau vide pour un Bien sans photo', async ({ client, assert }) => {
    // Un tableau vide et non une clé absente : c'est ce que le front lit
    // comme « pas de photo », là où `undefined` le prendrait au dépourvu.
    await unBien()

    const liste = await avecSession(client.get('/biens'), session)

    assert.deepEqual(liste.body()[0].photos, [])
  })

  test('sert le fichier d’une photo, et sa vignette', async ({ client, assert }) => {
    const bien = await unBien()

    const ajout = await avecSession(
      client
        .post(`/biens/${bien.id}/photos`)
        .file('photos', await uneImage(), { filename: 'salon.jpg' }),
      session
    )

    const { id } = ajout.body()[0]

    const consultable = await avecSession(client.get(`/biens/${bien.id}/photos/${id}`), session)
    consultable.assertStatus(200)

    const vignette = await avecSession(
      client.get(`/biens/${bien.id}/photos/${id}`).qs({ taille: 'vignette' }),
      session
    )
    vignette.assertStatus(200)

    // Les deux tailles ne servent pas le même fichier, sans quoi la vignette
    // ne ferait rien gagner sur une connexion mobile.
    assert.isBelow(vignette.response.body.length, consultable.response.body.length)
  })

  test('refuse une image illisible sans rendre une erreur nue', async ({ client, assert }) => {
    /**
     * Des octets aléatoires sous un nom de photo : la validation de l'envoi
     * les laisse passer — l'extension est bonne — mais `sharp` ne sait pas
     * les décoder. Sans garde, l'acheteur recevrait un 500 nu là où il
     * attend qu'on lui dise laquelle de ses photos n'est pas passée.
     */
    const bien = await unBien()

    const illisible = Buffer.alloc(2048)
    for (let octet = 0; octet < illisible.length; octet += 1) {
      illisible[octet] = (octet * 37) % 256
    }

    const response = await avecSession(
      client.post(`/biens/${bien.id}/photos`).file('photos', illisible, {
        filename: 'corrompue.jpg',
      }),
      session
    )

    response.assertStatus(422)
    assert.include(JSON.stringify(response.body()), 'corrompue.jpg')
    assert.isEmpty(await Photo.query().where('bien_id', bien.id))
    assert.isEmpty(await fichiersStockes())
  })

  test('ne garde rien du lot quand une photo se révèle illisible', async ({ client, assert }) => {
    // « Tout ou rien » vaut aussi ici : s'en tenir à la moitié laisserait
    // l'acheteur sans moyen de savoir ce qui est passé.
    const bien = await unBien()
    const avant = await temporaires()

    const illisible = Buffer.alloc(2048, 0x5a)

    const response = await avecSession(
      client
        .post(`/biens/${bien.id}/photos`)
        .file('photos', await uneImage(), { filename: 'salon.jpg' })
        .file('photos', illisible, { filename: 'corrompue.jpg' }),
      session
    )

    response.assertStatus(422)
    assert.isEmpty(await Photo.query().where('bien_id', bien.id))
    assert.isEmpty(await fichiersStockes())
    // Y compris le temporaire de la photo valide du lot.
    assert.deepEqual(await temporaires(), avant)
  })

  test('ne laisse aucun fichier temporaire après un envoi', async ({ client, assert }) => {
    /**
     * L'original ne se garde nulle part, temporaire compris (ADR-0014). Le
     * bodyparser écrit chaque envoi dans le dossier temporaire du système
     * et ne l'efface pas de lui-même : sans nettoyage, l'original
     * survivrait hors du volume — donc hors sauvegarde et hors écran, soit
     * l'orphelin que l'ordre de suppression s'emploie à éviter, déplacé sur
     * un autre système de fichiers.
     */
    const bien = await unBien()

    const avant = await temporaires()

    await avecSession(
      client
        .post(`/biens/${bien.id}/photos`)
        .file('photos', await uneImage(), { filename: 'salon.jpg' })
        .file('photos', await uneImage(), { filename: 'cuisine.jpg' }),
      session
    )

    assert.deepEqual(await temporaires(), avant)
  })

  test('ignore les fichiers temporaires des autres processus', async ({ client, assert }) => {
    /**
     * Le dossier temporaire du système est partagé. Sur l'exécuteur GitHub,
     * `runc` — le moteur de conteneurs — y crée et y supprime ses propres
     * fichiers pendant que les tests tournent (#99). Un relevé qui les
     * compte fait échouer la comparaison avant/après au hasard de leur
     * apparition, et comme ces tests sont sur le chemin du déploiement,
     * chaque échec coûte un numéro de version.
     *
     * Les deux sens sont reproduits ici, tels qu'ils sont tombés sur le
     * runner : un fichier tiers qui apparaît pendant la fenêtre
     * d'observation, et un autre qui en disparaît.
     */
    const bien = await unBien()

    const disparait = join(tmpdir(), `runc-process${Date.now()}`)
    await writeFile(disparait, 'un fichier tiers déjà là')

    const avant = await temporaires()

    const apparait = join(tmpdir(), `runc-process${Date.now() + 1}`)
    await writeFile(apparait, 'un fichier tiers surgi entre les deux relevés')
    await rm(disparait, { force: true })

    await avecSession(
      client
        .post(`/biens/${bien.id}/photos`)
        .file('photos', await uneImage(), { filename: 'salon.jpg' }),
      session
    )

    try {
      assert.deepEqual(await temporaires(), avant)
    } finally {
      await rm(apparait, { force: true })
    }
  })

  test('ne laisse aucun temporaire quand le lot est refusé', async ({ client, assert }) => {
    // Le bodyparser a écrit tous les fichiers avant que le contrôleur ne
    // décide de les refuser : un refus ne doit pas coûter plus cher au
    // stockage qu'une acceptation.
    const bien = await unBien()

    const avant = await temporaires()

    await avecSession(
      client
        .post(`/biens/${bien.id}/photos`)
        .file('photos', await uneImage(), { filename: 'salon.jpg' })
        .file('photos', Buffer.from('pas une image'), { filename: 'compromis.pdf' }),
      session
    )

    assert.deepEqual(await temporaires(), avant)
  })

  test('ne met pas en cache l’absence d’un fichier', async ({ client, assert }) => {
    /**
     * Ligne présente, fichier disparu : l'état qu'ADR-0014 déclare réparable
     * par nouvelle tentative. Le mettre en cache un an le rendrait
     * irréparable côté écran — le navigateur mémoriserait le trou sans
     * jamais revalider.
     */
    const bien = await unBien()

    const ajout = await avecSession(
      client
        .post(`/biens/${bien.id}/photos`)
        .file('photos', await uneImage(), { filename: 'salon.jpg' }),
      session
    )

    const { id } = ajout.body()[0]
    const photo = await Photo.findOrFail(id)

    await rm(cheminPhoto(photo.fichier), { force: true })

    const response = await avecSession(client.get(`/biens/${bien.id}/photos/${id}`), session)

    response.assertStatus(404)
    assert.notInclude(response.headers()['cache-control'] ?? '', 'max-age=31536000')
    // Le carnet rend du JSON, jamais le texte brut anglais de `download`.
    assert.property(response.body(), 'message')
  })

  test('supprime une photo, et son fichier disparaît du stockage', async ({ client, assert }) => {
    /**
     * Le cœur du critère : la ligne **et** le fichier. Une suppression qui
     * ne retirerait que la ligne laisserait le volume grossir sans qu'aucun
     * écran ne montre ce qui l'occupe.
     */
    const bien = await unBien()

    const ajout = await avecSession(
      client
        .post(`/biens/${bien.id}/photos`)
        .file('photos', await uneImage(), { filename: 'salon.jpg' }),
      session
    )

    const { id } = ajout.body()[0]
    const photo = await Photo.findOrFail(id)

    const response = await avecSession(client.delete(`/biens/${bien.id}/photos/${id}`), session)

    response.assertStatus(204)
    assert.isNull(await Photo.find(id))
    assert.isFalse(existsSync(cheminPhoto(photo.fichier)))
    assert.isFalse(existsSync(cheminPhoto(photo.fichierVignette)))
  })

  test('refuse un fichier maquillé en image', async ({ client, assert }) => {
    /**
     * L'extension ne fait pas l'image : un texte renommé `.jpg` doit être
     * refusé comme le reste, et avec le même message clair — pas par une
     * erreur 500 venue du redimensionnement.
     */
    const bien = await unBien()

    const response = await avecSession(
      client
        .post(`/biens/${bien.id}/photos`)
        .file('photos', Buffer.from('du texte, pas une image'), {
          filename: 'maquille.jpg',
        }),
      session
    )

    response.assertStatus(422)
    assert.include(JSON.stringify(response.body()), 'maquille.jpg')
    assert.isEmpty(await fichiersStockes())
  })

  test('garde la photo quand ses fichiers n’ont pas pu être effacés', async ({
    client,
    assert,
  }) => {
    /**
     * Le chemin d'échec de l'ordre choisi (ADR-0014). Supprimer la ligne
     * malgré un effacement manqué produirait très exactement l'orphelin que
     * cet ordre existe pour éviter, et retirerait la seule trace qui permet
     * de réessayer.
     *
     * L'échec est provoqué en remplaçant le fichier par un dossier : `unlink`
     * y répond `EPERM`/`EISDIR`, jamais `ENOENT` — ce n'est donc pas le cas
     * « déjà absent », qui lui est un succès.
     */
    const bien = await unBien()

    const ajout = await avecSession(
      client
        .post(`/biens/${bien.id}/photos`)
        .file('photos', await uneImage(), { filename: 'salon.jpg' }),
      session
    )

    const { id } = ajout.body()[0]
    const photo = await Photo.findOrFail(id)

    await rm(cheminPhoto(photo.fichier), { force: true })
    await mkdir(cheminPhoto(photo.fichier), { recursive: true })

    const response = await avecSession(client.delete(`/biens/${bien.id}/photos/${id}`), session)

    response.assertStatus(503)
    // La ligne est toujours là : c'est elle qui permet de réessayer.
    assert.isNotNull(await Photo.find(id))
  })

  test('refuse un fichier qui n’est pas une image', async ({ client, assert }) => {
    const bien = await unBien()

    const response = await avecSession(
      client.post(`/biens/${bien.id}/photos`).file('photos', Buffer.from('pas une image'), {
        filename: 'compromis.pdf',
      }),
      session
    )

    response.assertStatus(422)
    // Le message nomme le fichier : sans cela, l'acheteur ne saurait pas
    // lequel de ses huit clichés est en cause.
    assert.include(JSON.stringify(response.body()), 'compromis.pdf')
    assert.isEmpty(await fichiersStockes())
  })

  test('refuse un fichier trop volumineux', async ({ client, assert }) => {
    const bien = await unBien()

    // Au-delà de la limite, et par une marge qui ne dépend pas de la
    // compression : un buffer incompressible plutôt qu'une image.
    const trop = Buffer.alloc((TAILLE_MAX_MO + 1) * 1024 * 1024, 7)

    const response = await avecSession(
      client.post(`/biens/${bien.id}/photos`).file('photos', trop, { filename: 'enorme.jpg' }),
      session
    )

    response.assertStatus(422)
    assert.isEmpty(await fichiersStockes())
  })

  test('n’écrit aucune photo quand une seule du lot est refusée', async ({ client, assert }) => {
    /**
     * Tout ou rien. Accepter les valides et taire les autres laisserait
     * l'acheteur croire que ses photos sont passées alors qu'il en manque,
     * sans moyen de savoir lesquelles — ce qu'on ne peut pas se permettre
     * sur des clichés de visite qu'on ne repassera pas prendre.
     */
    const bien = await unBien()

    const response = await avecSession(
      client
        .post(`/biens/${bien.id}/photos`)
        .file('photos', await uneImage(), { filename: 'salon.jpg' })
        .file('photos', Buffer.from('pas une image'), { filename: 'compromis.pdf' }),
      session
    )

    response.assertStatus(422)
    assert.isEmpty(await Photo.query().where('bien_id', bien.id))
    assert.isEmpty(await fichiersStockes())
  })

  test('refuse un envoi sans photo', async ({ client }) => {
    const bien = await unBien()

    const response = await avecSession(client.post(`/biens/${bien.id}/photos`), session)

    response.assertStatus(422)
  })

  test('répond 404 pour les photos d’un Bien qui n’existe pas', async ({ client }) => {
    const response = await avecSession(client.get('/biens/404/photos'), session)

    response.assertStatus(404)
  })

  test('ne rend pas la photo d’un autre Bien', async ({ client }) => {
    // L'adresse porte les deux identifiants, et les deux sont vérifiés :
    // sans cela, connaître l'identifiant d'une photo suffirait à la lire
    // sous n'importe quel Bien.
    const bien = await unBien()
    const autre = await unBien()

    const ajout = await avecSession(
      client
        .post(`/biens/${bien.id}/photos`)
        .file('photos', await uneImage(), { filename: 'salon.jpg' }),
      session
    )

    const { id } = ajout.body()[0]

    const response = await avecSession(client.get(`/biens/${autre.id}/photos/${id}`), session)

    response.assertStatus(404)
  })

  test('exige la session pour tout ce qui touche aux photos', async ({ client, assert }) => {
    /**
     * Les photos d'un intérieur sont au moins aussi sensibles que le reste
     * du carnet : elles sont derrière la session comme lui (ADR-0011). Les
     * fichiers sont servis par l'API et non par nginx en statique
     * précisément pour cela — un dossier exposé le serait pour qui en devine
     * le nom.
     */
    const bien = await unBien()

    const ajout = await avecSession(
      client
        .post(`/biens/${bien.id}/photos`)
        .file('photos', await uneImage(), { filename: 'salon.jpg' }),
      session
    )

    const { id } = ajout.body()[0]

    for (const requete of [
      client.get(`/biens/${bien.id}/photos`),
      client.get(`/biens/${bien.id}/photos/${id}`),
      client.post(`/biens/${bien.id}/photos`),
      client.delete(`/biens/${bien.id}/photos/${id}`),
    ]) {
      const response = await requete
      response.assertStatus(401)
    }

    // Un refus qui aurait tout de même supprimé serait le pire des deux.
    assert.isNotNull(await Photo.find(id))
  })
})
