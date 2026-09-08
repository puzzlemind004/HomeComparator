import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BienService } from './bien.service';
import type { Bien } from './bien';

/**
 * L'écran de repérage : saisir un Libellé, et retrouver le Bien dans la
 * liste. Le geste doit tenir en quelques secondes (ADR-0008), donc le
 * formulaire ne demande rien d'autre — l'URL de l'Annonce reste facultative.
 */
@Component({
  selector: 'app-biens-page',
  imports: [FormsModule],
  styleUrl: './biens-page.scss',
  templateUrl: './biens-page.html',
})
export class BiensPage {
  private readonly bienService = inject(BienService);

  /**
   * L'état lu par le gabarit. Il est public plutôt que `protected` pour
   * rester lisible par les tests, qui l'interrogent là où ils devraient
   * sinon inspecter le DOM rendu.
   */
  readonly libelle = signal('');
  readonly urlAnnonce = signal('');

  readonly biens = signal<Bien[]>([]);
  readonly erreurs = signal<string[]>([]);
  readonly enregistrement = signal(false);

  constructor() {
    this.rafraichir();
  }

  creer(): void {
    if (this.enregistrement()) {
      return;
    }

    this.enregistrement.set(true);
    this.erreurs.set([]);

    this.bienService
      .creer({ libelle: this.libelle(), urlAnnonce: this.urlAnnonce() })
      .subscribe((resultat) => {
        this.enregistrement.set(false);

        if (!resultat.cree) {
          this.erreurs.set(resultat.erreurs);
          return;
        }

        // Le Bien créé rejoint la liste sans nouvel aller-retour : il
        // apparaît immédiatement, ce qui est tout l'objet de l'écran.
        this.biens.update((biens) => [resultat.bien, ...biens]);
        this.libelle.set('');
        this.urlAnnonce.set('');
      });
  }

  private rafraichir(): void {
    this.bienService.lister().subscribe((biens) => this.biens.set(biens));
  }
}
