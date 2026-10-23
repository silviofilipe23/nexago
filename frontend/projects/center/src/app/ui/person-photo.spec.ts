import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PersonComponent } from './kit';
import { PhotoViewerComponent, PhotoViewerService } from './photo-viewer';

function make(inputs: Record<string, unknown>) {
  const f = TestBed.createComponent(PersonComponent);
  for (const [k, v] of Object.entries(inputs)) f.componentRef.setInput(k, v);
  f.detectChanges();
  return f;
}

describe('ct-person com foto', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [PersonComponent, PhotoViewerComponent],
    providers: [provideZonelessChangeDetection()],
  }));

  it('sem foto: iniciais e nada de botão', () => {
    const el: HTMLElement = make({ name: 'Ana Souza', zoomable: true }).nativeElement;
    expect(el.querySelector('button')).toBeNull();
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('AS');
  });

  it('com foto e sem zoom: só mostra a foto', () => {
    const el: HTMLElement = make({ name: 'Ana Souza', photoUrl: 'https://x/a.jpg' }).nativeElement;
    expect(el.querySelector('img')?.getAttribute('src')).toBe('https://x/a.jpg');
    expect(el.querySelector('button')).toBeNull();
  });

  it('com foto e zoom: clique abre o visualizador; Esc fecha', () => {
    const el: HTMLElement = make({ name: 'Ana Souza', photoUrl: 'https://x/a.jpg', zoomable: true }).nativeElement;
    const viewer = TestBed.inject(PhotoViewerService);
    (el.querySelector('button') as HTMLButtonElement).click();
    expect(viewer.current()).toEqual({ url: 'https://x/a.jpg', name: 'Ana Souza', role: 'Atleta' });

    const v = TestBed.createComponent(PhotoViewerComponent);
    v.detectChanges();
    const ve: HTMLElement = v.nativeElement;
    expect(ve.querySelector('figure img')?.getAttribute('src')).toBe('https://x/a.jpg');
    expect(ve.textContent).toContain('Ana Souza');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    v.detectChanges();
    expect(viewer.current()).toBeNull();
    expect(ve.querySelector('figure')).toBeNull();
  });

  it('foto quebrada volta para as iniciais', () => {
    const f = make({ name: 'Ana Souza', photoUrl: 'https://x/a.jpg', zoomable: true });
    const img = (f.nativeElement as HTMLElement).querySelector('img')!;
    img.dispatchEvent(new Event('error'));
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('button')).toBeNull();
    expect((f.nativeElement as HTMLElement).textContent).toContain('AS');
  });
});
