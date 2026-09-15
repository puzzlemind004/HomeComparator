import { Component, inject, signal } from '@angular/core';
import { ExportService, type FormatExport } from './export.service';

/**
 * L'écran de l'export (#14, #124).
 *
 * L'export vivait entre le formulaire de repérage et les filtres du carnet,
 * où rien ne le désignait : c'est pourtant ce qui permet de sortir ses
 * données, et de ne pas se sentir prisonnier de l'outil (ADR-0007). Il a
 * donc sa route, atteignable depuis n'importe quel écran par la navigation.
 *
 * L'écran ne fabrique pas le fichier : c'est l'API qui le rend tout écrit
 * et `ExportService` qui déclenche l'enregistrement. Ce qui se décide ici est
 * ce que l'acheteur voit pendant et après — le bouton qui travaille, et le
 * message quand rien n'est sorti.
 */
@Component({
  selector: 'app-export-page',
  styleUrl: './export-page.scss',
  templateUrl: './export-page.html',
})
export class ExportPage {
  private readonly exportService = inject(ExportService);

  /**
   * Le format dont l'export est en cours, ou `null` si aucun ne l'est.
   *
   * Un format plutôt qu'un booléen : il dit lequel des deux boutons
   * travaille, et un carnet bien rempli met un instant à sortir. Sans lui,
   * l'acheteur ne saurait pas si son clic a été pris en compte, et
   * cliquerait à nouveau.
   */
  readonly export = signal<FormatExport | null>(null);

  /**
   * Ce qui a empêché le dernier export, ou `null`.
   *
   * Un échec d'export se dit : sans message, l'acheteur croirait tenir une
   * copie de son carnet alors que rien n'a été produit — et ne s'en
   * apercevrait que le jour où il en aurait besoin, qui est le pire moment
   * (ADR-0007).
   *
   * Une réussite, elle, ne dit rien : le navigateur a déjà annoncé le
   * téléchargement, et un message de plus ferait du bruit pour une chose
   * déjà dite.
   */
  readonly erreurExport = signal<string | null>(null);

  /**
   * L'export du carnet dans le format demandé.
   *
   * Un second clic est ignoré tant que le premier n'a pas rendu : deux
   * demandes impatientes produiraient deux téléchargements du même carnet.
   * C'est le même garde que l'enregistrement d'un Bien.
   */
  exporter(format: FormatExport): void {
    if (this.export()) {
      return;
    }

    this.export.set(format);
    // L'échec précédent s'efface : le laisser afficher pendant la nouvelle
    // tentative ferait lire l'échec d'hier comme celui d'aujourd'hui.
    this.erreurExport.set(null);

    this.exportService.exporter(format).subscribe((resultat) => {
      this.export.set(null);

      if (!resultat.exporte) {
        this.erreurExport.set(resultat.erreur);
      }
    });
  }
}
