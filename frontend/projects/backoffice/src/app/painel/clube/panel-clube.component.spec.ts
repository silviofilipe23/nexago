import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { clubConfigFromDoc } from './data/club-config';
import { ClubRepository } from './data/club.repository';
import { partnerFromDoc, type PartnerPayload } from './data/partner';
import { leadFromDoc } from './data/partner-lead';
import { redemptionFromDoc } from './data/benefit-redemption';
import { PanelClubeComponent, clubTabFrom } from './panel-clube.component';

const LINQ = partnerFromDoc('linq', {
  name: 'LinQ Telecom',
  category: 'services',
  benefitHighlight: 'GRÁTIS',
  benefitTitle: 'Instalação grátis',
  ctaType: 'lead_form',
  ctaLabel: 'Quero contratar',
  couponMode: 'none',
  brandColor: '#0F62FE',
  isMasterSponsor: true,
  priority: 100,
  active: true,
  audience: 'testers',
});
/** Como o seed deixa a Fast sem `--fast-link`: desligada e sem link. */
const FAST = partnerFromDoc('fast-acai', {
  name: 'Fast Açaí',
  category: 'food',
  benefitHighlight: '10% OFF',
  benefitTitle: '10% de desconto em todo pedido',
  ctaType: 'link',
  ctaLabel: 'Pedir com 10% off',
  link: null,
  couponMode: 'fixed',
  couponCode: 'NEXAGO10',
  brandColor: '#5E1E7A',
  priority: 50,
  active: false,
  audience: 'all',
});

describe('PanelClubeComponent', () => {
  let update: jasmine.Spy<(id: string, payload: PartnerPayload) => Promise<void>>;
  let saveConfig: jasmine.Spy;
  let importSpy: jasmine.Spy;

  async function mount(aba: string | null = null): Promise<HTMLElement> {
    update = jasmine.createSpy('updatePartner').and.resolveTo();
    saveConfig = jasmine.createSpy('saveConfig').and.resolveTo();
    importSpy = jasmine.createSpy('importRedemptions').and.resolveTo({ matched: 1, ambiguous: 0, unmatched: 1, duplicates: 0 });
    const query = convertToParamMap(aba ? { aba } : {});
    await TestBed.configureTestingModule({
      imports: [PanelClubeComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: { displayName: signal('Ana Souza'), user: signal(null) } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: query }, queryParamMap: of(query) } },
        {
          provide: ClubRepository,
          useValue: {
            partners: () => Promise.resolve([FAST, LINQ]),
            leads: () =>
              Promise.resolve([
                leadFromDoc('linq_u1', { partnerId: 'linq', partnerName: 'LinQ Telecom', name: 'Ana', whatsapp: '5562982406456', cep: '74230010' }),
              ]),
            config: () => Promise.resolve(clubConfigFromDoc({ enabled: false, testerUids: ['u1'] })),
            userNames: () => Promise.resolve(new Map([['u1', 'Silvio Dionizio']])),
            events: () => Promise.resolve([]),
            updatePartner: update,
            saveConfig: saveConfig,
            redemptions: () =>
              Promise.resolve([
                redemptionFromDoc('linq_P-1', { partnerId: 'linq', externalId: 'P-1', code: 'NEXA-AB12', uid: 'u1', status: 'matched', discountCents: 829, redeemedAt: new Date(2026, 10, 10) }),
              ]),
            importRedemptions: importSpy,
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PanelClubeComponent);
    fixture.detectChanges();
    await settle();
    return fixture.nativeElement as HTMLElement;
  }

  async function settle() {
    await new Promise((r) => setTimeout(r));
    await TestBed.inject(ApplicationRef).whenStable();
  }

  const names = (host: HTMLElement) => [...host.querySelectorAll('bo-partners-table .name')].map((e) => e.textContent!.trim());

  it('aba vem de ?aba=; desconhecida volta para Parceiros', () => {
    expect(clubTabFrom(null)).toBe('parceiros');
    expect(clubTabFrom('leads')).toBe('leads');
    expect(clubTabFrom('xyz')).toBe('parceiros');
  });

  it('Parceiros: flag, quem testa pelo nome, tabela por prioridade e o contador de leads na aba', async () => {
    const host = await mount();
    expect(host.textContent).toContain('Card no Hub para todos os atletas');
    expect(host.querySelector('bo-club-config-card .chip')!.textContent!.trim()).toBe('Silvio D.');
    expect(names(host)).toEqual(['LinQ Telecom', 'Fast Açaí']);
    const linqRow = host.querySelector('bo-partners-table tbody tr')!;
    expect(linqRow.textContent).toContain('Patrocinador oficial');
    expect(linqRow.textContent).toContain('Formulário');
    expect(linqRow.textContent).toContain('Só quem testa');
    expect(host.querySelectorAll('bo-partners-table tbody tr')[1]!.textContent).toContain('Link + cupom NEXAGO10');
    const leadsTab = [...host.querySelectorAll('.tabs button')].find((b) => b.textContent!.includes('Leads'))!;
    expect(leadsTab.querySelector('.count')!.textContent!.trim()).toBe('1');
    expect(host.textContent).toContain('Parceiro novo aparece no app na hora');
  });

  it('ligar parceiro incompleto explica o que falta e não grava; desligar grava o doc inteiro', async () => {
    const host = await mount();
    const toggles = host.querySelectorAll<HTMLButtonElement>('bo-partners-table bo-toggle button');

    toggles[1]!.click(); // Fast, sem link
    await settle();
    expect(update).not.toHaveBeenCalled();
    expect(host.querySelector('.bo-alert')!.textContent).toContain('Fast Açaí: Informe o link (https://) para ativar o parceiro.');

    toggles[0]!.click(); // LinQ, desligar
    await settle();
    expect(update).toHaveBeenCalledTimes(1);
    const [id, payload] = update.calls.mostRecent().args;
    expect(id).toBe('linq');
    expect(payload.active).toBeFalse();
    expect(payload.isMasterSponsor).toBeTrue();
    // 21 campos da v1 + 10 da versão premium (allowlist da rule, sem autoria).
    expect(Object.keys(payload).length).toBe(31);
    expect(host.querySelector('.bo-feedback')!.textContent).toContain('LinQ Telecom saiu do clube.');
  });

  it('Leads: tabela com WhatsApp e CEP formatados e a nota de LGPD', async () => {
    const host = await mount('leads');
    const row = host.querySelector('bo-club-leads tbody tr')!;
    expect(row.textContent).toContain('(62) 98240-6456');
    expect(row.textContent).toContain('74230-010');
    expect(row.querySelector('a')!.getAttribute('href')).toBe('https://wa.me/5562982406456');
    expect(host.textContent).toContain('Cada lead guarda o texto do consentimento aceito e a data');
  });

  it('Métricas: KPIs zerados sem evento e o parceiro ativo na tabela', async () => {
    const host = await mount('metricas');
    const values = [...host.querySelectorAll('bo-kpi-card .value')].map((v) => v.textContent!.trim());
    expect(values).toEqual(['0', '0', '0', '0', '0']);
    const rows = [...host.querySelectorAll('bo-club-metrics tbody tr')].map((r) => r.querySelector('.name')!.textContent!.trim());
    expect(rows).toEqual(['LinQ Telecom']);
  });

  it('modo patrocinador: só parceiros ativos; escolher grava a config inteira', async () => {
    const host = await mount();
    const select = host.querySelector<HTMLSelectElement>('#cfg-sponsor')!;
    const options = [...select.options].map((o) => o.textContent!.trim());
    expect(options).toEqual(['Nenhum (card normal)', 'LinQ Telecom']);
    select.value = 'linq';
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(saveConfig).toHaveBeenCalledWith(false, ['u1'], 'linq');
  });

  it('Resgates: prévia com erro por linha, importa só as válidas e mostra o resultado', async () => {
    const host = await mount('resgates');
    expect(host.querySelector('bo-club-redemptions tbody')!.textContent).toContain('NEXA-AB12');
    expect(host.textContent).toContain('atribuídos ao código do atleta');

    const partner = host.querySelector<HTMLSelectElement>('bo-club-redemptions select')!;
    partner.value = 'linq';
    partner.dispatchEvent(new Event('change'));
    const area = host.querySelector<HTMLTextAreaElement>('bo-club-redemptions textarea')!;
    area.value = 'codigo;pedido;data;desconto\nNEXA-AB12;P-9;10/11/2026;8,29\nNEXA-CD34;P-10;ontem;5';
    area.dispatchEvent(new Event('input'));
    await settle();
    expect(host.querySelector('bo-club-redemptions .errors')!.textContent).toContain('Linha 3');

    const importButton = [...host.querySelectorAll<HTMLButtonElement>('bo-club-redemptions button')].find((b) =>
      b.textContent!.includes('Importar'),
    )!;
    expect(importButton.textContent).toContain('Importar 1 resgate');
    importButton.click();
    await settle();
    expect(importSpy).toHaveBeenCalledTimes(1);
    const [partnerId, rows] = importSpy.calls.mostRecent().args;
    expect(partnerId).toBe('linq');
    expect(rows.map((r: { externalId: string }) => r.externalId)).toEqual(['P-9']);
    expect(host.querySelector('bo-club-redemptions .results')!.textContent).toContain('confirmados');
  });
});
