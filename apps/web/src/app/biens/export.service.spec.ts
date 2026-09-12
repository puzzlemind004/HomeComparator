import { afterEach, describe, expect, it, vi } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, of, throwError, type Observable } from 'rxjs';
import { ExportService } from './export.service';

/**
 * L'export vu depuis l'écran (#14).
 *
 * Le service ne fabrique aucun fichier : c'est l'API qui rend le JSON ou le
 * CSV, en-têtes compris (ADR-0004 gardant les libellés côté front, mais
 * l'export sortant des identifiants de colonnes). Ce qu'il fait ici, c'est
 * demander le bon format, et **déclencher l'enregistrement** — le geste que
 * le navigateur ne fait pas de lui-même sur une requête XHR.
 *
 * Le service est construit sans TestBed, comme les autres du projet : un
 * Injector nu suffit à fournir le seul HttpClient dont il dépend.
 */
function creerService(http: { get?: (url: string, options: unknown) => Observable<unknown> }) {
  const injector = Injector.create({ providers: [{ provide: HttpClient, useValue: http }] });

  return runInInjectionContext(injector, () => new ExportService());
}

/**
 * Ce que l'API renvoie : le corps en blob, et l'en-tête qui nomme le
 * fichier. `HttpClient` rend les deux ensemble quand on lui demande la
 * réponse complète, ce que le service fait pour lire le nom.
 */
function reponse(corps: string, nom = 'homecomparator-2026-09-12.json') {
  return {
    body: new Blob([corps], { type: 'application/json' }),
    headers: {
      get: (entete: string) =>
        entete.toLowerCase() === 'content-disposition' ? `attachment; filename="${nom}"` : null,
    },
  };
}

/**
 * Le navigateur, réduit à ce que l'enregistrement d'un fichier lui demande.
 *
 * `createObjectURL` n'existe pas dans jsdom : sans ce double, le service
 * échouerait sur une absence d'API et non sur ce qu'on teste.
 *
 * Les deux fonctions sont posées **sur** `URL` plutôt que `URL` remplacée
 * en entier : le constructeur sert ailleurs dans la suite — le routeur
 * d'Angular en fabrique —, et le remplacer casse des fichiers de test qui
 * n'ont rien à voir avec l'export. C'est la leçon d'un `stubGlobal` qui
 * avait fait tomber trois suites voisines.
 */
function simulerNavigateur() {
  const creerUrl = vi.fn(() => 'blob:fabrique');
  const revoquerUrl = vi.fn();
  const clic = vi.fn();

  /**
   * jsdom ne fournit ni l'une ni l'autre : `spyOn` exige une propriété
   * existante, d'où ces deux poses préalables. Elles sont inoffensives
   * là où les fonctions existent déjà, `spyOn` les remplaçant aussitôt.
   */
  URL.createObjectURL ??= () => '';
  URL.revokeObjectURL ??= () => undefined;

  vi.spyOn(URL, 'createObjectURL').mockImplementation(creerUrl);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revoquerUrl);

  const lien = document.createElement('a');
  lien.click = clic;

  vi.spyOn(document, 'createElement').mockReturnValue(lien);

  return { creerUrl, revoquerUrl, clic, lien };
}

/**
 * Les doubles sont retirés après chaque test : `document.createElement` est
 * partagé par toute la suite, et le laisser rendre toujours le même lien
 * ferait échouer des tests voisins pour une raison invisible depuis eux.
 */
afterEach(() => {
  vi.restoreAllMocks();
});

describe('ExportService', () => {
  describe('exporter', () => {
    it('demande le format choisi à l’API', async () => {
      simulerNavigateur();

      let urlAppelee: string | undefined;
      const service = creerService({
        get: (url) => {
          urlAppelee = url;
          return of(reponse('{}'));
        },
      });

      await firstValueFrom(service.exporter('csv'));

      expect(urlAppelee).toBe('/api/export?format=csv');
    });

    it('demande le JSON quand c’est le format choisi', async () => {
      simulerNavigateur();

      let urlAppelee: string | undefined;
      const service = creerService({
        get: (url) => {
          urlAppelee = url;
          return of(reponse('{}'));
        },
      });

      await firstValueFrom(service.exporter('json'));

      expect(urlAppelee).toBe('/api/export?format=json');
    });

    /**
     * Le fichier s'enregistre, et c'est tout l'objet du service : une
     * requête XHR rend un corps en mémoire, là où l'acheteur attend un
     * fichier dans son dossier de téléchargements.
     */
    it('déclenche l’enregistrement du fichier', async () => {
      const { clic, creerUrl, revoquerUrl } = simulerNavigateur();
      const service = creerService({ get: () => of(reponse('{}')) });

      const resultat = await firstValueFrom(service.exporter('json'));

      expect(resultat.exporte).toBe(true);
      expect(creerUrl).toHaveBeenCalledOnce();
      expect(clic).toHaveBeenCalledOnce();

      /**
       * L'URL fabriquée finit par être révoquée — sans cela, le blob
       * resterait en mémoire jusqu'au rechargement de la page — mais
       * **plus tard**, le test voisin disant pourquoi.
       */
      await new Promise((suite) => setTimeout(suite, 0));
      expect(revoquerUrl).toHaveBeenCalledWith('blob:fabrique');
    });

    /**
     * Le lien est **dans le document** au moment du clic.
     *
     * Firefox n'honore pas un clic sur un lien de téléchargement détaché :
     * le geste ne fait rien, et le service annoncerait pourtant une
     * réussite. C'est le pire des échecs pour un export — l'acheteur croit
     * tenir sa copie, et ne le découvre qu'au moment d'en avoir besoin.
     */
    it('attache le lien au document avant de cliquer', async () => {
      const { lien } = simulerNavigateur();
      const attaches: Node[] = [];

      vi.spyOn(document.body, 'appendChild').mockImplementation((noeud: Node) => {
        attaches.push(noeud);
        return noeud;
      });

      const retire = vi.spyOn(lien, 'remove');

      await firstValueFrom(creerService({ get: () => of(reponse('{}')) }).exporter('json'));

      expect(attaches).toContain(lien);
      // Et il est retiré ensuite : un lien invisible laissé dans le
      // document s'accumulerait à chaque export.
      expect(retire).toHaveBeenCalledOnce();
    });

    /**
     * L'URL du blob n'est **pas** révoquée dans le même tour que le clic.
     *
     * Le navigateur va chercher le contenu de l'URL de façon asynchrone ;
     * la révoquer aussitôt court-circuite ce téléchargement sur Firefox et
     * les Safari anciens. Le fichier n'arrive jamais, et le service annonce
     * une réussite — le même mensonge que ci-dessus.
     */
    it('ne révoque pas l’URL dans le même tour que le clic', async () => {
      const { revoquerUrl } = simulerNavigateur();

      await firstValueFrom(creerService({ get: () => of(reponse('{}')) }).exporter('json'));

      // Rien tout de suite : le téléchargement a besoin de l'URL.
      expect(revoquerUrl).not.toHaveBeenCalled();

      // Mais bien plus tard, sans quoi le blob resterait en mémoire.
      await new Promise((suite) => setTimeout(suite, 0));
      expect(revoquerUrl).toHaveBeenCalledWith('blob:fabrique');
    });

    /**
     * Le nom du fichier vient de l'API, qui le date (#14). Le recomposer
     * ici en ferait une seconde source à tenir d'accord, et un export
     * enregistré sous un nom que l'API n'a pas choisi mentirait sur sa
     * date le jour où les deux divergeraient.
     */
    it('enregistre sous le nom que l’API donne', async () => {
      const { lien } = simulerNavigateur();
      const service = creerService({
        get: () => of(reponse('{}', 'homecomparator-2026-03-14.csv')),
      });

      await firstValueFrom(service.exporter('csv'));

      expect(lien.download).toBe('homecomparator-2026-03-14.csv');
    });

    /**
     * Une réponse sans en-tête de nom reste enregistrable : le service se
     * rabat sur un nom par défaut plutôt que de perdre l'export. Le cas
     * n'arrive pas avec cette API, mais un proxy mal réglé suffirait à
     * retirer l'en-tête, et un carnet qu'on ne peut pas sortir est
     * exactement ce que l'export existe pour éviter.
     */
    it('se rabat sur un nom par défaut si l’API n’en donne pas', async () => {
      const { lien } = simulerNavigateur();
      const service = creerService({
        get: () => of({ body: new Blob(['{}']), headers: { get: () => null } }),
      });

      await firstValueFrom(service.exporter('csv'));

      expect(lien.download).toBe('homecomparator.csv');
    });

    /**
     * Une API injoignable est un état à afficher, pas une exception à
     * laisser fuir : l'acheteur doit savoir que sa copie n'a pas été
     * produite, plutôt que de croire l'avoir en main.
     */
    it('rend l’échec plutôt que de le laisser fuir', async () => {
      simulerNavigateur();

      const service = creerService({
        get: () => throwError(() => new HttpErrorResponse({ status: 0 })),
      });

      const resultat = await firstValueFrom(service.exporter('json'));

      expect(resultat.exporte).toBe(false);
      expect(resultat.exporte === false && resultat.erreur).toBeTruthy();
    });

    /**
     * Une réponse vide n'est pas un export : l'enregistrer produirait un
     * fichier de zéro octet que l'acheteur croirait être sa copie.
     */
    it('refuse une réponse sans corps', async () => {
      const { clic } = simulerNavigateur();
      const service = creerService({
        get: () => of({ body: null, headers: { get: () => null } }),
      });

      const resultat = await firstValueFrom(service.exporter('json'));

      expect(resultat.exporte).toBe(false);
      expect(clic).not.toHaveBeenCalled();
    });
  });
});
