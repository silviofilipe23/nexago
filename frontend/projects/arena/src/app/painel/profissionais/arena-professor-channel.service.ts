import { Injectable } from '@angular/core';
import { collection, doc, limitToLast, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { arenaFirestore } from '../data/firestore';
import { arenaFunctions } from '../data/functions';
import { callableErrorMessage } from './arena-professor.model';
import {
  arenaChannelFromDoc,
  arenaProfessorNoticeFromDoc,
  channelMessageFromDoc,
  type ArenaChannel,
  type ArenaProfessorNotice,
  type ChannelMessage,
  type NoticeInput,
} from './arena-professor-channel.model';
import { ArenaProfessorError } from './arena-professors.service';

/** Mensagens mais antigas que isso ficam fora da tela (o canal é operacional, não arquivo). */
const MESSAGE_WINDOW = 200;

async function call<In, Out>(name: string, input: In, fallback: string): Promise<Out> {
  try {
    const result = await httpsCallable<In, Out>(arenaFunctions(), name)(input);
    return result.data;
  } catch (err) {
    const code = (err as { code?: unknown })?.code;
    throw new ArenaProfessorError(
      callableErrorMessage(err, fallback),
      typeof code === 'string' ? code.replace(/^functions\//, '') : null,
      (err as { details?: unknown })?.details ?? null,
    );
  }
}

/** Canal arena ↔ professor (D4) e comunicados aos professores (F6). Leitura direta do Firestore
 *  (rules: membros do canal; `perfil` para os comunicados); toda escrita pelos callables de
 *  `functions/src/arena-professor-channel.ts` e `professor-messages.ts`.
 *
 *  Telas só falam com esta classe — um spec ou rota de QA troca por um fake. */
@Injectable({ providedIn: 'root' })
export class ArenaProfessorChannelService {
  /** Cria/atualiza o canal e a lista de membros. Exige vínculo ATIVO e escrita em `perfil`. */
  open(arenaId: string, professorUid: string): Promise<{ conversationId: string; linkId: string }> {
    return call('openArenaChannel', { arenaId, professorUid }, 'Não foi possível abrir o canal com o professor.');
  }

  /** O doc do canal, ao vivo; `null` quando não existe ou quem lê não é membro. */
  watchChannel(conversationId: string, onChange: (channel: ArenaChannel | null) => void): () => void {
    return onSnapshot(
      doc(arenaFirestore(), 'conversations', conversationId),
      (snap) => onChange(snap.exists() ? arenaChannelFromDoc(snap) : null),
      () => onChange(null),
    );
  }

  watchMessages(
    conversationId: string,
    onChange: (messages: ChannelMessage[]) => void,
    onError: (message: string) => void,
  ): () => void {
    return onSnapshot(
      query(
        collection(arenaFirestore(), 'conversations', conversationId, 'messages'),
        orderBy('createdAt', 'asc'),
        limitToLast(MESSAGE_WINDOW),
      ),
      (snap) =>
        onChange(snap.docs.map(channelMessageFromDoc).filter((m): m is ChannelMessage => m != null)),
      () => onError('Não foi possível carregar as mensagens. Recarregue a página.'),
    );
  }

  /** Canais da arena em que o usuário é membro (para os badges de não lidas). */
  watchArenaChannels(arenaId: string, uid: string, onChange: (channels: ArenaChannel[]) => void): () => void {
    return onSnapshot(
      query(
        collection(arenaFirestore(), 'conversations'),
        where('memberIds', 'array-contains', uid),
        where('arenaId', '==', arenaId),
        orderBy('lastAt', 'desc'),
      ),
      (snap) => onChange(snap.docs.map(arenaChannelFromDoc).filter((c): c is ArenaChannel => c != null)),
      () => onChange([]),
    );
  }

  send(conversationId: string, text: string): Promise<{ messageId: string }> {
    return call('sendConversationMessage', { conversationId, text }, 'Não foi possível enviar a mensagem.');
  }

  markRead(conversationId: string): Promise<unknown> {
    return call('markConversationRead', { conversationId }, 'Não foi possível marcar como lida.');
  }

  /** Comunicados enviados pela arena, mais recentes primeiro. */
  watchNotices(
    arenaId: string,
    onChange: (notices: ArenaProfessorNotice[]) => void,
    onError: (message: string) => void,
  ): () => void {
    return onSnapshot(
      query(collection(arenaFirestore(), 'arenaProfessorNotices'), where('arenaId', '==', arenaId), orderBy('sentAt', 'desc')),
      (snap) => onChange(snap.docs.map(arenaProfessorNoticeFromDoc)),
      () => onError('Não foi possível carregar os comunicados. Recarregue a página.'),
    );
  }

  sendNotice(input: NoticeInput): Promise<{ noticeId: string; recipientCount: number }> {
    return call('sendArenaProfessorNotice', input, 'Não foi possível enviar o comunicado.');
  }
}
