import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Bien from '#models/bien'
import Photo from '#models/photo'
import { avecSession, ouvrirSession, type Session } from '#tests/session'
import { PROPRIETAIRE_UNIQUE } from '#services/proprietaire'
import { STATUT_INITIAL } from '#services/statut'

/**
 * L'export des données du carnet (#14).
 *
 * Tout est saisi à la main (ADR-0001) : trois mois de recherche ne se
 * retrouvent pas. L'export sert deux choses à la fois — manipuler ses Biens
 * dans un tableur, et ne pas se sentir prisonnier de l'outil (ADR-0007).
 *
 * Ces tests décrivent ce que l'export **porte** et ce qu'il **vaut une fois
 * ouvert** : un JSON qui rend tout le carnet, et un CSV qu'un tableur lit
 * sans réglage, accents compris. Le reste — le nom du fichier, le
 * téléchargement — est affaire d'écran, et ses propres tests le tiennent.
 */
test.group('Export des données', (group) => {
  let session: Session

  group.each.setup(async ({ context }) => {
    await db.from('photos').delete()
    await db.from('biens').delete()
    session = await ouvrirSession(context.client)
  })

  /** Un Bien en base, « À contacter » sauf indication contraire. */
  async function unBien(champs: Partial<Bien> = {}) {
    return Bien.create({
      libelle: 'le T3 avec la terrasse',
      urlAnnonce: null,
      proprietaireId: PROPRIETAIRE_UNIQUE,
      statut: STATUT_INITIAL,
      ...champs,
    })
  }

  /**
   * Un Bien dont **tout** est renseigné : les quatorze Critères, les Notes,
   * le Statut et les deux champs qui en dépendent.
   *
   * C'est le Bien que plusieurs tests exigent, parce que ce qui doit être
   * vérifié est qu'aucune donnée ne manque à l'appel — un export qui perd
   * une colonne en silence est très exactement ce contre quoi il existe.
   */
  async function unBienComplet() {
    return unBien({
      libelle: 'le T3 avec la terrasse',
      urlAnnonce: 'https://portail.test/annonce/1',
      notes: 'Cuisine refaite.\nVoisinage calme.',
      statut: 'offreFaite',
      dateVisite: DateTime.fromISO('2026-03-14'),
      montantDerniereOffre: 245000,
      prixDemande: 250000,
      surfaceHabitable: 72.5,
      nombrePieces: 3,
      adresse: '12 rue Victor Hugo',
      villeQuartier: 'Lyon 7e',
      taxeFonciere: 1200,
      chargesCopropriete: 150,
      capaciteStationnement: 1,
      tempsTrajetTravail: 25,
      dpe: 'C',
      typeChauffage: 'gaz',
      anneeConstruction: 1994,
      typeBien: 'appartement',
      exterieur: 'balcon',
      travauxAPrevoir: 'rafraichissement',
    })
  }

  /**
   * L'export n'est pas public (#14).
   *
   * C'est la première chose à tenir : une adresse qui rend le carnet entier
   * en un appel est ce qu'il y a de plus sensible dans l'API, et elle est
   * dans le groupe authentifié comme le reste (ADR-0011).
   */
  test('l’export exige une session', async ({ client }) => {
    const response = await client.get('/export')

    response.assertStatus(401)
  })

  test('l’export en CSV exige une session', async ({ client }) => {
    const response = await client.get('/export?format=csv')

    response.assertStatus(401)
  })

  test('l’export rend du JSON par défaut', async ({ client, assert }) => {
    await unBienComplet()

    const response = await avecSession(client.get('/export'), session)

    response.assertStatus(200)
    assert.include(response.header('content-type') ?? '', 'application/json')
  })

  /**
   * Le JSON porte tout ce qui a été saisi : les Critères, les Notes, le
   * Statut et les champs qui en dépendent.
   *
   * L'énumération est écrite à la main plutôt que dérivée du modèle, et
   * c'est délibéré : dérivée, elle vérifierait que l'export est d'accord
   * avec lui-même. Ici elle dit ce que l'acheteur doit retrouver, et un
   * Critère ajouté sans être exporté fait échouer ce test.
   */
  test('le JSON porte les Critères, les Notes et les champs liés au Statut', async ({
    client,
    assert,
  }) => {
    await unBienComplet()

    const response = await avecSession(client.get('/export'), session)

    response.assertStatus(200)

    const { biens } = response.body()
    assert.lengthOf(biens, 1)

    const [bien] = biens

    assert.equal(bien.libelle, 'le T3 avec la terrasse')
    assert.equal(bien.urlAnnonce, 'https://portail.test/annonce/1')
    assert.equal(bien.notes, 'Cuisine refaite.\nVoisinage calme.')
    assert.equal(bien.statut, 'offreFaite')
    assert.equal(bien.dateVisite, '2026-03-14')
    assert.equal(bien.montantDerniereOffre, 245000)
    assert.equal(bien.prixDemande, 250000)
    assert.equal(bien.surfaceHabitable, 72.5)
    assert.equal(bien.nombrePieces, 3)
    assert.equal(bien.adresse, '12 rue Victor Hugo')
    assert.equal(bien.villeQuartier, 'Lyon 7e')
    assert.equal(bien.taxeFonciere, 1200)
    assert.equal(bien.chargesCopropriete, 150)
    assert.equal(bien.capaciteStationnement, 1)
    assert.equal(bien.tempsTrajetTravail, 25)
    assert.equal(bien.dpe, 'C')
    assert.equal(bien.typeChauffage, 'gaz')
    assert.equal(bien.anneeConstruction, 1994)
    assert.equal(bien.typeBien, 'appartement')
    assert.equal(bien.exterieur, 'balcon')
    assert.equal(bien.travauxAPrevoir, 'rafraichissement')
  })

  /**
   * Un Critère non renseigné sort à `null`, et jamais à zéro ni à la chaîne
   * vide : c'est la distinction sur laquelle tout le carnet repose (#6), et
   * un export qui la perdrait rendrait un Bien sans prix indiscernable d'un
   * Bien à zéro euro une fois relu.
   */
  test('un Critère non renseigné sort à null', async ({ client, assert }) => {
    await unBien()

    const response = await avecSession(client.get('/export'), session)

    response.assertStatus(200)

    const [bien] = response.body().biens

    assert.isNull(bien.prixDemande)
    assert.isNull(bien.surfaceHabitable)
    assert.isNull(bien.notes)
    assert.isNull(bien.dateVisite)
    assert.isNull(bien.montantDerniereOffre)
  })

  /**
   * Les Photos sortent par leurs noms de fichiers, et non par leurs octets
   * (ADR-0014).
   *
   * Ce que l'export dit d'elles, c'est qu'elles existent et sous quel nom :
   * les fichiers eux-mêmes vivent sur le volume, qui entre dans le
   * périmètre de la sauvegarde (ADR-0007). Un export qui les embarquerait
   * cesserait d'être le fichier léger qu'on ouvre dans un tableur.
   */
  test('les Photos sortent par leurs noms de fichiers', async ({ client, assert }) => {
    const bien = await unBienComplet()

    await Photo.create({
      bienId: bien.id,
      fichier: 'abcdef.jpg',
      fichierVignette: 'abcdef-vignette.jpg',
      rang: 1,
    })

    const response = await avecSession(client.get('/export'), session)

    response.assertStatus(200)

    const [exporte] = response.body().biens

    assert.deepEqual(exporte.photos, [
      { fichier: 'abcdef.jpg', fichierVignette: 'abcdef-vignette.jpg', rang: 1 },
    ])
  })

  test('un Bien sans Photo porte un tableau vide', async ({ client, assert }) => {
    await unBien()

    const response = await avecSession(client.get('/export'), session)

    response.assertStatus(200)
    assert.deepEqual(response.body().biens[0].photos, [])
  })

  /**
   * L'export se date lui-même. Un fichier retrouvé six mois plus tard dans
   * un dossier de téléchargements ne dit rien de ce qu'il contient : la
   * date est ce qui permet de savoir si on tient la dernière version de son
   * carnet ou une copie d'avant la dernière visite.
   */
  test('l’export porte sa propre date', async ({ client, assert }) => {
    await unBien()

    const response = await avecSession(client.get('/export'), session)

    response.assertStatus(200)
    assert.isTrue(DateTime.fromISO(response.body().exporteLe).isValid)
  })

  test('un carnet vide s’exporte quand même', async ({ client, assert }) => {
    const response = await avecSession(client.get('/export'), session)

    response.assertStatus(200)
    assert.deepEqual(response.body().biens, [])
  })

  /**
   * Le CSV, l'autre moitié : c'est celui qu'on ouvre dans un tableur.
   */
  test('le CSV s’annonce comme du CSV', async ({ client, assert }) => {
    await unBienComplet()

    const response = await avecSession(client.get('/export?format=csv'), session)

    response.assertStatus(200)
    assert.include(response.header('content-type') ?? '', 'text/csv')
  })

  /**
   * Une ligne d'en-têtes, puis une ligne par Bien.
   *
   * Les en-têtes sont les identifiants des colonnes tels que l'API les
   * échange — `prixDemande` et non « Prix demandé ». Les libellés vivent
   * dans la définition centralisée, côté front (ADR-0004), et les recopier
   * ici en ferait une seconde source à tenir d'accord.
   */
  test('le CSV porte une ligne d’en-têtes puis une ligne par Bien', async ({ client, assert }) => {
    await unBienComplet()
    await unBien({ libelle: 'le studio sous les toits' })

    const response = await avecSession(client.get('/export?format=csv'), session)

    response.assertStatus(200)

    const lignes = lignesCsv(response.text())

    assert.lengthOf(lignes, 3)
    assert.include(lignes[0], 'libelle')
    assert.include(lignes[0], 'prixDemande')
    assert.include(lignes[0], 'statut')
    assert.include(lignes[0], 'notes')
  })

  /**
   * Le point-virgule, et non la virgule.
   *
   * C'est ce qu'attend un tableur configuré en français — Excel lit le
   * séparateur de listes de la locale — et le carnet est tenu en français,
   * décimales à la virgule comprises. Un CSV à la virgule y arriverait sur
   * une seule colonne, ce que l'acheteur lirait comme un export cassé.
   */
  test('le CSV sépare ses colonnes par des points-virgules', async ({ client, assert }) => {
    await unBienComplet()

    const response = await avecSession(client.get('/export?format=csv'), session)

    response.assertStatus(200)

    const [entetes] = lignesCsv(response.text())

    assert.include(entetes, ';')
    assert.isAbove(entetes.split(';').length, 20)
  })

  /**
   * Le BOM UTF-8, sans lequel Excel lit le fichier dans sa page de codes
   * locale : « Libellé » y devient « LibellÃ© », et « 7e » un caractère de
   * remplacement. C'est le défaut le plus visible d'un export ouvert par
   * quelqu'un qui n'a rien à régler, et l'AC le nomme explicitement (#14).
   */
  test('le CSV commence par un BOM UTF-8', async ({ client, assert }) => {
    await unBienComplet()

    const response = await avecSession(client.get('/export?format=csv'), session)

    response.assertStatus(200)
    assert.isTrue(response.text().startsWith('﻿'))
  })

  /**
   * Les accents survivent au passage. Le test ne se contente pas du BOM :
   * il relit une valeur accentuée, qui est ce que l'acheteur verra.
   */
  test('les accents survivent au CSV', async ({ client, assert }) => {
    await unBien({ libelle: 'le duplex très éclairé à Châteauroux' })

    const response = await avecSession(client.get('/export?format=csv'), session)

    response.assertStatus(200)
    assert.include(response.text(), 'le duplex très éclairé à Châteauroux')
  })

  /**
   * Un point-virgule dans les Notes ne doit pas fabriquer une colonne, et
   * c'est très exactement ce qui arrive à un CSV qui n'échappe pas ses
   * valeurs : les Notes sont du texte libre, et la ponctuation y est
   * ordinaire.
   */
  test('une valeur qui porte le séparateur est encadrée de guillemets', async ({
    client,
    assert,
  }) => {
    await unBien({ notes: 'À voir ; puis à revoir' })

    const response = await avecSession(client.get('/export?format=csv'), session)

    response.assertStatus(200)
    assert.include(response.text(), '"À voir ; puis à revoir"')
  })

  /**
   * Un guillemet dans une valeur se double, comme le veut le format : sans
   * cela, il refermerait le champ et décalerait tout le reste de la ligne.
   */
  test('un guillemet dans une valeur est doublé', async ({ client, assert }) => {
    await unBien({ libelle: 'le T3 dit « la """bonne""" affaire »' })

    const response = await avecSession(client.get('/export?format=csv'), session)

    response.assertStatus(200)
    assert.include(response.text(), '""""""bonne""""""')
  })

  /**
   * Les sauts de ligne des Notes sont conservés **dans** la cellule : une
   * liste de travaux se lit en lignes (ADR-0012), et un export qui les
   * aplatirait perdrait ce que l'acheteur a écrit. Le champ est encadré,
   * ce qui est la façon dont le format porte un saut de ligne.
   */
  test('un saut de ligne dans les Notes reste dans la cellule', async ({ client, assert }) => {
    await unBien({ notes: 'Cuisine refaite.\nVoisinage calme.' })

    const response = await avecSession(client.get('/export?format=csv'), session)

    response.assertStatus(200)
    assert.include(response.text(), '"Cuisine refaite.\nVoisinage calme."')

    // Et la ligne du Bien n'a pas été coupée en deux pour autant.
    assert.lengthOf(lignesCsv(response.text()), 2)
  })

  /**
   * Un Critère non renseigné sort **vide**, et non « null ».
   *
   * C'est la même distinction que côté JSON, vue par le tableur : une
   * cellule vide s'y lit comme une donnée absente, là où le mot « null »
   * s'y lirait comme du texte saisi.
   */
  test('un Critère non renseigné sort en cellule vide', async ({ client, assert }) => {
    await unBien()

    const response = await avecSession(client.get('/export?format=csv'), session)

    response.assertStatus(200)

    const texte = response.text()

    assert.notInclude(texte, 'null')
    assert.notInclude(texte, 'undefined')
  })

  /**
   * Le CSV porte les Photos par leur nombre, et non par leurs noms : le
   * tableur sert à comparer des Biens, et une colonne de noms de fichiers
   * tirés au sort n'y compare rien. Les noms sont dans le JSON, qui est le
   * format complet.
   */
  test('le CSV porte le nombre de Photos', async ({ client, assert }) => {
    const bien = await unBienComplet()

    await Photo.create({
      bienId: bien.id,
      fichier: 'abcdef.jpg',
      fichierVignette: 'abcdef-vignette.jpg',
      rang: 1,
    })

    const response = await avecSession(client.get('/export?format=csv'), session)

    response.assertStatus(200)

    const lignes = lignesCsv(response.text())

    assert.include(lignes[0], 'nombrePhotos')
    assert.include(lignes[1].split(';'), '1')
  })

  /**
   * Un format inconnu rend le JSON plutôt qu'un refus. C'est un paramètre
   * d'affichage et non une saisie : le refuser laisserait l'acheteur sans
   * export pour une adresse mal recopiée, alors que rendre le format
   * complet est exactement ce que l'export fait sans paramètre. C'est le
   * même arbitrage que le filtre par Statut de la liste (#7).
   */
  test('un format inconnu rend le JSON', async ({ client, assert }) => {
    await unBien()

    const response = await avecSession(client.get('/export?format=xml'), session)

    response.assertStatus(200)
    assert.include(response.header('content-type') ?? '', 'application/json')
  })

  /**
   * Le fichier se télécharge plutôt que de s'afficher, et il porte un nom
   * qui se retrouve : un `export.csv` de plus dans un dossier de
   * téléchargements ne dit pas de quel jour il date.
   */
  test('l’export se télécharge sous un nom daté', async ({ client, assert }) => {
    await unBien()

    const json = await avecSession(client.get('/export'), session)
    const csv = await avecSession(client.get('/export?format=csv'), session)

    const dispositionJson = json.header('content-disposition') ?? ''
    const dispositionCsv = csv.header('content-disposition') ?? ''

    assert.include(dispositionJson, 'attachment')
    assert.match(dispositionJson, /homecomparator-\d{4}-\d{2}-\d{2}\.json/)
    assert.include(dispositionCsv, 'attachment')
    assert.match(dispositionCsv, /homecomparator-\d{4}-\d{2}-\d{2}\.csv/)
  })

  /**
   * L'ordre de l'export est celui de la liste : du plus récemment repéré au
   * plus ancien. Un export qui rendrait ses lignes dans l'ordre où
   * PostgreSQL les retrouve changerait d'un jour à l'autre, et deux exports
   * successifs ne se compareraient plus.
   */
  test('les Biens sortent du plus récent au plus ancien', async ({ client, assert }) => {
    await unBien({ libelle: 'le premier' })
    await unBien({ libelle: 'le second' })

    const response = await avecSession(client.get('/export'), session)

    response.assertStatus(200)

    const libelles = response.body().biens.map(({ libelle }: { libelle: string }) => libelle)

    assert.deepEqual(libelles, ['le second', 'le premier'])
  })
})

/**
 * Les lignes d'un CSV, sauts de ligne encadrés compris.
 *
 * Un `split('\n')` naïf couperait une cellule de Notes en deux et ferait
 * compter une ligne de trop — très exactement le défaut que l'un des tests
 * ci-dessus existe pour écarter. Il faut donc lire le texte en distinguant
 * ce qui est dans un champ encadré de ce qui ne l'est pas.
 */
function lignesCsv(texte: string): string[] {
  const sansBom = texte.startsWith('﻿') ? texte.slice(1) : texte
  const lignes: string[] = []

  let courante = ''
  let dansUnChamp = false

  for (const caractere of sansBom) {
    if (caractere === '"') {
      dansUnChamp = !dansUnChamp
      courante += caractere
      continue
    }

    if (caractere === '\n' && !dansUnChamp) {
      lignes.push(courante.replace(/\r$/, ''))
      courante = ''
      continue
    }

    courante += caractere
  }

  if (courante.trim() !== '') {
    lignes.push(courante)
  }

  return lignes
}
