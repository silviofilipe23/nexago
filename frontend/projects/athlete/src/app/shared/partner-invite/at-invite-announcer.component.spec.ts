import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { PartnerInvitesService, type PendingPartnerInvite } from '../../data/partner-invites.service';
import { TournamentRegistrationError } from '../../data/tournament-registrations-repository';
import type { TournamentPartnerInvite } from '../../data/tournament-registrations-repository';
import type { TournamentSummary } from '../../data/tournaments-repository';
import { NxBlockingDialogComponent, NxToastService } from '../feedback';
import { LgpdConsentDialogComponent } from '../lgpd/lgpd-consent-dialog.component';
import { AtInviteAnnouncerComponent } from './at-invite-announcer.component';
import { PartnerInviteResponder } from './partner-invite-responder';

const UID = 'atleta-1';

function item(id: string, overrides: Partial<TournamentPartnerInvite> = {}): PendingPartnerInvite {
  const invite: TournamentPartnerInvite = {
    id,
    tournamentId: `t-${id}`,
    categoryId: `c-${id}`,
    inviterUid: 'u1',
    inviterName: 'Bia',
    // Bem no passado: o anunciador só abre pro que já existia quando a sessão começou.
    createdAt: new Date(Date.now() - 600_000),
    expiresAt: null,
    isTeamInvite: false,
    teamName: null,
    teamSize: null,
    isSubstitutionInvite: false,
    replacedName: null,
    ...overrides,
  };
  return {
    invite,
    tournament: {
      id: invite.tournamentId,
      name: 'Copa VH',
      isCancelled: false,
      location: 'Arena CFC',
      city: 'Aparecida',
      startAt: new Date(2026, 5, 20, 8, 0),
      paymentMode: 'appPixCard',
      sport: 'beachVolleyball',
      categories: [{ id: invite.categoryId, categoryName: 'Masc. Intermediário', entryFee: 360, teamSize: null }],
    } as unknown as TournamentSummary,
  };
}

describe('AtInviteAnnouncerComponent', () => {
  let fixture: ComponentFixture<AtInviteAnnouncerComponent>;
  let pending: ReturnType<typeof signal<PendingPartnerInvite[]>>;
  let markAnswered: jasmine.Spy;
  let responder: jasmine.SpyObj<PartnerInviteResponder>;
  let navigate: jasmine.Spy;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function dialog(): HTMLElement | null {
    return host().querySelector('.invite-dialog');
  }

  function text(): string {
    return dialog()?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  async function click(act: 'accept' | 'decline' | 'later' | 'details'): Promise<void> {
    host().querySelector<HTMLButtonElement>(`[data-act="${act}"]`)!.click();
    await fixture.whenStable();
  }

  async function confirmLgpd(): Promise<void> {
    fixture.debugElement.query(By.directive(LgpdConsentDialogComponent)).componentInstance.confirmed.emit();
    await fixture.whenStable();
  }

  function levelDialog() {
    return fixture.debugElement.query(By.directive(NxBlockingDialogComponent));
  }

  async function confirmLevel(): Promise<void> {
    levelDialog().componentInstance.primary.emit();
    await fixture.whenStable();
  }

  async function adjustLevel(): Promise<void> {
    levelDialog().componentInstance.secondary.emit();
    await fixture.whenStable();
  }

  async function build(invites: PendingPartnerInvite[]): Promise<void> {
    pending.set(invites);
    fixture = TestBed.createComponent(AtInviteAnnouncerComponent);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    sessionStorage.clear();
    pending = signal<PendingPartnerInvite[]>([]);
    markAnswered = jasmine.createSpy('markAnswered');
    responder = jasmine.createSpyObj<PartnerInviteResponder>('PartnerInviteResponder', [
      'accept',
      'decline',
      'resolveLevelPrompt',
    ]);
    responder.accept.and.resolveTo();
    responder.decline.and.resolveTo();
    // Sem nada a confirmar por padrão — os specs de nível abaixo sobrescrevem por teste.
    responder.resolveLevelPrompt.and.resolveTo(null);

    await TestBed.configureTestingModule({
      imports: [AtInviteAnnouncerComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: PartnerInvitesService, useValue: { pending, markAnswered } },
        { provide: AuthService, useValue: { user: signal({ uid: UID }) } },
        { provide: PartnerInviteResponder, useValue: responder },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate').and.resolveTo(true) } },
      ],
    }).compileComponents();

    navigate = TestBed.inject(Router).navigate as jasmine.Spy;
  });

  afterEach(() => {
    fixture?.destroy();
    sessionStorage.clear();
  });

  it('não mostra nada quando não há convite pendente', async () => {
    await build([]);

    expect(dialog()).toBeNull();
  });

  it('anuncia o convite pendente ao entrar', async () => {
    await build([item('i1')]);

    expect(text()).toContain('Bia te chamou pra dupla');
    expect(text()).toContain('Falta só você aceitar');
  });

  it('mostra o quadro do torneio com o que o summary já trouxe', async () => {
    await build([item('i1')]);
    const facts = text();

    expect(facts).toContain('Masc. Intermediário');
    expect(facts).toContain('sáb · 20 jun · 08h');
    expect(facts).toContain('Arena CFC · Aparecida');
    // Cota, não o total da dupla: 360 / 2.
    expect(facts.replace(/ /g, ' ')).toContain('R$ 180');
  });

  it('sem prazo no convite não inventa contagem', async () => {
    await build([item('i1')]);

    expect(host().querySelector('.deadline')).toBeNull();
  });

  it('com prazo, conta o que resta e mede o decorrido', async () => {
    await build([
      item('i1', {
        createdAt: new Date(Date.now() - 2 * 3_600_000),
        // Um minuto de folga: o componente lê o relógio alguns ms depois daqui, e sem a
        // folga o Math.floor de "22 h menos 3 ms" vira 21.
        expiresAt: new Date(Date.now() + 22 * 3_600_000 + 60_000),
      }),
    ]);

    expect(text()).toContain('Restam 22 h pra responder');
    expect(host().querySelector('.deadline-bar')?.getAttribute('aria-valuenow')).toBe('8');
  });

  it('"Ver detalhes" leva pro torneio sem responder o convite', async () => {
    await build([item('i1')]);
    await click('details');

    expect(navigate).toHaveBeenCalledWith(['/torneios', 't-i1']);
    expect(markAnswered).not.toHaveBeenCalled();
    expect(responder.decline).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it('"Depois" fecha e não reabre nesta sessão', async () => {
    await build([item('i1')]);
    await click('later');

    expect(dialog()).toBeNull();
    // Convite segue pendente no store — some só do anúncio, não da lista.
    expect(markAnswered).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(`nexago-athlete-invite-announced:${UID}`)).toContain('i1');
  });

  it('com mais de um convite, adiar traz o próximo', async () => {
    await build([item('i1'), item('i2')]);
    expect(dialog()).not.toBeNull();

    await click('later');

    expect(dialog()).not.toBeNull();
    expect(text()).toContain('Copa VH');
    expect(sessionStorage.getItem(`nexago-athlete-invite-announced:${UID}`)).toContain('i1');
  });

  it('recusa pelo modal e tira o convite da lista', async () => {
    await build([item('i1')]);
    await click('decline');

    expect(responder.decline).toHaveBeenCalledWith('i1');
    expect(markAnswered).toHaveBeenCalledWith('i1');
    expect(dialog()).toBeNull();
  });

  it('aceitar pede o termo LGPD antes de chamar o backend', async () => {
    await build([item('i1')]);
    await click('accept');

    expect(responder.accept).not.toHaveBeenCalled();
    expect(fixture.debugElement.query(By.directive(LgpdConsentDialogComponent))).not.toBeNull();
  });

  it('confirmado o termo, aceita e leva pra inscrição', async () => {
    await build([item('i1')]);
    await click('accept');
    await confirmLgpd();

    expect(responder.accept).toHaveBeenCalledWith('i1');
    expect(markAnswered).toHaveBeenCalledWith('i1');
    expect(navigate).toHaveBeenCalledWith(['/torneios', 't-i1', 'inscricao'], {
      queryParams: { categoria: 'c-i1' },
    });
  });

  // Task 7 — confirmação de nível na 1ª inscrição do esporte, via `PartnerInviteResponder`
  // (a mesma costura injetável que já cobre aceite/recusa sem rede).
  it('esporte destravado: pede confirmação de nível antes de aceitar de verdade', async () => {
    responder.resolveLevelPrompt.and.resolveTo({ levelLabel: 'Iniciante 1', sportLabel: 'Vôlei de praia' });

    await build([item('i1')]);
    await click('accept');
    await confirmLgpd();

    // Fix pós-review (I1): o responder recebe o tournamentId (não um sport já resolvido) e
    // busca o torneio fresco — nunca o cache de `PartnerInvitesService.pending()`.
    expect(responder.resolveLevelPrompt).toHaveBeenCalledWith('t-i1');
    expect(responder.accept).not.toHaveBeenCalled();
    expect(levelDialog()).not.toBeNull();
    expect(levelDialog().componentInstance.heading()).toBe('Confirme seu nível');
    expect(levelDialog().componentInstance.body()).toBe(
      'Você vai se inscrever como Iniciante 1 em Vôlei de praia. Após a inscrição, o nível só poderá subir.',
    );

    await confirmLevel();

    expect(responder.accept).toHaveBeenCalledWith('i1');
    expect(markAnswered).toHaveBeenCalledWith('i1');
    expect(navigate).toHaveBeenCalledWith(['/torneios', 't-i1', 'inscricao'], {
      queryParams: { categoria: 'c-i1' },
    });
  });

  it('"Ajustar nível" não aceita o convite e navega pra /perfil/esportes', async () => {
    responder.resolveLevelPrompt.and.resolveTo({ levelLabel: 'Iniciante 1', sportLabel: 'Vôlei de praia' });

    await build([item('i1')]);
    await click('accept');
    await confirmLgpd();
    await adjustLevel();

    expect(responder.accept).not.toHaveBeenCalled();
    expect(markAnswered).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/perfil/esportes']);
    expect(dialog()).toBeNull();
    expect(levelDialog()).toBeNull();
  });

  it('esporte já travado: aceita direto, sem mostrar o dialog de nível', async () => {
    responder.resolveLevelPrompt.and.resolveTo(null);

    await build([item('i1')]);
    await click('accept');
    await confirmLgpd();

    expect(levelDialog()).toBeNull();
    expect(responder.accept).toHaveBeenCalledWith('i1');
  });

  // F6 (review pós-calibração de nível): o dialog de confirmação de nível é gated pelo MESMO
  // `@if (current(); as item)` do resto do modal — se o convite sob confirmação some de
  // `invites.pending()` (resolvido/retirado em outra aba) enquanto o dialog está aberto aqui,
  // o `@if` desmonta tudo sem que `confirmLevelPrompt`/`adjustLevelPrompt` jamais rodem, e o
  // `levelConfirmationResolve` da Promise pendente fica órfão. Sem o fix, `ensureLevelConfirmed`
  // trata QUALQUER resolver pendente como "confirmação em andamento" e o PRÓXIMO aceite da
  // sessão inteira (de um convite diferente) ficaria travado em `false` silencioso pra sempre.
  it('convite sob confirmação some (current() vira null) com o dialog de nível aberto: assenta o resolver órfão e não trava o próximo aceite', async () => {
    responder.resolveLevelPrompt.and.resolveTo({ levelLabel: 'Iniciante 1', sportLabel: 'Vôlei de praia' });

    await build([item('i1')]);
    await click('accept');
    await confirmLgpd();
    expect(levelDialog()).not.toBeNull();

    // i1 sai de `pending` (ex.: aceito/recusado em outra aba) enquanto o dialog de nível
    // segue aberto aqui — current() vira null e o `@if` externo desmonta tudo, inclusive o
    // dialog, sem que `confirmLevelPrompt`/`adjustLevelPrompt` jamais rodem.
    pending.set([]);
    await fixture.whenStable();
    expect(dialog()).toBeNull();
    expect(levelDialog()).toBeNull();

    // Convite NOVO chega depois. Sem o fix, o resolver órfão de i1 faz `ensureLevelConfirmed`
    // devolver `false` pra sempre — este aceite ficaria mudo (sem chamar accept, sem navegar).
    responder.resolveLevelPrompt.and.resolveTo(null);
    pending.set([item('i2')]);
    await fixture.whenStable();
    await click('accept');
    await confirmLgpd();

    expect(responder.accept).toHaveBeenCalledWith('i2');
    expect(markAnswered).toHaveBeenCalledWith('i2');
  });

  it('falha ao confirmar o nível: bloqueia, avisa e não aceita', async () => {
    const toastError = spyOn(TestBed.inject(NxToastService), 'error');
    responder.resolveLevelPrompt.and.rejectWith(new Error('fetch falhou'));

    await build([item('i1')]);
    await click('accept');
    await confirmLgpd();

    expect(responder.accept).not.toHaveBeenCalled();
    expect(levelDialog()).toBeNull();
    expect(toastError).toHaveBeenCalled();
  });

  it('cancelar o termo volta pro modal sem responder', async () => {
    await build([item('i1')]);
    await click('accept');
    fixture.debugElement.query(By.directive(LgpdConsentDialogComponent)).componentInstance.cancelled.emit();
    await fixture.whenStable();

    expect(responder.accept).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();
  });

  it('falha ao recusar mantém o convite na tela e avisa', async () => {
    const toastError = spyOn(TestBed.inject(NxToastService), 'error');
    responder.decline.and.rejectWith(new TournamentRegistrationError('O serviço não respondeu'));

    await build([item('i1')]);
    await click('decline');

    expect(markAnswered).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();
    expect(toastError).toHaveBeenCalled();
  });

  it('Esc adia, igual ao "Depois"', async () => {
    await build([item('i1')]);
    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(dialog()).toBeNull();
    expect(markAnswered).not.toHaveBeenCalled();
  });

  it('não anuncia convite que chegou depois da sessão começar', async () => {
    await build([]);

    pending.set([item('novo', { createdAt: new Date(Date.now() + 60_000) })]);
    await fixture.whenStable();

    expect(dialog()).toBeNull();
  });

  it('devolve a rolagem da página ao fechar', async () => {
    await build([item('i1')]);
    expect(document.body.style.overflow).toBe('hidden');

    await click('later');

    expect(document.body.style.overflow).toBe('');
  });

  it('mantém a rolagem travada enquanto o termo LGPD está aberto e depois de cancelá-lo', async () => {
    await build([item('i1')]);
    await click('accept');
    expect(document.body.style.overflow).toBe('hidden');

    fixture.debugElement.query(By.directive(LgpdConsentDialogComponent)).componentInstance.cancelled.emit();
    await fixture.whenStable();

    expect(document.body.style.overflow).toBe('hidden');
  });
});
