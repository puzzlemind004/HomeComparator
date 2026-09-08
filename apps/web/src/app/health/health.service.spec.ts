import { describe, expect, it } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, of, throwError, type Observable } from 'rxjs';
import { HealthService } from './health.service';

/**
 * Le service est construit sans TestBed : un Injector nu suffit à fournir
 * le seul HttpClient dont il dépend.
 *
 * `HttpClient.get` est très surchargé ; le double ne déclare que la
 * signature réellement employée par le service.
 */
function createService(get: (url: string) => Observable<unknown>) {
  const injector = Injector.create({
    providers: [{ provide: HttpClient, useValue: { get } }],
  });

  return runInInjectionContext(injector, () => new HealthService());
}

describe('HealthService', () => {
  it("rapporte l'API en bonne santé quand elle répond ok", async () => {
    const service = createService(() => of({ status: 'ok', database: 'ok' }));

    const health = await firstValueFrom(service.check());

    expect(health).toEqual({ reachable: true, status: 'ok', database: 'ok' });
  });

  it("rapporte la base injoignable quand l'API le signale", async () => {
    const service = createService(() => of({ status: 'degraded', database: 'unreachable' }));

    const health = await firstValueFrom(service.check());

    expect(health).toEqual({ reachable: true, status: 'degraded', database: 'unreachable' });
  });

  it("rapporte l'API injoignable plutôt que de propager l'erreur", async () => {
    // Une API éteinte est un état à afficher, pas une exception à laisser fuir.
    const service = createService(() => throwError(() => new Error('connexion refusée')));

    const health = await firstValueFrom(service.check());

    expect(health).toEqual({ reachable: false });
  });

  it("interroge la route de santé de l'API", async () => {
    const urls: string[] = [];
    const service = createService((url) => {
      urls.push(url);
      return of({ status: 'ok', database: 'ok' });
    });

    await firstValueFrom(service.check());

    expect(urls).toEqual(['/api/health']);
  });
});
