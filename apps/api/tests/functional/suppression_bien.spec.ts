import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Bien from '#models/bien'
import { avecSession, ouvrirSession, type Session } from '#tests/session'
import { PROPRIETAIRE_UNIQUE } from '#services/proprietaire'
import { STATUT_INITIAL } from '#services/statut'

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
    await db.from('biens').delete()
    session = await ouvrirSession(context.client)
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
     * Tout ce qui est noté d'un Bien vit dans sa ligne : les Critères en
     * colonnes (ADR-0004), les Notes dans la leur (ADR-0012), les champs
     * liés au Statut dans les leurs (ADR-0002). Aucune table ne s'y
     * rattache, et le carnet ne stocke aujourd'hui aucun fichier.
     *
     * Ce test tient cette propriété : la ligne partie, il ne reste rien du
     * Bien nulle part. Le jour où une table ou un fichier s'y rattachera —
     * les photos d'ADR-0007 —, il échouera, ce qui est exactement le
     * rappel qu'on veut à ce moment-là.
     */
    const bien = await unBien({
      prixDemande: 250_000,
      notes: 'des travaux dans la salle de bain',
      dpe: 'C',
    })

    await avecSession(client.delete(`/biens/${bien.id}`), session)

    const restant = await db.from('biens').where('id', bien.id)
    assert.isEmpty(restant)

    /**
     * Les clés étrangères qui pointent vers `biens`, telles que PostgreSQL
     * les connaît — et non les colonnes dont le nom contient « bien ».
     *
     * Chercher sur le nom ne prouverait rien : une table de photos dont la
     * colonne s'appellerait `logement_id`, ou une table de liaison dont la
     * clé s'appellerait `ref`, passerait sans être vue. C'est le lien
     * déclaré qui compte, quel que soit le nom qu'on lui donne.
     */
    const referencesAuBien = await db
      .from('information_schema.table_constraints as contrainte')
      .join(
        'information_schema.constraint_column_usage as cible',
        'contrainte.constraint_name',
        'cible.constraint_name'
      )
      .select('contrainte.table_name')
      .where('contrainte.constraint_type', 'FOREIGN KEY')
      .where('cible.table_name', 'biens')

    assert.isEmpty(referencesAuBien)
  })

  test('exige la session pour supprimer', async ({ client, assert }) => {
    const bien = await unBien()

    const response = await client.delete(`/biens/${bien.id}`)

    response.assertStatus(401)
    // Un refus qui aurait tout de même supprimé serait le pire des deux.
    assert.isNotNull(await Bien.find(bien.id))
  })
})
