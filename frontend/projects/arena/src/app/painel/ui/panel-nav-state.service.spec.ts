import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { PanelNavStateService } from './panel-nav-state.service';

describe('PanelNavStateService', () => {
  let service: PanelNavStateService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    service = TestBed.inject(PanelNavStateService);
  });

  afterEach(() => localStorage.clear());

  it('comeca sem grupo aberto', () => {
    expect(service.openGroup('arena-1')).toBeNull();
  });

  it('guarda e devolve o grupo aberto', () => {
    service.setOpenGroup('arena-1', 'vendas');
    expect(service.openGroup('arena-1')).toBe('vendas');
  });

  it('separa o estado por arena', () => {
    service.setOpenGroup('arena-1', 'vendas');
    service.setOpenGroup('arena-2', 'conta');
    expect(service.openGroup('arena-1')).toBe('vendas');
    expect(service.openGroup('arena-2')).toBe('conta');
  });

  it('sobrevive a uma instancia nova (o shell remonta a cada navegacao)', () => {
    service.setOpenGroup('arena-1', 'publico');
    service.setScrollTop('arena-1', 120);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const outra = TestBed.inject(PanelNavStateService);

    expect(outra.openGroup('arena-1')).toBe('publico');
    expect(outra.scrollTop('arena-1')).toBe(120);
  });

  it('ignora grupo invalido que sobrou de uma versao anterior', () => {
    localStorage.setItem('ar.nav.arena-1', JSON.stringify({ openGroup: 'marketing', scrollTop: 0 }));
    expect(service.openGroup('arena-1')).toBeNull();
  });

  it('nao quebra quando o localStorage lanca (aba anonima, storage bloqueado)', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException('QuotaExceededError');
    };
    try {
      expect(() => service.setOpenGroup('arena-1', 'vendas')).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it('trata arena nula sem estourar', () => {
    expect(service.openGroup(null)).toBeNull();
    expect(() => service.setOpenGroup(null, 'vendas')).not.toThrow();
  });
});
