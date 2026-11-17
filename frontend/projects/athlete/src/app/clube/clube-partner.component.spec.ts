import { Component, input, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { AtPanelShellComponent } from '../painel/at-panel-shell.component';
import type { SandRankCode } from '../profile/sand-rank';
import { ClubePartnerComponent } from './clube-partner.component';
import { partnerFromDoc, type Partner } from './clube.logic';
import { CLUB_API, type ClubApi } from './data/clube-api';
import { ClubStore } from './data/clube.store';

/** A casca do portal monta o menu e ouve convites — abriria WebChannel do Firestore no Karma. */
@Component({ selector: 'app-at-panel-shell', template: '<ng-content />' })
class PanelShellStubComponent {
  readonly userName = input('Atleta');
}

const ARENA_SHOP = partnerFromDoc('arena-shop', {
  name: 'Arena Shop', category: 'sports', benefitHighlight: '5% OFF', benefitTitle: '5% em tudo', ctaType: 'link',
  link: 'https://shop.example.com', couponMode: 'fixed', couponCode: 'BASE5', active: true, audience: 'all',
  levelTiers: [
    { minRank: 'DESAFIANTE', benefitHighlight: '10% OFF', benefitTitle: '10% em tudo' },
    { minRank: 'MESTRE', benefitHighlight: '20% OFF', benefitTitle: '20% em tudo' },
  ],
})!;
const PLAIN = partnerFromDoc('plain', {
  name: 'Fast Açaí', category: 'food', benefitHighlight: '10% OFF', benefitTitle: '10% de desconto', ctaType: 'link',
  link: 'https://fast.example.com', couponMode: 'fixed', couponCode: 'NEXAGO10', active: true, audience: 'all',
})!;

/**
 * A página do parceiro com o store REAL (só a porta do Firebase é de mentira): a escada "Desconto
 * por elo" aparece só com faixas e marca a do atleta; o cupom de quem tem faixa sai da callable.
 */
describe('ClubePartnerComponent — desconto por elo', () => {
  let api: jasmine.SpyObj<ClubApi>;

  async function render(partner: Partner, sandRank: SandRankCode): Promise<HTMLElement> {
    api = jasmine.createSpyObj<ClubApi>('ClubApi', ['fetchConfig', 'fetchPartners', 'fetchProfile', 'track', 'submitLead', 'claimBenefit']);
    api.fetchConfig.and.resolveTo({ enabled: true, testerUids: [] });
    api.fetchPartners.and.resolveTo([partner]);
    api.fetchProfile.and.resolveTo({ name: 'Ana', whatsapp: '', city: null, sandRank });
    api.track.and.resolveTo();
    api.claimBenefit.and.resolveTo('ELITE10');
    const paramMap = convertToParamMap({ partnerId: partner.id });
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        ClubStore,
        { provide: CLUB_API, useValue: api },
        { provide: AuthService, useValue: { user: signal({ uid: 'u1', displayName: 'Ana', email: null }) } },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(paramMap), snapshot: { paramMap, queryParamMap: convertToParamMap({}) } },
        },
      ],
    }).overrideComponent(ClubePartnerComponent, {
      remove: { imports: [AtPanelShellComponent] },
      add: { imports: [PanelShellStubComponent] },
    });
    const fixture = TestBed.createComponent(ClubePartnerComponent);
    await fixture.whenStable();
    // A vitrine e o claim são promises fora do Angular: deixa assentar e renderiza de novo.
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const rows = (host: HTMLElement): string[] =>
    Array.from(host.querySelectorAll('.cp-tier')).map((li) =>
      Array.from(li.querySelectorAll('span'))
        .map((span) => span.textContent!.trim())
        .filter(Boolean)
        .join(' | '),
    );

  it('lista a base e as faixas e marca a do atleta como "Seu desconto"', async () => {
    const host = await render(ARENA_SHOP, 'ELITE');
    expect(host.textContent).toContain('Desconto por elo');
    expect(rows(host)).toEqual(['Iniciante | 5% OFF', 'Desafiante | Seu desconto | 10% OFF', 'Mestre | 20% OFF']);
    const current = host.querySelectorAll('.cp-tier--current');
    expect(current.length).toBe(1);
    expect(current[0]!.getAttribute('aria-current')).toBe('true');
    // O selo do benefício já é o da faixa.
    expect(host.querySelector('.cp-big')?.textContent?.trim()).toBe('10% OFF');
  });

  it('sem elo que alcance faixa, a linha-base é a marcada', async () => {
    const host = await render(ARENA_SHOP, 'INICIANTE');
    expect(host.querySelector('.cp-tier--current')?.textContent).toContain('Iniciante');
    expect(host.querySelector('.cp-big')?.textContent?.trim()).toBe('5% OFF');
  });

  it('cupom de quem tem faixa sai da claimBenefit, nunca do doc público', async () => {
    const host = await render(ARENA_SHOP, 'ELITE');
    expect(api.claimBenefit).toHaveBeenCalledOnceWith('arena-shop', 'deeplink');
    expect(host.querySelector('.cp-code-value')?.textContent?.trim()).toBe('ELITE10');
    expect(host.textContent).not.toContain('BASE5');
  });

  it('parceiro sem faixas: sem a seção e sem claim', async () => {
    const host = await render(PLAIN, 'LENDA');
    expect(host.querySelector('.cp-tiers')).toBeNull();
    expect(api.claimBenefit).not.toHaveBeenCalled();
    expect(host.querySelector('.cp-code-value')?.textContent?.trim()).toBe('NEXAGO10');
  });
});
