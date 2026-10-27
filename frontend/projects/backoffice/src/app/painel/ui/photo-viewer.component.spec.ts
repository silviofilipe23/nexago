import { TestBed } from '@angular/core/testing';
import { PhotoViewerComponent } from './photo-viewer.component';

function setup(nickname: string | null) {
  const fixture = TestBed.createComponent(PhotoViewerComponent);
  fixture.componentRef.setInput('src', 'data:image/gif;base64,R0lGODlhAQABAAAAACw=');
  fixture.componentRef.setInput('name', 'Ana Lima Souza');
  fixture.componentRef.setInput('nickname', nickname);
  fixture.componentRef.setInput('detail', 'ana@exemplo.com');
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, dialog: el.querySelector('dialog') as HTMLDialogElement };
}

describe('PhotoViewerComponent', () => {
  it('abre como modal com a foto e a legenda', async () => {
    const { fixture, el, dialog } = setup('Aninha');
    await fixture.whenStable();
    expect(dialog.open).toBeTrue();
    expect(el.querySelector('img')?.getAttribute('alt')).toBe('Foto de Ana Lima Souza');
    expect(el.querySelector('.name')?.textContent).toContain('Ana Lima Souza');
    expect(el.querySelector('.nick')?.textContent).toContain('Aninha');
    expect(el.querySelector('.detail')?.textContent).toContain('ana@exemplo.com');
  });

  it('sem apelido, não deixa linha vazia', () => {
    const { el } = setup(null);
    expect(el.querySelector('.nick')).toBeNull();
  });

  it('o ✕ fecha o <dialog> e avisa o pai', async () => {
    const { fixture, el, dialog } = setup('Aninha');
    await fixture.whenStable();
    let dismissed = 0;
    fixture.componentInstance.dismissed.subscribe(() => dismissed++);
    (el.querySelector('.close') as HTMLButtonElement).click();
    expect(dialog.open).toBeFalse();
    expect(dismissed).toBe(1);
  });
});
