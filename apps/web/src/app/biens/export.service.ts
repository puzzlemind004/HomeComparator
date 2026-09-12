import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, type Observable, of } from 'rxjs';
import { urlExport } from './routes';

/**
 * L'export du carnet, déclenché depuis l'écran (#14).
 *
 * Tout est saisi à la main (ADR-0001) : trois mois de recherche perdus
 * videraient le carnet de son intérêt. Le bouton sert deux choses à la fois
 * — sortir ses Biens vers un tableur, et ne pas se sentir prisonnier de
 * l'outil (ADR-0007).
 *
 * **Le fichier n'est pas fabriqué ici.** C'est l'API qui rend le JSON ou le
 * CSV tout écrits, en-têtes et échappement compris : le format se décrit à
 * un seul endroit, et les tests fonctionnels Japa le tiennent. Ce service ne
 * fait que demander, et déclencher l'enregistrement.
 *
 * Pourquoi un `HttpClient` et non un simple lien vers `/api/export` : un
 * lien quitterait l'application le temps du téléchargement, et surtout
 * n'aurait aucun moyen de dire à l'acheteur que l'API n'a pas répondu — il
 * verrait une page d'erreur nue à la place de son carnet. Le coût est ce
 * détour par un blob, et il achète un échec qui se dit à l'écran.
 */

/** Les deux formats proposés, tels que l'API les nomme. */
export type FormatExport = 'json' | 'csv';

/**
 * L'issue d'un export. Un échec porte son message, une réussite ne porte
 * rien : le fichier est chez l'acheteur, et il n'y a rien à en dire de plus.
 */
export type ExportResultat = { exporte: true } | { exporte: false; erreur: string };

const EXPORT_INJOIGNABLE = "L'API est injoignable. L'export n'a pas été produit.";

const EXPORT_VIDE = "L'API a répondu sans contenu. L'export n'a pas été produit.";

/**
 * Le nom sous lequel enregistrer quand l'API n'en donne pas.
 *
 * Sans date, à la différence de celui que l'API compose : un nom daté
 * inventé ici prétendrait à une précision que ce cas de repli n'a pas.
 */
const NOM_PAR_DEFAUT: Record<FormatExport, string> = {
  json: 'homecomparator.json',
  csv: 'homecomparator.csv',
};

@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly http = inject(HttpClient);

  /**
   * Demande l'export et l'enregistre chez l'acheteur.
   *
   * La réponse est demandée entière — corps **et** en-têtes — parce que
   * c'est l'en-tête `Content-Disposition` qui porte le nom daté du fichier.
   * Le recomposer ici en ferait une seconde source à tenir d'accord avec
   * l'API.
   */
  exporter(format: FormatExport): Observable<ExportResultat> {
    return this.http.get(urlExport(format), { observe: 'response', responseType: 'blob' }).pipe(
      map((reponse): ExportResultat => {
        const contenu = reponse.body;

        /**
         * Une réponse vide n'est pas un export : l'enregistrer produirait
         * un fichier de zéro octet que l'acheteur croirait être sa copie,
         * et découvrirait vide le jour où il en aurait besoin.
         */
        if (!contenu || contenu.size === 0) {
          return { exporte: false, erreur: EXPORT_VIDE };
        }

        enregistrer(contenu, nomDuFichier(reponse.headers.get('content-disposition'), format));

        return { exporte: true };
      }),
      catchError(() => of<ExportResultat>({ exporte: false, erreur: EXPORT_INJOIGNABLE })),
    );
  }
}

/**
 * Le nom porté par l'en-tête `Content-Disposition`, ou celui par défaut.
 *
 * L'expression ne lit que la forme que cette API produit — un `filename`
 * entre guillemets. Les formes exotiques du format (`filename*`, encodages)
 * ne sont pas couvertes : elles n'arriveront pas d'une API qu'on écrit
 * soi-même, et le repli est de toute façon un nom valide.
 */
function nomDuFichier(disposition: string | null, format: FormatExport): string {
  const trouve = disposition?.match(/filename="([^"]+)"/)?.[1];

  return trouve ?? NOM_PAR_DEFAUT[format];
}

/**
 * Le geste que le navigateur ne fait pas de lui-même sur une requête XHR :
 * proposer le corps reçu à l'enregistrement.
 *
 * Un lien fabriqué et cliqué, ce qui est la façon dont cela se fait — il n'y
 * a pas d'API dédiée que tous les navigateurs partagent. Deux précautions
 * l'entourent, et chacune répare un échec **silencieux** : le fichier
 * n'arrive pas, et le service annonce pourtant une réussite. C'est le pire
 * cas pour un export — l'acheteur croit tenir sa copie, et ne le découvre
 * qu'au moment d'en avoir besoin.
 *
 * **Le lien est attaché au document avant le clic.** Firefox n'honore pas un
 * clic sur un lien de téléchargement détaché ; Chrome et Safari s'en
 * accommodent. Il est retiré ensuite, faute de quoi un lien invisible
 * s'accumulerait à chaque export.
 *
 * **L'URL n'est révoquée qu'au tour suivant.** Le navigateur va chercher le
 * contenu de façon asynchrone, et la révoquer dans le même tour que le clic
 * court-circuite ce téléchargement — là encore sur Firefox et les Safari
 * anciens. Elle l'est bien, cependant : sans cela le blob resterait en
 * mémoire jusqu'au rechargement de la page, et un acheteur qui exporte
 * plusieurs fois les accumulerait.
 */
function enregistrer(contenu: Blob, nom: string): void {
  const url = URL.createObjectURL(contenu);
  const lien = document.createElement('a');

  lien.href = url;
  lien.download = nom;

  document.body.appendChild(lien);
  lien.click();
  lien.remove();

  setTimeout(() => URL.revokeObjectURL(url), 0);
}
