import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Bien from '#models/bien'
import { avecSession, ouvrirSession, type Session } from '#tests/session'
import { PROPRIETAIRE_UNIQUE } from '#services/proprietaire'
import { STATUT_INITIAL } from '#services/statut'

/**
 * La fiche d'un Bien : la consulter, et modifier n'importe lequel de ses
 * Critères à tout moment (#6).
 *
 * Tout y est facultatif (ADR-0008) : ces tests décrivent surtout ce qui ne
 * doit *pas* arriver — qu'une mise à jour partielle efface les Critères
 * qu'elle ne transmet pas, ou qu'un Critère vidé se retrouve à zéro.
 */
test.group('Fiche d’un Bien', (group) => {
  let session: Session

  group.each.setup(async ({ context }) => {
    await db.from('biens').delete()
    session = await ouvrirSession(context.client)
  })

  /** Un Bien en base, créé directement : ces tests portent sur la suite. */
  async function unBien(criteres: Partial<Bien> = {}) {
    return Bien.create({
      libelle: 'le T3 avec la terrasse',
      urlAnnonce: null,
      proprietaireId: PROPRIETAIRE_UNIQUE,
      // Le Statut est obligatoire comme le Libellé (#7) : un Bien est
      // toujours quelque part dans la recherche, et c'est ici qu'un Bien
      // fraîchement créé se trouve.
      statut: STATUT_INITIAL,
      ...criteres,
    })
  }

  test('rend la fiche complète d’un Bien', async ({ client, assert }) => {
    const bien = await unBien({ prixDemande: 250_000, dpe: 'C' })

    const response = await avecSession(client.get(`/biens/${bien.id}`), session)

    response.assertStatus(200)
    assert.deepInclude(response.body(), {
      id: bien.id,
      libelle: 'le T3 avec la terrasse',
      prixDemande: 250_000,
      dpe: 'C',
    })
  })

  test('répond 404 pour un Bien qui n’existe pas', async ({ client }) => {
    const response = await avecSession(client.get('/biens/404'), session)

    response.assertStatus(404)
  })

  test('répond 404 sur un identifiant qui n’est pas un nombre', async ({ client, assert }) => {
    // Une adresse mal recopiée ne désigne aucun Bien : c'est un 404, comme
    // pour un Bien absent. Sans contrainte de route, l'identifiant atteint
    // la requête SQL, où PostgreSQL refuse la conversion — et la réponse 500
    // emporte alors le texte de la requête, ce qui en dit bien trop.
    const response = await avecSession(client.get('/biens/abc'), session)

    response.assertStatus(404)
    assert.notInclude(JSON.stringify(response.body()), 'select')
  })

  test('répond 404 en modifiant un identifiant qui n’est pas un nombre', async ({ client }) => {
    const response = await avecSession(client.patch('/biens/abc'), session).json({
      prixDemande: 1,
    })

    response.assertStatus(404)
  })

  test('modifie un seul Critère sans toucher aux autres', async ({ client, assert }) => {
    // C'est le geste de la fiche : corriger une valeur, et rien d'autre.
    const bien = await unBien({ prixDemande: 250_000, surfaceHabitable: 72.5, dpe: 'C' })

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      prixDemande: 245_000,
    })

    response.assertStatus(200)
    await bien.refresh()
    assert.equal(bien.prixDemande, 245_000)
    // Les Critères non transmis sont restés tels quels : une mise à jour
    // partielle n'est pas un remplacement.
    assert.equal(bien.surfaceHabitable, 72.5)
    assert.equal(bien.dpe, 'C')
  })

  test('modifie le Libellé et l’URL de l’Annonce comme n’importe quel Critère', async ({
    client,
    assert,
  }) => {
    const bien = await unBien()

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      libelle: 'celui avec la cuisine refaite',
      urlAnnonce: 'https://exemple.test/annonce/2',
    })

    response.assertStatus(200)
    await bien.refresh()
    assert.equal(bien.libelle, 'celui avec la cuisine refaite')
    assert.equal(bien.urlAnnonce, 'https://exemple.test/annonce/2')
  })

  test('vide un Critère déjà renseigné', async ({ client, assert }) => {
    // Se tromper de Bien en saisissant doit se rattraper : un Critère se
    // vide, et redevient « non renseigné » plutôt que zéro.
    const bien = await unBien({ prixDemande: 250_000 })

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      prixDemande: null,
    })

    response.assertStatus(200)
    await bien.refresh()
    assert.isNull(bien.prixDemande)
  })

  test('accepte une chaîne vide comme un Critère vidé', async ({ client, assert }) => {
    // C'est ce que le formulaire envoie d'un champ effacé : cela vaut « non
    // renseigné », et jamais zéro ni la chaîne vide en base.
    const bien = await unBien({ prixDemande: 250_000, adresse: '12 rue des Lilas' })

    await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      prixDemande: '',
      adresse: '',
    })

    await bien.refresh()
    assert.isNull(bien.prixDemande)
    assert.isNull(bien.adresse)
  })

  test('accepte zéro sans le confondre avec un Critère vidé', async ({ client, assert }) => {
    // Zéro place de stationnement est une information, et l'écran doit la
    // distinguer d'un Critère jamais renseigné.
    const bien = await unBien()

    await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      capaciteStationnement: 0,
    })

    await bien.refresh()
    assert.equal(bien.capaciteStationnement, 0)
  })

  /**
   * Les Notes : le texte libre du Bien (#8).
   *
   * Ni un Critère ni un champ lié au Statut — elles ne se comparent pas d'un
   * Bien à l'autre et existent à toute étape du cycle —, mais elles
   * s'enregistrent par la même route et se testent donc ici.
   */
  test('enregistre les Notes d’un Bien', async ({ client, assert }) => {
    const bien = await unBien()

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      notes: 'Cuisine refaite, mais la chaudière est à remplacer.',
    })

    response.assertStatus(200)
    await bien.refresh()
    assert.equal(bien.notes, 'Cuisine refaite, mais la chaudière est à remplacer.')
  })

  test('conserve les sauts de ligne des Notes', async ({ client, assert }) => {
    // C'est la forme même du champ : on y liste des travaux, une ligne par
    // travail. Les replier en un paragraphe rendrait la relecture inutile.
    const bien = await unBien()
    const notes =
      'Visite du 12 mars :\n- cuisine refaite\n- chaudière à remplacer\n\nVoisinage calme.'

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({ notes })

    response.assertStatus(200)
    // Relu depuis la base, et non depuis la réponse : c'est la colonne qui
    // doit porter les sauts de ligne.
    await bien.refresh()
    assert.equal(bien.notes, notes)
    // La réponse les rend aussi : c'est elle que la fiche réaffiche.
    assert.equal(response.body().notes, notes)
  })

  test('accepte des Notes vides', async ({ client, assert }) => {
    // Rien n'oblige à écrire quoi que ce soit : un Bien repéré le soir n'a
    // pas encore été visité (ADR-0008).
    const bien = await unBien()

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      notes: null,
    })

    response.assertStatus(200)
    await bien.refresh()
    assert.isNull(bien.notes)
  })

  test('vide des Notes déjà écrites', async ({ client, assert }) => {
    // C'est ce que le formulaire envoie d'un champ effacé : la chaîne vide
    // vaut « rien d'écrit », et jamais une chaîne vide en base.
    const bien = await unBien({ notes: 'À revoir.' })

    await avecSession(client.patch(`/biens/${bien.id}`), session).json({ notes: '' })

    await bien.refresh()
    assert.isNull(bien.notes)
  })

  test('ramène des Notes d’espaces à rien d’écrit', async ({ client, assert }) => {
    // Un champ rempli d'espaces ou de retours à la ligne n'a rien à dire :
    // il ne doit pas passer pour des Notes prises.
    const bien = await unBien({ notes: 'À revoir.' })

    await avecSession(client.patch(`/biens/${bien.id}`), session).json({ notes: '  \n  ' })

    await bien.refresh()
    assert.isNull(bien.notes)
  })

  test('ne touche pas aux Notes quand la modification ne les transmet pas', async ({
    client,
    assert,
  }) => {
    // Les Notes sont du texte long, et le plus coûteux à perdre de la fiche :
    // un Critère enregistré depuis l'assistant ne doit pas les emporter.
    const bien = await unBien({ notes: 'Chaudière à remplacer.' })

    await avecSession(client.patch(`/biens/${bien.id}`), session).json({ prixDemande: 245_000 })

    await bien.refresh()
    assert.equal(bien.notes, 'Chaudière à remplacer.')
  })

  test('accepte des Notes plus longues que les colonnes de texte', async ({ client, assert }) => {
    // La colonne est un `text` et non un `varchar(255)` : les Notes
    // accueillent plusieurs paragraphes, là où une adresse tient sur une
    // ligne. Une borne à 255 ferait perdre en cours de frappe.
    const bien = await unBien()
    const longues = 'a'.repeat(5_000)

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      notes: longues,
    })

    response.assertStatus(200)
    await bien.refresh()
    assert.equal(bien.notes, longues)
  })

  test('refuse des Notes démesurées', async ({ client, assert }) => {
    // La borne n'est pas celle d'une colonne : elle arrête ce qui ne vient
    // plus d'une saisie au clavier, sans juger de la longueur d'une
    // impression de visite.
    const bien = await unBien()

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      notes: 'a'.repeat(10_001),
    })

    response.assertStatus(422)
    assert.deepInclude(response.body().errors[0], {
      field: 'notes',
      message: 'Les Notes ne doivent pas dépasser 10 000 caractères',
    })
  })

  test('refuse un Critère inconnu', async ({ client, assert }) => {
    // Une faute de frappe sur un nom de champ doit se voir, et non se perdre
    // en silence : l'acheteur croirait avoir saisi une valeur.
    const bien = await unBien()

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      prixNegocie: 240_000,
    })

    response.assertStatus(422)
    assert.equal(response.body().errors[0].field, 'prixNegocie')
  })

  test('accepte les quinze Critères de la définition, et eux seuls', async ({ client, assert }) => {
    /**
     * La liste des champs acceptés est dérivée du schéma de validation, mais
     * c'est ici qu'on vérifie ce qu'elle contient réellement : un Critère
     * oublié dans le schéma serait refusé à la modification sans que rien
     * d'autre ne le signale, et l'acheteur ne pourrait tout simplement pas
     * le renseigner.
     *
     * Les identifiants sont recopiés à la main, comme dans `biens.spec.ts` :
     * la définition vit côté front et n'est pas importable ici, et c'est la
     * duplication qui rend la divergence visible (ADR-0010).
     */
    const bien = await unBien()

    const modifications = {
      prixDemande: 250_000,
      taxeFonciere: 1_450,
      chargesCopropriete: 120,
      surfaceHabitable: 72.5,
      nombrePieces: 3,
      typeBien: 'appartement',
      anneeConstruction: 1998,
      travauxAPrevoir: 'aucun',
      adresse: '12 rue des Lilas',
      villeQuartier: 'Centre',
      tempsTrajetTravail: 25,
      capaciteStationnement: 1,
      dpe: 'C',
      typeChauffage: 'pompeAChaleur',
      exterieur: 'balcon',
    }

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json(
      modifications
    )

    response.assertStatus(200)
    await bien.refresh()
    for (const [champ, valeur] of Object.entries(modifications)) {
      assert.equal((bien as unknown as Record<string, unknown>)[champ], valeur, champ)
    }
  })

  test('refuse une valeur hors de la définition d’une énumération', async ({ client, assert }) => {
    const bien = await unBien()

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      dpe: 'Z',
    })

    response.assertStatus(422)
    assert.equal(response.body().errors[0].field, 'dpe')
  })

  test('refuse un Libellé vidé', async ({ client, assert }) => {
    // Le Libellé est le seul Critère obligatoire (ADR-0008) : c'est le
    // support de mémoire par lequel le Bien se retrouve dans les listes.
    const bien = await unBien()

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      libelle: '',
    })

    response.assertStatus(422)
    assert.equal(response.body().errors[0].message, 'Le Libellé est obligatoire')
  })

  test('refuse une adresse plus longue que la colonne', async ({ client, assert }) => {
    // La colonne est un `string` de 255 : sans borne au validateur, la saisie
    // passerait la validation puis ferait échouer l'écriture — une erreur
    // serveur au lieu d'un refus lisible.
    const bien = await unBien()

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      adresse: 'a'.repeat(256),
    })

    response.assertStatus(422)
    assert.deepInclude(response.body().errors[0], {
      field: 'adresse',
      message: 'L’Adresse ne doit pas dépasser 255 caractères',
    })
  })

  test('refuse une ville ou un quartier plus long que la colonne', async ({ client, assert }) => {
    const bien = await unBien()

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      villeQuartier: 'a'.repeat(256),
    })

    response.assertStatus(422)
    assert.equal(response.body().errors[0].field, 'villeQuartier')
  })

  test('refuse une surface qui n’est pas un nombre', async ({ client, assert }) => {
    const bien = await unBien()

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      surfaceHabitable: 'grande',
    })

    response.assertStatus(422)
    assert.equal(response.body().errors[0].field, 'surfaceHabitable')
  })

  test('refuse un nombre de pièces négatif', async ({ client, assert }) => {
    const bien = await unBien()

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      nombrePieces: -1,
    })

    response.assertStatus(422)
    assert.equal(response.body().errors[0].field, 'nombrePieces')
  })

  test('conserve la surface au dixième près', async ({ client, assert }) => {
    // Les annonces affichent « 72,5 m² » : arrondir fausserait le prix au m².
    const bien = await unBien()

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({
      surfaceHabitable: 72.5,
    })

    response.assertStatus(200)
    // La réponse porte un nombre, et non la chaîne que `pg` rend des décimaux.
    assert.strictEqual(response.body().surfaceHabitable, 72.5)
  })

  test('accepte une mise à jour vide sans rien changer', async ({ client, assert }) => {
    // L'assistant peut passer toutes les questions : rien à enregistrer
    // n'est pas une erreur de saisie.
    const bien = await unBien({ prixDemande: 250_000 })

    const response = await avecSession(client.patch(`/biens/${bien.id}`), session).json({})

    response.assertStatus(200)
    await bien.refresh()
    assert.equal(bien.prixDemande, 250_000)
  })

  test('répond 404 en modifiant un Bien qui n’existe pas', async ({ client }) => {
    const response = await avecSession(client.patch('/biens/404'), session).json({
      prixDemande: 1,
    })

    response.assertStatus(404)
  })

  test('exige la session pour consulter comme pour modifier', async ({ client }) => {
    const bien = await unBien()

    const consultation = await client.get(`/biens/${bien.id}`)
    consultation.assertStatus(401)

    const modification = await client.patch(`/biens/${bien.id}`).json({ prixDemande: 1 })
    modification.assertStatus(401)
  })
})
