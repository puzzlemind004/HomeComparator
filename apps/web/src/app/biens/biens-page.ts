import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BienService, type ListeBiens } from './bien.service';

/**
 * L'écran de repérage : saisir un Libellé, et retrouver le Bien dans la
 * liste. Le geste doit tenir en quelques secondes (ADR-0008), donc le
 * formulaire ne demande rien d'autre — l'URL de l'Annonce reste facultative.
 */
@Component({
  selector: 'app-biens-page',
  imports: [FormsModule, RouterLink],
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

  /**
   * La liste, ou l'aveu qu'on n'a pas pu la charger. `null` tant que l'API
   * n'a pas répondu : les trois états sont distincts à l'écran, une liste
   * vide ne devant jamais être confondue avec un chargement raté.
   */
  readonly liste = signal<ListeBiens | null>(null);
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
        this.liste.update((liste) =>
          liste?.chargee ? { chargee: true, biens: [resultat.bien, ...liste.biens] } : liste,
        );
        this.libelle.set('');
        this.urlAnnonce.set('');
      });
  }

  private rafraichir(): void {
    this.bienService.lister().subscribe((liste) => this.liste.set(liste));
  }
}
