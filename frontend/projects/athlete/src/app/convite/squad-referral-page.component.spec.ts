import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { SQUAD_REFERRAL_LOOKUP, type SquadReferralLookup } from './squad-referral';
import { SquadReferralPageComponent } from './squad-referral-page.component';

const FOUND: SquadReferralLookup = {
  kind: 'found',
  referral: {
    ambassador: { uid: 'amb1', name: 'Silvio Dionizio', photoUrl: null, tier: 'ath', place: 'Goiânia, GO' },
    discountPct: 10,
    firstOnly: true,
    scope: { registration: true, booking: true, club: true },
  },
};

async function render(opts: { uid: string | null; lookup: SquadReferralLookup }): Promise<{ text: string; el: HTMLElement; codes: string[] }> {
  const codes: string[] = [];
  TestBed.configureTestingModule({
    imports: [SquadReferralPageComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ squad: 'silvio10' }) } } },
      {
        provide: AuthService,
        useValue: {
          authReady: signal(true),
          isAuthenticated: signal(opts.uid !== null),
          user: signal(opts.uid ? { uid: opts.uid } : null),
        },
      },
      {
        provide: SQUAD_REFERRAL_LOOKUP,
        useValue: (code: string) => {
          codes.push(code);
          return Promise.resolve(opts.lookup);
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(SquadReferralPageComponent);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return { text: el.textContent ?? '', el, codes };
}

function links(el: HTMLElement): Record<string, string | null> {
  return Object.fromEntries(
    Array.from(el.querySelectorAll<HTMLAnchorElement>('.ref-actions a')).map((a) => [a.textContent!.trim(), a.getAttribute('href')]),
  );
}

describe('SquadReferralPageComponent', () => {
  it('visitante vê quem convidou, o código, o desconto e o caminho para criar a conta', async () => {
    const { text, el, codes } = await render({ uid: null, lookup: FOUND });
    expect(codes).toEqual(['SILVIO10']);
    expect(text).toContain('Silvio Dionizio te deu desconto no nexaGO');
    expect(el.querySelector('.ref-code-value')?.textContent).toBe('SILVIO10');
    expect(text).toContain('Até 10% OFF na primeira inscrição, reserva e clubinho');
    expect(text).toContain('Goiânia, GO');
    expect(el.querySelector('.ref-avatar--initials')?.textContent).toBe('SD');
    expect(links(el)).toEqual({ 'Criar conta grátis': '/cadastro', 'Já tenho conta': '/entrar' });
  });

  it('o embaixador abrindo o próprio link vai para o Squad dele', async () => {
    const { text, el } = await render({ uid: 'amb1', lookup: FOUND });
    expect(text).toContain('Este é o seu link de embaixador');
    expect(links(el)).toEqual({ 'Abrir meu Squad': '/squad', 'Ir para o início': '/painel' });
  });

  it('quem já tem conta segue para os torneios', async () => {
    const { el } = await render({ uid: 'outro', lookup: FOUND });
    expect(links(el)).toEqual({ 'Ver torneios': '/torneios', 'Ir para o início': '/painel' });
    expect(el.querySelector('.nx-fine')).toBeNull();
  });

  it('código inativo: avisa, não promete desconto e ainda deixa criar a conta', async () => {
    const { text, el } = await render({ uid: null, lookup: { kind: 'inactive' } });
    expect(text).toContain('Este código não está ativo');
    expect(el.querySelector('.ref-offer')).toBeNull();
    expect(el.querySelector('.ref-code--off')).not.toBeNull();
    expect(links(el)['Criar conta grátis']).toBe('/cadastro');
  });
});
