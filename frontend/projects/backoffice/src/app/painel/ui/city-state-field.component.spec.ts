import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrLocationsService } from '@nexago/br-locations';
import { CityStateFieldComponent } from './city-state-field.component';

/**
 * O combo é o único caminho para a cidade base do organizador. O que precisa
 * ficar travado: a cidade nunca fica solta de uma UF, e cadastro antigo com
 * grafia fora do IBGE não some do select — some do select é sumir do cadastro.
 */
describe('CityStateFieldComponent (combo UF → cidade)', () => {
  let fixture: ComponentFixture<CityStateFieldComponent>;

  async function setup(state = '', city = ''): Promise<void> {
    fixture = TestBed.createComponent(CityStateFieldComponent);
    fixture.componentRef.setInput('state', state);
    fixture.componentRef.setInput('city', city);
    await TestBed.inject(BrLocationsService).ready;
    await fixture.whenStable();
  }

  beforeEach(async () => {
    spyOn(globalThis, 'fetch').and.resolveTo({
      json: () => Promise.resolve({ GO: ['Goiânia', 'Anápolis'], PB: ['João Pessoa', 'Campina Grande'] }),
    } as Response);

    // O backoffice roda zoneless (app.config), então sem isto o TestBed dá NG0908.
    await TestBed.configureTestingModule({
      imports: [CityStateFieldComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  function selects(): HTMLSelectElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('select'));
  }

  function stateSelect(): HTMLSelectElement {
    return selects()[0]!;
  }

  function citySelect(): HTMLSelectElement {
    return selects()[1]!;
  }

  function cityOptions(): string[] {
    return Array.from(citySelect().options).map((o) => o.value);
  }

  it('sem UF, a cidade fica travada e diz o que falta', async () => {
    await setup();

    expect(citySelect().disabled).toBe(true);
    expect(citySelect().options[0]!.textContent?.trim()).toBe('Selecione a UF primeiro');
    // Só o placeholder: nenhuma cidade é oferecida antes da UF.
    expect(cityOptions()).toEqual(['']);
  });

  it('lista as 27 UFs com nome e sigla', async () => {
    await setup();

    const options = Array.from(stateSelect().options);
    expect(options.length).toBe(28); // 27 UFs + placeholder
    expect(options[1]!.textContent?.trim()).toBe('Acre (AC)');
  });

  it('com UF escolhida, oferece as cidades daquela UF', async () => {
    await setup('GO');

    expect(citySelect().disabled).toBe(false);
    expect(cityOptions()).toEqual(['', 'Goiânia', 'Anápolis']);
  });

  it('o cadastro já gravado aparece escolhido nos dois selects', async () => {
    await setup('PB', 'João Pessoa');

    expect(stateSelect().value).toBe('PB');
    expect(citySelect().value).toBe('João Pessoa');
  });

  it('trocar a UF limpa a cidade — cidade de outro estado seria dado errado', async () => {
    await setup('GO', 'Goiânia');
    const emitted: Array<[string, string]> = [];
    fixture.componentInstance.stateChange.subscribe((v) => emitted.push(['state', v]));
    fixture.componentInstance.cityChange.subscribe((v) => emitted.push(['city', v]));

    stateSelect().value = 'PB';
    stateSelect().dispatchEvent(new Event('change'));

    expect(emitted).toEqual([
      ['state', 'PB'],
      ['city', ''],
    ]);
  });

  it('reescolher a mesma UF não mexe na cidade', async () => {
    await setup('GO', 'Goiânia');
    const emitted: string[] = [];
    fixture.componentInstance.cityChange.subscribe((v) => emitted.push(v));

    stateSelect().value = 'GO';
    stateSelect().dispatchEvent(new Event('change'));

    expect(emitted).toEqual([]);
  });

  it('cidade fora da grafia do IBGE é preservada no topo da lista', async () => {
    await setup('GO', 'Goiania'); // sem acento, como veio de um cadastro digitado à mão

    expect(cityOptions()).toEqual(['', 'Goiania', 'Goiânia', 'Anápolis']);
    expect(citySelect().value).toBe('Goiania');
  });

  it('escolher a cidade emite só a cidade', async () => {
    await setup('GO');
    const emitted: string[] = [];
    fixture.componentInstance.cityChange.subscribe((v) => emitted.push(v));

    citySelect().value = 'Anápolis';
    citySelect().dispatchEvent(new Event('change'));

    expect(emitted).toEqual(['Anápolis']);
  });
});
