import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { TournamentSummary } from '../../data/tournaments-repository';
import { TournamentLiveStore } from '../tournament-live.store';
import { EnrolledTeamsTabComponent } from './enrolled-teams-tab.component';

/** O portão da rota: esconder a aba não fecha o caminho de quem tem o link. Sem este teste, o
 *  `enrolledTeamsVisible: false` continuaria entregando o roster em `/torneios/:id/equipes`.
 *
 *  O store é um dublê mínimo — só os dois sinais que o componente lê — e o `tournamentId` vazio
 *  mantém a busca do roster fora do teste (nenhum toque no Firestore). */
function setup(tournament: Partial<TournamentSummary> | null, tournamentId = '') {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      {
        provide: TournamentLiveStore,
        useValue: {
          tournament: signal(tournament as TournamentSummary | null),
          tournamentId: signal(tournamentId),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(EnrolledTeamsTabComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('EnrolledTeamsTabComponent — portão do organizador', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('com o roster escondido, recusa o acesso direto pela rota', () => {
    const el = setup({ enrolledTeamsVisible: false, categories: [] });

    expect(el.textContent).toContain('não está exibindo as equipes inscritas');
  });

  it('com o roster exposto, não mostra a recusa', () => {
    const el = setup({ enrolledTeamsVisible: true, categories: [] });

    expect(el.textContent).not.toContain('não está exibindo as equipes inscritas');
  });

  it('torneio ainda carregando não é tratado como escondido', () => {
    const el = setup(null);

    expect(el.textContent).not.toContain('não está exibindo as equipes inscritas');
  });
});
