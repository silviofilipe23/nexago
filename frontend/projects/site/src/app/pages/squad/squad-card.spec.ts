import { provideZonelessChangeDetection, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { SquadAmbassador } from '../../../lib/squad';
import { SquadCaptainCard, SquadCard } from './squad-card';

const JOAO: SquadAmbassador = {
  id: 'joao',
  name: 'João Victor',
  photoUrl: null,
  tier: 'amb',
  code: 'JOAO10',
  city: 'Goiânia',
  state: 'GO',
  arenaName: 'Arena Errejota',
  sport: 'beachTennis',
  elo: 'Elite II',
  eloIndex: 10,
  tournaments: 12,
};

function render<T>(component: Type<T>, ambassador: SquadAmbassador): HTMLElement {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(component);
  fixture.componentRef.setInput('ambassador', ambassador);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('SquadCard', () => {
  it('mostra nível, local, dados esportivos e o código com o link do portal', () => {
    const el = render(SquadCard, JOAO);
    const text = el.textContent ?? '';
    expect(text).toContain('João Victor');
    expect(text).toContain('Ambassador');
    expect(text).toContain('Goiânia · Arena Errejota');
    expect(text).toContain('Elite II');
    expect(text).toContain('12');
    expect(text).toContain('JOAO10');
    const link = el.querySelector<HTMLAnchorElement>('a[href*="squad="]');
    expect(link?.href).toBe('https://atleta.nexago.com.br/?squad=JOAO10');
  });

  it('não promete % nem mostra número de dinheiro', () => {
    const text = render(SquadCard, JOAO).textContent ?? '';
    expect(text).not.toMatch(/%|R\$|comiss|score|roi/i);
  });

  it('sem Elo e torneios (perfil privado) some a linha de números; sem foto mostra as iniciais', () => {
    const el = render(SquadCard, { ...JOAO, elo: null, eloIndex: null, tournaments: null, sport: null });
    expect(el.querySelector('dl')).toBeNull();
    expect(el.textContent).toContain('JV');
  });
});

describe('SquadCaptainCard', () => {
  it('"Entrar na turma" usa o link do código do Captain', () => {
    const el = render(SquadCaptainCard, { ...JOAO, tier: 'cap', code: 'MARCOS10', name: 'Marcos Reis', tournaments: 1 });
    const link = el.querySelector<HTMLAnchorElement>('a');
    expect(link?.href).toBe('https://atleta.nexago.com.br/?squad=MARCOS10');
    expect(el.textContent).toContain('Captain');
    expect(el.textContent).toContain('1 torneio');
    expect(el.textContent).not.toContain('1 torneios');
  });
});
