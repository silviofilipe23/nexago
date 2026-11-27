import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GroupsKnockoutSummaryComponent, type GroupFormatChoice } from './groups-knockout-summary.component';

describe('GroupsKnockoutSummaryComponent', () => {
  let fixture: ComponentFixture<GroupsKnockoutSummaryComponent>;

  async function mount(inputs: { teams: number; groupCount: number; qualifiersPerGroup: number; courts?: number; matchDurationMin?: number }): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [GroupsKnockoutSummaryComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(GroupsKnockoutSummaryComponent);
    fixture.componentRef.setInput('teams', inputs.teams);
    fixture.componentRef.setInput('groupCount', inputs.groupCount);
    fixture.componentRef.setInput('qualifiersPerGroup', inputs.qualifiersPerGroup);
    fixture.componentRef.setInput('courts', inputs.courts ?? 4);
    fixture.componentRef.setInput('matchDurationMin', inputs.matchDurationMin ?? 30);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function text(el: HTMLElement, selector: string): string {
    return (el.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  /** Texto de cada linha juntando as células com espaço — o Angular remove o
   *  espaço entre elementos irmãos, então `textContent` cola tudo. */
  function rows(el: HTMLElement, selector: string): string[] {
    return Array.from(el.querySelectorAll(selector)).map((row) =>
      Array.from(row.children).map((cell) => (cell.textContent ?? '').trim()).join(' '),
    );
  }

  it('16 duplas em 4 grupos × 2: mostra jogos de cada fase e o total', async () => {
    const el = await mount({ teams: 16, groupCount: 4, qualifiersPerGroup: 2 });
    expect(text(el, '[data-block="groups"]')).toContain('24 jogos');
    expect(text(el, '[data-block="groups"]')).toContain('4 grupos de 4');
    expect(text(el, '[data-block="groups"]')).toContain('6 jogos por grupo');
    expect(text(el, '[data-block="knockout"]')).toContain('8 jogos');
    expect(text(el, '[data-block="knockout"]')).toContain('8 classificados');
    expect(text(el, '[data-block="total"]')).toContain('32 jogos');
    expect(text(el, '[data-block="total"]')).toContain('de 3 a 6 partidas');
    expect(text(el, '[data-block="total"]')).toContain('8 duplas saem na fase de grupos');
  });

  it('lista as fases do mata-mata em ordem, com o 3º lugar', async () => {
    const el = await mount({ teams: 16, groupCount: 4, qualifiersPerGroup: 2 });
    expect(rows(el, '.og-gk-phase')).toEqual(['Quartas 4 jogos', 'Semifinais 2 jogos', 'Final 1 jogo', '3º lugar 1 jogo']);
  });

  it('estima a duração com as quadras e a duração de partida do torneio', async () => {
    const el = await mount({ teams: 16, groupCount: 4, qualifiersPerGroup: 2, courts: 4, matchDurationMin: 30 });
    expect(text(el, '[data-block="total"]')).toContain('4h com 4 quadras');
  });

  it('grupos desiguais: mostra os jogos de cada tamanho de grupo', async () => {
    const el = await mount({ teams: 10, groupCount: 3, qualifiersPerGroup: 2 });
    expect(text(el, '[data-block="groups"]')).toContain('1 grupo de 4 e 2 de 3');
    expect(text(el, '[data-block="groups"]')).toContain('6 jogos no grupo de 4');
    expect(text(el, '[data-block="groups"]')).toContain('3 no de 3');
  });

  it('3 grupos: explica as folgas e quem as recebe', async () => {
    const el = await mount({ teams: 10, groupCount: 3, qualifiersPerGroup: 2 });
    expect(rows(el, '.og-gk-phase')[0]).toBe('Quartas 2 jogos + 2 folgas');
    expect(text(el, '[data-block="knockout"]')).toContain('os 2 melhores 1ºs colocados');
    expect(el.querySelector('.og-gk-error')).toBeNull();
  });

  it('chave por campanha: avisa que reencontro de grupo é desfeito por troca de vaga', async () => {
    const el = await mount({ teams: 10, groupCount: 3, qualifiersPerGroup: 2 });
    expect(text(el, '[data-note="rematch"]')).toContain('duplas da mesma colocação trocam de vaga');
  });

  it('cruzamento fixo e grupo único não têm o aviso de troca de vaga', async () => {
    const fixed = await mount({ teams: 16, groupCount: 4, qualifiersPerGroup: 2 });
    expect(fixed.querySelector('[data-note="rematch"]')).toBeNull();
    TestBed.resetTestingModule();
    const single = await mount({ teams: 5, groupCount: 1, qualifiersPerGroup: 3 });
    expect(single.querySelector('[data-note="rematch"]')).toBeNull();
  });

  it('mostra os confrontos da 1ª fase, com a folga marcada', async () => {
    const el = await mount({ teams: 10, groupCount: 3, qualifiersPerGroup: 2 });
    expect(rows(el, '.og-gk-pairing')).toEqual(['1º · melhor campanha folga', '2º · melhor campanha × 2º · 2ª melhor campanha', '1º · 2ª melhor campanha folga', '1º · 3ª melhor campanha × 2º · 3ª melhor campanha']);
  });

  it('grupo único × 3: fala do próprio grupo, não de comparação entre grupos', async () => {
    const el = await mount({ teams: 5, groupCount: 1, qualifiersPerGroup: 3 });
    expect(text(el, '[data-block="knockout"]')).toContain('Folga na 1ª fase para o 1º colocado do grupo.');
    expect(rows(el, '.og-gk-pairing')).toEqual(['1º Grupo A folga', '2º Grupo A × 3º Grupo A']);
  });

  it('cruzamento fixo quando o total é potência de 2', async () => {
    const el = await mount({ teams: 16, groupCount: 4, qualifiersPerGroup: 2 });
    const pairings = rows(el, '.og-gk-pairing');
    expect(pairings[0]).toBe('1º Grupo A × 2º Grupo D');
    expect(pairings.length).toBe(4);
  });

  it('marca a sugestão que está em uso e emite a escolhida', async () => {
    const el = await mount({ teams: 16, groupCount: 4, qualifiersPerGroup: 2 });
    const options = Array.from(el.querySelectorAll<HTMLButtonElement>('.og-gk-option'));
    expect(options.length).toBeGreaterThan(1);
    expect(options.filter((o) => o.classList.contains('active')).length).toBe(1);
    expect(options[0]!.classList.contains('active')).toBeTrue();

    const chosen: GroupFormatChoice[] = [];
    fixture.componentInstance.formatChosen.subscribe((c) => chosen.push(c));
    const other = options.find((o) => !o.classList.contains('active'))!;
    other.click();
    expect(chosen.length).toBe(1);
    expect(chosen[0]!.groupCount * chosen[0]!.qualifiersPerGroup).toBeGreaterThanOrEqual(2);
  });

  it('formato inválido: diz o motivo, oferece o mais próximo e esconde as contas', async () => {
    const el = await mount({ teams: 6, groupCount: 1, qualifiersPerGroup: 1 });
    expect(text(el, '.og-gk-error')).toContain('1 classificado não forma um mata-mata');
    expect(el.querySelector('[data-block="total"]')).toBeNull();

    const chosen: GroupFormatChoice[] = [];
    fixture.componentInstance.formatChosen.subscribe((c) => chosen.push(c));
    const fix = el.querySelector<HTMLButtonElement>('.og-gk-fix')!;
    expect(fix.textContent).toContain('1 grupo × 2 classificados');
    fix.click();
    expect(chosen).toEqual([{ groupCount: 1, qualifiersPerGroup: 2 }]);
  });

  it('sem duração de partida configurada não inventa estimativa', async () => {
    const el = await mount({ teams: 16, groupCount: 4, qualifiersPerGroup: 2, matchDurationMin: 0 });
    expect(text(el, '[data-block="total"]')).not.toContain('quadra');
  });
});
