import { Component, input, provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import type { ExternalPartnerInvite } from '../data/tournament-registrations-repository';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import { ExternalPartnerInvitePageComponent } from './external-partner-invite-page.component';

/** A casca do portal monta o menu e ouve convites — abriria WebChannel do Firestore no Karma. */
@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
}

interface Internals {
  invite: WritableSignal<ExternalPartnerInvite | null>;
}

const firebase = environment.firebase as { apiKey: string };

function external(overrides: Partial<ExternalPartnerInvite> = {}): ExternalPartnerInvite {
  return {
    id: 'ext-1',
    tournamentId: 't-1',
    categoryId: 'c-1',
    inviterUid: 'ana',
    inviterName: 'Ana',
    status: 'pending',
    expiresAt: new Date('2099-01-01T00:00:00Z'),
    claimedByUid: null,
    inviteId: null,
    ...overrides,
  };
}

describe('ExternalPartnerInvitePageComponent', () => {
  // Sem chave de Firebase o componente não abre listener — o convite é semeado à mão.
  let realApiKey = '';
  beforeEach(() => {
    realApiKey = firebase.apiKey;
    firebase.apiKey = '';
  });
  afterEach(() => {
    firebase.apiKey = realApiKey;
  });

  function render(inv: ExternalPartnerInvite | null, viewer = 'bia'): ComponentFixture<ExternalPartnerInvitePageComponent> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', component: PanelShellStubComponent }]),
        { provide: AuthService, useValue: { user: signal({ uid: viewer, displayName: 'Bia' }) } },
      ],
    }).overrideComponent(ExternalPartnerInvitePageComponent, {
      remove: { imports: [AtPanelShellComponent] },
      add: { imports: [PanelShellStubComponent] },
    });
    const fixture = TestBed.createComponent(ExternalPartnerInvitePageComponent);
    fixture.componentRef.setInput('externalInviteId', inv?.id ?? 'nao-existe');
    fixture.detectChanges();
    (fixture.componentInstance as unknown as Internals).invite.set(inv);
    fixture.detectChanges();
    return fixture;
  }

  function text(fixture: ComponentFixture<ExternalPartnerInvitePageComponent>, selector: string): string {
    const el = (fixture.nativeElement as HTMLElement).querySelector(selector);
    return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  it('convite aberto: quem chamou e "Entrar na dupla"', () => {
    const fixture = render(external());
    expect(text(fixture, '.cv-title')).toBe('Ana te chamou pra jogar');
    expect(text(fixture, '.cv-actions')).toContain('Entrar na dupla');
  });

  it('quem convidou abrindo o próprio link não vê o botão de resgate', () => {
    const fixture = render(external(), 'ana');
    expect(text(fixture, '.cv-title')).toBe('Este link é seu');
    expect((fixture.nativeElement as HTMLElement).querySelector('a.cv-btn')?.getAttribute('href')).toBe('/torneios/t-1');
  });

  it('cancelado, expirado e usado por outro dizem o motivo', () => {
    expect(text(render(external({ status: 'cancelled' })), '.cv-title')).toBe('Convite cancelado');
    TestBed.resetTestingModule();
    expect(text(render(external({ expiresAt: new Date('2000-01-01T00:00:00Z') })), '.cv-title')).toBe('Convite expirado');
    TestBed.resetTestingModule();
    expect(text(render(external({ status: 'claimed', claimedByUid: 'caio', inviteId: 'inv-9' })), '.cv-title')).toBe(
      'Convite já usado',
    );
  });

  it('já resgatado por mim segue direto para o convite de verdade', async () => {
    const fixture = render(external({ status: 'claimed', claimedByUid: 'bia', inviteId: 'inv-9' }));
    expect((fixture.nativeElement as HTMLElement).querySelector('.cv-card--skeleton')).not.toBeNull();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/torneios-convite/inv-9');
  });

  it('convite que não existe', () => {
    expect(text(render(null), '.cv-title')).toBe('Convite não encontrado');
  });
});
