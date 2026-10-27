import { Component, input, provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import type { PartnerInviteOnLink } from '../data/tournament-registrations-repository';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { PartnerInviteFocus } from '../shared/partner-invite/partner-invite-focus';
import { PartnerInvitePageComponent } from './partner-invite-page.component';

/** A casca do portal monta o menu e ouve convites — abriria WebChannel do Firestore no Karma. */
@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
}

interface Internals {
  invite: WritableSignal<PartnerInviteOnLink | null>;
}

const firebase = environment.firebase as { apiKey: string };

function onLink(overrides: Partial<PartnerInviteOnLink> = {}): PartnerInviteOnLink {
  return {
    id: 'inv-1',
    inviteeUid: 'bia',
    inviteeName: 'Bia',
    expiresAt: null,
    createdAt: null,
    tournamentId: 't-1',
    categoryId: 'c-1',
    status: 'pending',
    registrationId: null,
    isTeamInvite: false,
    teamName: null,
    isSubstitutionInvite: false,
    replacedName: null,
    attachRegistrationId: null,
    inviterUid: 'ana',
    inviterName: 'Ana',
    ...overrides,
  };
}

describe('PartnerInvitePageComponent', () => {
  // Sem chave de Firebase o componente não abre listener — o convite é semeado à mão.
  let realApiKey = '';
  beforeEach(() => {
    realApiKey = firebase.apiKey;
    firebase.apiKey = '';
  });
  afterEach(() => {
    firebase.apiKey = realApiKey;
  });

  function render(inv: PartnerInviteOnLink | null, viewer = 'bia'): ComponentFixture<PartnerInvitePageComponent> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { user: signal({ uid: viewer, displayName: 'Bia', email: 'bia@exemplo.com' }) } },
      ],
    }).overrideComponent(PartnerInvitePageComponent, {
      remove: { imports: [AtPanelShellComponent] },
      add: { imports: [PanelShellStubComponent] },
    });
    const fixture = TestBed.createComponent(PartnerInvitePageComponent);
    fixture.componentRef.setInput('inviteId', inv?.id ?? 'nao-existe');
    fixture.detectChanges();
    (fixture.componentInstance as unknown as Internals).invite.set(inv);
    fixture.detectChanges();
    return fixture;
  }

  function text(fixture: ComponentFixture<PartnerInvitePageComponent>, selector: string): string {
    const el = (fixture.nativeElement as HTMLElement).querySelector(selector);
    return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  it('convite pendente para mim abre o modal de resposta sozinho, uma vez', () => {
    const fixture = render(onLink());
    const focus = TestBed.inject(PartnerInviteFocus);
    expect(text(fixture, '.cv-title')).toBe('Ana te chamou pra dupla');
    expect(focus.inviteId()).toBe('inv-1');

    // "Ver depois" no modal solta o pedido; a página não reabre sozinha, só pelo botão.
    focus.release('inv-1');
    fixture.detectChanges();
    expect(focus.inviteId()).toBeNull();
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button.cv-btn--primary')!.click();
    expect(focus.inviteId()).toBe('inv-1');
  });

  it('sair da página solta o pedido do modal', () => {
    const fixture = render(onLink());
    fixture.destroy();
    expect(TestBed.inject(PartnerInviteFocus).inviteId()).toBeNull();
  });

  it('convite de equipe nomeada fala da equipe', () => {
    const fixture = render(onLink({ isTeamInvite: true, teamName: 'Areia Quente' }));
    expect(text(fixture, '.cv-title')).toBe('Ana te chamou pra equipe Areia Quente');
  });

  it('aceito leva para a inscrição da categoria', () => {
    const fixture = render(onLink({ status: 'accepted' }));
    expect(text(fixture, '.cv-title')).toBe('Convite aceito');
    expect((fixture.nativeElement as HTMLElement).querySelector('a.cv-btn')?.getAttribute('href')).toBe(
      '/torneios/t-1/inscricao?categoria=c-1',
    );
    expect(TestBed.inject(PartnerInviteFocus).inviteId()).toBeNull();
  });

  it('quem convidou vê a espera, sem modal', () => {
    const fixture = render(onLink(), 'ana');
    expect(text(fixture, '.cv-title')).toBe('Este convite é seu');
    expect(text(fixture, '.cv-subtitle')).toBe('Esperando Bia responder.');
    expect(TestBed.inject(PartnerInviteFocus).inviteId()).toBeNull();
  });

  it('recusado e expirado dizem o desfecho', () => {
    expect(text(render(onLink({ status: 'declined' })), '.cv-title')).toBe('Convite recusado');
    TestBed.resetTestingModule();
    expect(text(render(onLink({ status: 'expired' })), '.cv-title')).toBe('Convite expirado');
  });

  // As rules só liberam os dois lados: convite de outra conta chega como erro, igual ao que não existe.
  it('indisponível diz com qual conta o atleta entrou', () => {
    const fixture = render(null);
    expect(text(fixture, '.cv-title')).toBe('Convite indisponível');
    expect(text(fixture, '.cv-subtitle')).toContain('Você entrou como bia@exemplo.com.');
  });
});
