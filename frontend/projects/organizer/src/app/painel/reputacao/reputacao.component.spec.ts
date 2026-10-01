import { Component, provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import type { OrganizerReputation, TournamentReviewSummary } from '../data/tournament-reviews';
import { OgBellComponent } from '../shell/og-bell.component';
import { OgPageHeaderComponent } from '../ui/page-header.component';
import { ReputacaoComponent } from './reputacao.component';

/** `og-bell` de verdade abre `onSnapshot` contra o Firestore — sem sentido aqui. */
@Component({ selector: 'og-bell', template: '' })
class OgBellStub {}

interface Internals {
  reputationReady: WritableSignal<boolean>;
  summariesReady: WritableSignal<boolean>;
  reputation: WritableSignal<OrganizerReputation | null>;
  summaries: WritableSignal<TournamentReviewSummary[]>;
}

function summary(over: Partial<TournamentReviewSummary> = {}): TournamentReviewSummary {
  return {
    tournamentId: 't1',
    tournamentName: 'Copa Agosto',
    tournamentStartAt: new Date('2026-08-02T12:00:00Z'),
    status: 'closed',
    eligibleCount: 42,
    count: 23,
    average: 4.62,
    distribution: { 1: 1, 2: 1, 3: 2, 4: 7, 5: 12 },
    aspects: { organization: { count: 20, average: 4.8 }, schedule: { count: 18, average: 3.4 } },
    opensAt: null,
    closesAt: null,
    ...over,
  };
}

describe('ReputacaoComponent', () => {
  let fixture: ComponentFixture<ReputacaoComponent>;

  async function mount(seed: { reputation: OrganizerReputation | null; summaries: TournamentReviewSummary[] }): Promise<HTMLElement> {
    TestBed.overrideComponent(OgPageHeaderComponent, { remove: { imports: [OgBellComponent] }, add: { imports: [OgBellStub] } });
    await TestBed.configureTestingModule({
      imports: [ReputacaoComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        // Sem usuário o efeito não abre listener. Os dados são semeados à mão. `isSuperAdmin`
        // é lido pelo contexto do chaveamento, que o cabeçalho puxa via `PanelContextService`.
        { provide: AuthService, useValue: { user: signal(null), isSuperAdmin: signal(false) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ReputacaoComponent);
    await fixture.whenStable();
    const internals = fixture.componentInstance as unknown as Internals;
    internals.reputation.set(seed.reputation);
    internals.summaries.set(seed.summaries);
    internals.reputationReady.set(true);
    internals.summariesReady.set(true);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const textOf = (host: HTMLElement) => host.textContent!.replace(/\s+/g, ' ');

  it('média geral, total e torneios; aspectos; tabela do mais recente para o mais antigo', async () => {
    const host = await mount({
      reputation: {
        reviewsCount: 86,
        tournamentsRated: 5,
        average: 4.71,
        aspects: { organization: { count: 80, average: 4.8 }, venue: { count: 40, average: 3.9 } },
      },
      summaries: [
        summary(),
        summary({ tournamentId: 't2', tournamentName: 'Etapa Setembro', tournamentStartAt: new Date('2026-09-20T12:00:00Z'), count: 2, average: null, aspects: null }),
      ],
    });
    expect([...host.querySelectorAll('.og-rep-kpis .og-kpi-value')].map((e) => e.textContent!.trim())).toEqual(['4,7 ★', '86', '5']);
    expect([...host.querySelectorAll('.og-rep-aspect-name')].map((e) => e.textContent!.trim())).toEqual([
      'Estrutura do local',
      'Organização geral',
    ]);
    const rows = [...host.querySelectorAll<HTMLAnchorElement>('a.og-rep-row')];
    expect(rows.map((r) => r.querySelector('.og-rep-title')!.textContent!.trim())).toEqual(['Etapa Setembro', 'Copa Agosto']);
    expect(rows[0].getAttribute('href')).toBe('/painel/eventos/t2/avaliacoes');
    expect(rows[0].querySelector('.og-rep-avg')!.textContent!.trim()).toBe('—');
    expect(rows[1].querySelector('.og-rep-avg')!.textContent!.trim()).toBe('4,6');
    expect(rows[1].querySelector('.c-weak')!.textContent!.trim()).toBe('Cumprimento dos horários');
    expect(textOf(host)).not.toContain('As notas aparecem a partir de 3 avaliações.');
  });

  it('abaixo de 3 avaliações no total: — e o aviso, sem aspectos', async () => {
    const host = await mount({ reputation: { reviewsCount: 2, tournamentsRated: 1, average: null, aspects: null }, summaries: [] });
    expect(host.querySelector('.og-rep-kpis .og-kpi-value')!.textContent!.trim()).toBe('—');
    expect(textOf(host)).toContain('As notas aparecem a partir de 3 avaliações.');
    expect(host.querySelector('.og-rep-aspect-name')).toBeNull();
  });

  it('sem nenhum torneio avaliado', async () => {
    const host = await mount({ reputation: null, summaries: [] });
    expect(textOf(host)).toContain('Nenhum torneio seu passou pela avaliação dos atletas ainda.');
  });
});
