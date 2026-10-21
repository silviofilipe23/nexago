import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { AuthService } from '../../auth/auth.service';
import type { ArenaProfessorLink } from './arena-professor.model';
import type { ArenaChannel, ChannelMessage } from './arena-professor-channel.model';
import { ArenaProfessorChannelService } from './arena-professor-channel.service';
import { ProfessorChannelComponent } from './professor-channel.component';

/** Serviço falso: o componente nunca toca Firebase — os listeners são disparados à mão. */
class FakeChannelService {
  opened: Array<[string, string]> = [];
  sent: Array<[string, string]> = [];
  marked: string[] = [];
  onChannel: ((c: ArenaChannel | null) => void) | null = null;
  onMessages: ((m: ChannelMessage[]) => void) | null = null;
  watchedChannel: string | null = null;

  open(arenaId: string, professorUid: string) {
    this.opened.push([arenaId, professorUid]);
    return Promise.resolve({ conversationId: `a_${arenaId}_${professorUid}`, linkId: `${arenaId}_${professorUid}` });
  }
  watchChannel(id: string, cb: (c: ArenaChannel | null) => void) {
    this.watchedChannel = id;
    this.onChannel = cb;
    return () => undefined;
  }
  watchMessages(_id: string, cb: (m: ChannelMessage[]) => void) {
    this.onMessages = cb;
    return () => undefined;
  }
  send(id: string, text: string) {
    this.sent.push([id, text]);
    return Promise.resolve({ messageId: 'm' });
  }
  markRead(id: string) {
    this.marked.push(id);
    return Promise.resolve();
  }
}

function link(status: ArenaProfessorLink['status']): ArenaProfessorLink {
  return {
    id: 'a1_p1',
    arenaId: 'a1',
    professorUserId: 'p1',
    professorName: 'Thiago Mendes',
    professorPhotoUrl: null,
    status,
  } as ArenaProfessorLink;
}

function channel(unread: Record<string, number> = {}): ArenaChannel {
  return {
    id: 'a_a1_p1',
    arenaId: 'a1',
    professorUid: 'p1',
    linkId: 'a1_p1',
    memberIds: ['p1', 'me'],
    memberNames: {},
    closed: false,
    lastAt: null,
    lastMessage: null,
    unread,
  };
}

const flush = () => new Promise((r) => setTimeout(r));

describe('ProfessorChannelComponent', () => {
  let service: FakeChannelService;
  let fixture: ComponentFixture<ProfessorChannelComponent>;

  async function mount(status: ArenaProfessorLink['status'], canWrite = true): Promise<HTMLElement> {
    service = new FakeChannelService();
    TestBed.configureTestingModule({
      imports: [ProfessorChannelComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ArenaProfessorChannelService, useValue: service },
        { provide: AuthService, useValue: { user: signal({ uid: 'me' }) } },
      ],
    });
    fixture = TestBed.createComponent(ProfessorChannelComponent);
    fixture.componentRef.setInput('link', link(status));
    fixture.componentRef.setInput('canWrite', canWrite);
    await fixture.whenStable();
    await flush();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('vínculo ativo: abre o canal, mostra as mensagens e alinha as minhas à direita', async () => {
    const el = await mount('ACTIVE');
    expect(service.opened).toEqual([['a1', 'p1']]);
    service.onMessages!([
      { id: '1', senderUid: 'p1', senderName: 'Thiago', text: 'Bom dia', createdAt: new Date(), auto: false },
      { id: '2', senderUid: 'me', senderName: 'Ana · gestão', text: 'Fechado', createdAt: new Date(), auto: false },
    ]);
    await fixture.whenStable();
    const msgs = el.querySelectorAll('.msg');
    expect(msgs.length).toBe(2);
    expect(msgs[0]!.classList.contains('out')).toBeFalse();
    expect(msgs[1]!.classList.contains('out')).toBeTrue();
    expect(el.querySelector('.who')?.textContent).toContain('Thiago');
  });

  it('Enter envia pelo callable; Shift+Enter não', async () => {
    const el = await mount('ACTIVE');
    const ta = el.querySelector('textarea') as HTMLTextAreaElement;
    ta.value = '  Quadra 2 liberada  ';
    ta.dispatchEvent(new Event('input'));
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }));
    await fixture.whenStable();
    expect(service.sent).toEqual([]);
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await flush();
    await fixture.whenStable();
    expect(service.sent).toEqual([['a_a1_p1', 'Quadra 2 liberada']]);
    expect(ta.value).toBe('');
  });

  it('marca como lido quando há não lidas de quem está vendo', async () => {
    await mount('ACTIVE');
    service.onChannel!(channel({ me: 0, p1: 4 }));
    await fixture.whenStable();
    expect(service.marked).toEqual([]);
    service.onChannel!(channel({ me: 2 }));
    await fixture.whenStable();
    expect(service.marked).toEqual(['a_a1_p1']);
  });

  it('vínculo encerrado sem histórico: não abre e explica', async () => {
    const el = await mount('ENDED');
    expect(service.opened).toEqual([]);
    expect(service.watchedChannel).toBe('a_a1_p1');
    expect(el.querySelector('textarea')).toBeNull();
    expect(el.textContent).toContain('vínculo estiver ativo');
  });

  it('vínculo encerrado com histórico: mostra só leitura', async () => {
    const el = await mount('ENDED');
    service.onChannel!(channel());
    await fixture.whenStable();
    expect(el.querySelector('textarea')).toBeNull();
    expect(el.textContent).toContain('Canal encerrado');
  });

  it('sem escrita em perfil: não abre nem ouve', async () => {
    const el = await mount('ACTIVE', false);
    expect(service.opened).toEqual([]);
    expect(service.watchedChannel).toBeNull();
    expect(el.textContent).toContain('Perfil');
  });
});
