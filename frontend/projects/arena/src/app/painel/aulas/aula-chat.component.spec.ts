import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { AuthService } from '../../auth/auth.service';
import type { ChannelMessage } from '../profissionais/arena-professor-channel.model';
import { AulaChatComponent } from './aula-chat.component';
import type { AulaConversation } from './aulas-chat.model';
import { AulasChatService } from './aulas-chat.service';

/** Serviço falso: o componente nunca toca Firebase — os listeners são disparados à mão. */
class FakeAulasChat {
  drafts = new Map<string, string>();
  sent: Array<[string, string]> = [];
  marked: string[] = [];
  onConversation: ((c: AulaConversation | null) => void) | null = null;
  onMessages: ((m: ChannelMessage[]) => void) | null = null;

  takeDraft(id: string) {
    const t = this.drafts.get(id) ?? '';
    this.drafts.delete(id);
    return t;
  }
  watchConversation(_id: string, cb: (c: AulaConversation | null) => void) {
    this.onConversation = cb;
    return () => undefined;
  }
  watchMessages(_id: string, cb: (m: ChannelMessage[]) => void) {
    this.onMessages = cb;
    return () => undefined;
  }
  send(id: string, text: string) {
    this.sent.push([id, text]);
    return Promise.resolve({});
  }
  markRead(id: string) {
    this.marked.push(id);
    return Promise.resolve();
  }
}

function conversation(over: Partial<AulaConversation> = {}): AulaConversation {
  return {
    id: 's_a1_me_u1',
    arenaId: 'a1',
    staffUid: 'me',
    athleteUid: 'u1',
    athleteName: 'Carla Dias',
    athletePhotoUrl: null,
    arenaName: 'Arena Sol',
    memberIds: ['me', 'u1'],
    closed: false,
    lastAt: null,
    lastMessage: null,
    unread: {},
    ...over,
  };
}

const flush = () => new Promise((r) => setTimeout(r));

describe('AulaChatComponent', () => {
  let service: FakeAulasChat;
  let fixture: ComponentFixture<AulaChatComponent>;

  async function mount(draft = ''): Promise<HTMLElement> {
    service = new FakeAulasChat();
    if (draft) service.drafts.set('s_a1_me_u1', draft);
    TestBed.configureTestingModule({
      imports: [AulaChatComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AulasChatService, useValue: service },
        { provide: AuthService, useValue: { user: signal({ uid: 'me' }) } },
      ],
    });
    fixture = TestBed.createComponent(AulaChatComponent);
    fixture.componentRef.setInput('conversationId', 's_a1_me_u1');
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const textarea = (el: HTMLElement) => el.querySelector<HTMLTextAreaElement>('textarea');

  it('o "Cobrar" chega com a mensagem pronta no composer e envia pelo callable', async () => {
    const el = await mount('Segue a cobrança https://pay/x');
    service.onConversation!(conversation());
    service.onMessages!([]);
    await fixture.whenStable();

    expect(textarea(el)!.value).toBe('Segue a cobrança https://pay/x');
    expect(el.textContent).toContain('Carla Dias');
    el.querySelector<HTMLButtonElement>('.send-btn')!.click();
    await flush();
    await fixture.whenStable();
    expect(service.sent).toEqual([['s_a1_me_u1', 'Segue a cobrança https://pay/x']]);
    expect(textarea(el)!.value).toBe('');
    // O rascunho é de uma abertura só.
    expect(service.drafts.size).toBe(0);
  });

  it('mostra as mensagens e zera as não lidas de quem está vendo', async () => {
    const el = await mount();
    service.onConversation!(conversation({ unread: { me: 2 } }));
    service.onMessages!([
      { id: 'm1', senderUid: 'u1', senderName: 'Carla', text: 'Pago!', createdAt: new Date(), auto: false },
    ]);
    await fixture.whenStable();
    expect(el.textContent).toContain('Pago!');
    expect(service.marked).toEqual(['s_a1_me_u1']);
  });

  it('encerrada: sem composer, com o aviso', async () => {
    const el = await mount();
    service.onConversation!(conversation({ closed: true }));
    await fixture.whenStable();
    expect(textarea(el)).toBeNull();
    expect(el.textContent).toContain('Conversa encerrada');
  });

  it('sem acesso à conversa: avisa', async () => {
    const el = await mount();
    service.onConversation!(null);
    await fixture.whenStable();
    expect(el.textContent).toContain('não está disponível');
    expect(textarea(el)).toBeNull();
  });
});
