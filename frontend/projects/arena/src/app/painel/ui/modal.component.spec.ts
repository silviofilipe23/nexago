import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalComponent } from './modal.component';
import { PersonPhotoService } from './person-photo.service';

/** A foto ampliada pode ser aberta de dentro do modal (atleta na Nova reserva). O Escape que
 *  fecha a foto não pode fechar o modal junto e jogar fora o formulário preenchido. */
describe('ModalComponent (Escape)', () => {
  let fixture: ComponentFixture<ModalComponent>;
  let photos: PersonPhotoService;
  let closed: number;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModalComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(ModalComponent);
    photos = TestBed.inject(PersonPhotoService);
    closed = 0;
    fixture.componentInstance.close.subscribe(() => closed++);
    await fixture.whenStable();
  });

  function pressEscape(): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  }

  it('fecha no Escape', () => {
    pressEscape();
    expect(closed).toBe(1);
  });

  it('com a foto ampliada aberta, o Escape não fecha o modal', () => {
    photos.open({ photoUrl: 'x.jpg', role: 'Atleta', name: 'Carla Dias', meta: null, origin: null, returnFocusTo: null });
    pressEscape();
    expect(closed).toBe(0);
  });
});
