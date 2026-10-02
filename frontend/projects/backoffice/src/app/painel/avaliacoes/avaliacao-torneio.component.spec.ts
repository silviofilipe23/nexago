import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import type { AdminReview, ReviewSummary } from './data/tournament-reviews';
import { TournamentReviewsAdminRepository } from './data/tournament-reviews.repository';
import { AvaliacaoTorneioComponent } from './avaliacao-torneio.component';

function summary(over: Partial<ReviewSummary> = {}): ReviewSummary {
  return {
    tournamentId: 't1',
    tournamentName: 'Copa Aurora',
    organizerId: 'organizer-uid-123456',
    tournamentStartAt: new Date('2026-09-26T12:00:00Z'),
    opensAt: null,
    closesAt: new Date('2026-09-30T13:00:00Z'),
    status: 'closed',
    eligibleCount: 42,
    count: 2,
    average: null,
    ...over,
  };
}

function review(over: Partial<AdminReview> = {}): AdminReview {
  return {
    id: 't1_athlete-uid-000001',
    uid: 'athlete-uid-000001',
    overall: 4,
    aspects: {},
    comment: null,
    createdAt: new Date('2026-10-02T13:00:00Z'),
    updatedAt: new Date('2026-10-02T13:00:00Z'),
    ...over,
  };
}

describe('AvaliacaoTorneioComponent', () => {
  let fixture: ComponentFixture<AvaliacaoTorneioComponent>;

  async function mount(repo: Partial<TournamentReviewsAdminRepository>, id = 't1'): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [AvaliacaoTorneioComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { displayName: signal(null), user: signal(null) } },
        { provide: TournamentReviewsAdminRepository, useValue: repo },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AvaliacaoTorneioComponent);
    fixture.componentRef.setInput('id', id);
    fixture.detectChanges();
    await settle();
    return fixture.nativeElement as HTMLElement;
  }

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }

  const textOf = (host: HTMLElement) => host.textContent!.replace(/\s+/g, ' ');

  it('lista cada avaliação com o nome do atleta, a data, as estrelas, os aspectos e o comentário', async () => {
    const host = await mount({
      getSummary: () => Promise.resolve(summary()),
      listReviews: () =>
        Promise.resolve([
          review(),
          review({
            id: 't1_athlete-uid-000002',
            uid: 'athlete-uid-000002',
            overall: 2,
            aspects: { prizes: 1 },
            comment: 'Premiação não foi entregue.',
            createdAt: new Date('2026-10-03T12:00:00Z'),
            updatedAt: new Date('2026-10-04T12:30:00Z'),
          }),
        ]),
      profileNames: () =>
        Promise.resolve(new Map([['athlete-uid-000002', 'Bruna Lima'], ['organizer-uid-123456', 'Arena Garden Eventos']])),
    });
    const text = textOf(host);
    expect(host.querySelector('.bo-detail-header h1')!.textContent).toContain('Copa Aurora');
    expect(text).toContain('Organizado por Arena Garden Eventos · 26/09/2026');
    const athletes = [...host.querySelectorAll('.rv-athlete')].map((e) => e.textContent!.trim());
    expect(athletes).toEqual(['Bruna Lima', 'Sem nome (…000001)']);
    expect(text).toContain('Enviada em 03/10/2026 09:00 · editada em 04/10/2026 09:30');
    expect(text).toContain('Premiação e kit 1★');
    expect(text).toContain('Premiação não foi entregue.');
    expect(text).toContain('Sem comentário.');
  });

  it('KPIs: média — abaixo de 3, contagem, resposta e janela', async () => {
    const host = await mount({
      getSummary: () => Promise.resolve(summary()),
      listReviews: () => Promise.resolve([review()]),
      profileNames: () => Promise.resolve(new Map()),
    });
    const kpis = [...host.querySelectorAll('bo-kpi-mini')].map((e) => e.textContent!.replace(/\s+/g, ' ').trim());
    expect(kpis[0]).toContain('—');
    expect(kpis[1]).toContain('2');
    expect(kpis[2]).toContain('2 de 42');
    expect(kpis[3]).toContain('Encerrada');
  });

  it('sem resumo nem avaliações: não encontrado, com volta para a lista', async () => {
    const host = await mount({
      getSummary: () => Promise.resolve(null),
      listReviews: () => Promise.resolve([]),
      profileNames: () => Promise.resolve(new Map()),
    });
    expect(textOf(host)).toContain('Este torneio não tem resumo de avaliação.');
    expect(host.querySelector('a[href="/painel/avaliacoes"]')).not.toBeNull();
  });

  it('com resumo e sem avaliações: diz que ninguém avaliou', async () => {
    const host = await mount({
      getSummary: () => Promise.resolve(summary({ count: 0 })),
      listReviews: () => Promise.resolve([]),
      profileNames: () => Promise.resolve(new Map()),
    });
    expect(textOf(host)).toContain('Nenhum atleta avaliou este torneio ainda.');
  });

  it('trocar de torneio descarta a resposta atrasada do anterior', async () => {
    let resolveOld!: (reviews: AdminReview[]) => void;
    const host = await mount({
      getSummary: (id: string) => Promise.resolve(summary({ tournamentId: id, tournamentName: id === 't1' ? 'Copa Aurora' : 'Etapa Setembro' })),
      listReviews: (id: string) =>
        id === 't1'
          ? new Promise<AdminReview[]>((resolve) => (resolveOld = resolve))
          : Promise.resolve([review({ id: 't2_athlete-uid-000009', uid: 'athlete-uid-000009', comment: 'Da etapa nova.' })]),
      profileNames: () => Promise.resolve(new Map()),
    });
    fixture.componentRef.setInput('id', 't2');
    fixture.detectChanges();
    await settle();
    resolveOld([review({ comment: 'Do torneio antigo.' })]);
    await settle();
    const text = textOf(host);
    expect(text).toContain('Da etapa nova.');
    expect(text).not.toContain('Do torneio antigo.');
    expect(host.querySelector('.bo-detail-header h1')!.textContent).toContain('Etapa Setembro');
  });

  it('sem permissão: mensagem clara', async () => {
    const host = await mount({
      getSummary: () => Promise.resolve(summary()),
      listReviews: () => Promise.reject({ code: 'permission-denied' }),
      profileNames: () => Promise.resolve(new Map()),
    });
    expect(host.querySelector('.bo-alert')!.textContent).toContain('A tela precisa do papel admin.');
  });
});
