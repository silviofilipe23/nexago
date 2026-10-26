import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { FeeRule } from '../data/tournament-fees';
import { FeeDefaultCardComponent } from './fee-default-card.component';

describe('FeeDefaultCardComponent: quem paga', () => {
  async function mount(rule: FeeRule): Promise<ComponentFixture<FeeDefaultCardComponent>> {
    await TestBed.configureTestingModule({
      imports: [FeeDefaultCardComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(FeeDefaultCardComponent);
    fixture.componentRef.setInput('rule', rule);
    fixture.componentRef.setInput('canEdit', true);
    await fixture.whenStable();
    return fixture;
  }

  const text = (host: HTMLElement, selector: string) => host.querySelector(selector)!.textContent!.replace(/\s+/g, ' ').trim();

  const button = (host: HTMLElement, label: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === label)!;

  it('sem o campo gravado mostra o organizador pagando e o exemplo sem taxa para o atleta', async () => {
    const fixture = await mount({ percent: 8, floorReais: 1.5, payer: 'organizador' });
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Organizador');
    expect(text(host, '.example')).toContain('atleta paga R$ 100,00, organizador recebe R$ 92,00');
  });

  it('edita quem paga pelo seletor, atualiza o exemplo e salva a regra com o campo', async () => {
    const fixture = await mount({ percent: 8, floorReais: 1.5, payer: 'organizador' });
    const host = fixture.nativeElement as HTMLElement;
    const saved: FeeRule[] = [];
    fixture.componentInstance.save.subscribe((r) => saved.push(r));

    button(host, 'Editar padrão').click();
    await fixture.whenStable();
    expect(button(host, 'Salvar padrão').disabled).toBeTrue();

    button(host, 'Atleta').click();
    await fixture.whenStable();
    expect(text(host, '.example')).toContain('atleta paga R$ 108,00, organizador recebe R$ 100,00');

    button(host, 'Dividido').click();
    await fixture.whenStable();
    expect(text(host, '.example')).toContain('atleta paga R$ 104,00, organizador recebe R$ 96,00');

    button(host, 'Salvar padrão').click();
    expect(saved).toEqual([{ percent: 8, floorReais: 1.5, payer: 'dividido' }]);
  });
});
