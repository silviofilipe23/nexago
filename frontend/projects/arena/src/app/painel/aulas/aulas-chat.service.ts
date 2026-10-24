import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { collection, doc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { AuthService } from '../../auth/auth.service';
import { ArenaContextService } from '../data/arena-context.service';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { callableErrorMessage } from '../profissionais/arena-professor.model';
import type { ChannelMessage } from '../profissionais/arena-professor-channel.model';
import { ArenaProfessorChannelService } from '../profissionais/arena-professor-channel.service';
import { aulaConversationFromDoc, aulaUnreadTotal, myAulaConversations, type AulaConversation } from './aulas-chat.model';

/** Chat das Aulas (gestão ↔ aluno). Leitura direta do Firestore (rules: membros da conversa);
 *  abrir pelo callable `openArenaStudentConversation`; enviar e marcar lido pelos mesmos callables
 *  do canal com o professor (o motor é um só). Telas só falam com esta classe — specs trocam por
 *  um fake. */
@Injectable({ providedIn: 'root' })
export class AulasChatService {
  private readonly auth = inject(AuthService);
  private readonly arenaContext = inject(ArenaContextService);
  private readonly channel = inject(ArenaProfessorChannelService);

  private readonly all = signal<AulaConversation[]>([]);
  /** Rascunho para a próxima abertura de cada conversa (o "Cobrar" leva a mensagem pronta). */
  private readonly drafts = new Map<string, string>();

  /** Conversas de quem está logado na arena atual (ao vivo depois de `startInbox`). */
  readonly inbox = computed(() =>
    myAulaConversations(this.all(), this.arenaContext.arenaId() ?? '', this.auth.user()?.uid ?? null),
  );
  readonly unreadTotal = computed(() => aulaUnreadTotal(this.inbox(), this.auth.user()?.uid ?? null));

  /** Liga o listener da caixa (a aba e o badge leem daqui); segue a arena e o usuário logado. */
  startInbox(): void {
    this.wanted.set(true);
  }

  private readonly wanted = signal(false);

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid;
      const arenaId = this.arenaContext.arenaId();
      if (!this.wanted() || !uid || !arenaId) {
        untracked(() => this.all.set([]));
        return;
      }
      // Mesmo índice do canal com o professor (`memberIds` + `arenaId` + `lastAt`).
      const stop = onSnapshot(
        query(
          collection(arenaFirestore(), 'conversations'),
          where('memberIds', 'array-contains', uid),
          where('arenaId', '==', arenaId),
          orderBy('lastAt', 'desc'),
        ),
        (snap) => this.all.set(snap.docs.map(aulaConversationFromDoc).filter((c): c is AulaConversation => c != null)),
        () => this.all.set([]),
      );
      onCleanup(() => stop());
    });
  }

  /** Cria/retoma a conversa com o aluno. Exige acesso às Aulas e que o atleta siga aluno. */
  async open(arenaId: string, athleteId: string): Promise<string> {
    try {
      const r = await httpsCallable<{ arenaId: string; athleteId: string }, { conversationId: string }>(
        arenaFunctions(),
        'openArenaStudentConversation',
      )({ arenaId, athleteId });
      return r.data.conversationId;
    } catch (err) {
      throw new Error(callableErrorMessage(err, 'Não foi possível abrir a conversa com o aluno.'));
    }
  }

  setDraft(conversationId: string, text: string): void {
    if (text.trim()) this.drafts.set(conversationId, text);
  }

  /** Lê e apaga o rascunho guardado (só a primeira abertura o usa). */
  takeDraft(conversationId: string): string {
    const text = this.drafts.get(conversationId) ?? '';
    this.drafts.delete(conversationId);
    return text;
  }

  watchConversation(conversationId: string, onChange: (c: AulaConversation | null) => void): () => void {
    return onSnapshot(
      doc(arenaFirestore(), 'conversations', conversationId),
      (snap) => onChange(snap.exists() ? aulaConversationFromDoc(snap) : null),
      () => onChange(null),
    );
  }

  watchMessages(conversationId: string, onChange: (m: ChannelMessage[]) => void, onError: (message: string) => void): () => void {
    return this.channel.watchMessages(conversationId, onChange, onError);
  }

  send(conversationId: string, text: string): Promise<unknown> {
    return this.channel.send(conversationId, text);
  }

  markRead(conversationId: string): Promise<unknown> {
    return this.channel.markRead(conversationId);
  }
}
