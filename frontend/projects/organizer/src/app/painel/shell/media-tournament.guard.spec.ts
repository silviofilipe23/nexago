import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { TournamentRole } from '../data/tournament.model';
import { mediaTournamentGuard } from './media-tournament.guard';
import { StaffRoleLookup } from './staff-role-lookup';

@Component({ template: '' })
class VazioComponent {}

/** Dublê da consulta: o real lê UM doc do espelho (`users/{uid}/tournamentStaff/{tid}`). */
class FakeLookup {
  readonly asked: string[] = [];
  constructor(private readonly role: TournamentRole | null) {}
  roleIn(tournamentId: string): Promise<TournamentRole | null> {
    this.asked.push(tournamentId);
    return Promise.resolve(this.role);
  }
}

async function navegar(role: TournamentRole | null, url: string) {
  const fake = new FakeLookup(role);
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([
        {
          path: 'painel/eventos/:id',
          canActivateChild: [mediaTournamentGuard],
          children: [
            { path: '', component: VazioComponent },
            { path: 'transmissao', component: VazioComponent },
            { path: 'inscricoes', component: VazioComponent },
            { path: 'categorias/:catId', children: [{ path: 'jogos', component: VazioComponent }] },
          ],
        },
      ]),
      { provide: StaffRoleLookup, useValue: fake },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  return { url: TestBed.inject(Router).url, fake };
}

describe('mediaTournamentGuard', () => {
  it('mídia em Inscrições vai pra Transmissão', async () => {
    const { url } = await navegar('media', '/painel/eventos/t1/inscricoes');
    expect(url).toBe('/painel/eventos/t1/transmissao');
  });

  it('mídia num neto (categorias/:catId/jogos) também vai — o papel é do torneio da rota', async () => {
    const { url, fake } = await navegar('media', '/painel/eventos/t1/categorias/c1/jogos');
    expect(url).toBe('/painel/eventos/t1/transmissao');
    expect(fake.asked).toContain('t1');
  });

  it('mídia na Transmissão fica — sem laço de redirecionamento', async () => {
    const { url } = await navegar('media', '/painel/eventos/t1/transmissao');
    expect(url).toBe('/painel/eventos/t1/transmissao');
  });

  it('gestor e quem não tem papel no espelho (dono, super admin) passam', async () => {
    expect((await navegar('manager', '/painel/eventos/t1/inscricoes')).url).toBe('/painel/eventos/t1/inscricoes');
    TestBed.resetTestingModule();
    expect((await navegar(null, '/painel/eventos/t1/inscricoes')).url).toBe('/painel/eventos/t1/inscricoes');
  });
});
