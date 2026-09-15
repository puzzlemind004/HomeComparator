import { describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { Subject, of, type Observable } from 'rxjs';
import { ExportPage } from './export-page';
import { ExportService, type ExportResultat, type FormatExport } from './export.service';

function creerPage(
  exportService: { exporter?: (format: FormatExport) => Observable<ExportResultat> } = {},
) {
  const injector = Injector.create({
    providers: [
      {
        provide: ExportService,
        useValue: { exporter: () => of<ExportResultat>({ exporte: true }), ...exportService },
      },
    ],
  });

  return runInInjectionContext(injector, () => new ExportPage());
}

describe('ExportPage', () => {
  it('n’exporte rien tant qu’on ne le demande pas', () => {
    const page = creerPage();

    expect(page.export()).toBeNull();
    expect(page.erreurExport()).toBeNull();
  });

  it('demande le format choisi', () => {
    const formats: FormatExport[] = [];
    const page = creerPage({
      exporter: (format) => {
        formats.push(format);
        return of<ExportResultat>({ exporte: true });
      },
    });

    page.exporter('csv');

    expect(formats).toEqual(['csv']);
  });

  it('dit lequel des deux boutons travaille', () => {
    // Un format plutôt qu'un booléen : un carnet bien rempli met un instant
    // à sortir, et sans cela l'acheteur ne saurait pas si son clic a porté.
    const page = creerPage({ exporter: () => new Subject<ExportResultat>() });

    page.exporter('json');

    expect(page.export()).toBe('json');
  });

  it('ignore un second clic tant que le premier n’a pas rendu', () => {
    // Deux demandes impatientes produiraient deux téléchargements du même
    // carnet.
    let appels = 0;
    const page = creerPage({
      exporter: () => {
        appels += 1;
        return new Subject<ExportResultat>();
      },
    });

    page.exporter('csv');
    page.exporter('json');

    expect(appels).toBe(1);
    expect(page.export()).toBe('csv');
  });

  it('dit qu’un export n’a pas abouti', () => {
    // Sans message, l'acheteur croirait tenir une copie de son carnet alors
    // que rien n'est sorti — et ne s'en apercevrait qu'au pire moment
    // (ADR-0007).
    const page = creerPage({
      exporter: () => of<ExportResultat>({ exporte: false, erreur: "L'API est injoignable." }),
    });

    page.exporter('csv');

    expect(page.erreurExport()).toBe("L'API est injoignable.");
    expect(page.export()).toBeNull();
  });

  it('efface l’échec précédent à la tentative suivante', () => {
    // Le laisser afficher pendant la nouvelle tentative ferait lire l'échec
    // d'hier comme celui d'aujourd'hui.
    const resultats = new Subject<ExportResultat>();
    const page = creerPage({ exporter: () => resultats });

    page.exporter('csv');
    resultats.next({ exporte: false, erreur: "L'API est injoignable." });
    expect(page.erreurExport()).not.toBeNull();

    page.exporter('csv');
    expect(page.erreurExport()).toBeNull();
  });

  it('ne dit rien d’une réussite', () => {
    // Le navigateur a déjà annoncé le téléchargement : un message de plus
    // ferait du bruit pour une chose déjà dite.
    const page = creerPage();

    page.exporter('json');

    expect(page.erreurExport()).toBeNull();
    expect(page.export()).toBeNull();
  });
});
