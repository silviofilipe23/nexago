import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { AthleteSearchFieldComponent } from './athlete-search-field.component';

describe('AthleteSearchFieldComponent — atleta já selecionado', () => {
  let fixture: ComponentFixture<AthleteSearchFieldComponent>;

  function inputValue(): string {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input')!.value;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AthleteSearchFieldComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(AthleteSearchFieldComponent);
    fixture.componentRef.setInput('arenaId', 'arena-1');
  });

  it('sem atleta selecionado, o campo começa vazio', () => {
    fixture.detectChanges();
    expect(inputValue()).toBe('');
  });

  it('ao editar, o nome do atleta vinculado vem preenchido no campo', () => {
    fixture.componentRef.setInput('selectedName', 'Ana Souza');
    fixture.detectChanges();
    expect(inputValue()).toBe('Ana Souza');
  });

  it('o nome que chega depois (resolvido no perfil) substitui o rótulo provisório', () => {
    fixture.componentRef.setInput('selectedName', 'Atleta (…bqDmz1)');
    fixture.detectChanges();
    fixture.componentRef.setInput('selectedName', 'Ana Souza');
    fixture.detectChanges();
    expect(inputValue()).toBe('Ana Souza');
  });
});
