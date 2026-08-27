import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { STORAGE_KEY } from '../../../lib/follow-storage';
import { FollowButtonComponent } from './follow-button';

describe('FollowButtonComponent', () => {
  afterEach(() => localStorage.removeItem(STORAGE_KEY));

  async function render(id: string) {
    await TestBed.configureTestingModule({
      imports: [FollowButtonComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    const fixture = TestBed.createComponent(FollowButtonComponent);
    fixture.componentRef.setInput('id', id);
    await fixture.whenStable();
    return fixture;
  }

  it('começa como "Seguir" quando o torneio ainda não é seguido', async () => {
    const fixture = await render('t1');
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.textContent).toContain('Seguir');
    expect(button.textContent).not.toContain('Seguindo');
  });

  it('clicar passa a seguir e persiste', async () => {
    const fixture = await render('t2');
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');

    button.click();
    await fixture.whenStable();

    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.textContent).toContain('Seguindo');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toEqual(['t2']);
  });

  it('clicar de novo desfaz o seguir', async () => {
    const fixture = await render('t3');
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');

    button.click();
    await fixture.whenStable();
    button.click();
    await fixture.whenStable();

    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.textContent).toContain('Seguir');
    expect(button.textContent).not.toContain('Seguindo');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toEqual([]);
  });

  it('reflete estado já seguido no carregamento', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['t4']));
    const fixture = await render('t4');
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.textContent).toContain('Seguindo');
  });
});
