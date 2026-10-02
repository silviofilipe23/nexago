import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  provideRouter,
  type ActivatedRouteSnapshot,
  Router,
  type RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { firstValueFrom, type Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { staffGuard } from './staff.guard';

describe('staffGuard', () => {
  const firebase = environment.firebase as { apiKey: string };
  let realApiKey: string;

  beforeEach(() => {
    realApiKey = firebase.apiKey;
  });

  afterEach(() => {
    firebase.apiKey = realApiKey;
  });

  function run(uid: string | null): Promise<boolean | UrlTree> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { authReady: signal(true), user: signal(uid ? { uid } : null) },
        },
      ],
    });
    const result = TestBed.runInInjectionContext(() =>
      staffGuard({} as ActivatedRouteSnapshot, { url: '/mesa' } as RouterStateSnapshot),
    ) as Observable<boolean | UrlTree>;
    return firstValueFrom(result);
  }

  function urlOf(result: boolean | UrlTree): string {
    expect(result).toBeInstanceOf(UrlTree);
    return TestBed.inject(Router).serializeUrl(result as UrlTree);
  }

  it('sem sessão: volta pro painel', async () => {
    expect(urlOf(await run(null))).toBe('/painel');
  });

  // O Firestore chega por import dinâmico; sem config não há onde ler a equipe.
  it('sem config do Firebase: volta pro painel', async () => {
    firebase.apiKey = '';
    expect(urlOf(await run('u1'))).toBe('/painel');
  });
});
