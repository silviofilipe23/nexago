# Histórico persistente de avisos (Comunicação do organizador)

## Problema

A tela "Comunicação" do painel do organizador (`frontend/projects/organizer/.../painel/comunicacao/comunicacao.component.ts`)
mostra uma coluna "Avisos enviados" com o histórico de comunicados de categoria já
disparados. Hoje esse histórico é só um `signal` local (`sentLog`) no componente
Angular — some ao recarregar a página ou trocar de aba. O backend
(`sendCategoryCommunication`, em `functions/src/organizer-category-ops.ts`) nunca
persiste o aviso em lugar nenhum: só dispara push (via `deliverNotificationToUser`)
e devolve `{pushCount, pushNoChannel, pushFailed, whatsappLinks}` pro chamador.

## Decisão

Persistir cada envio em uma nova subcoleção do torneio,
`tournaments/{tournamentId}/categoryCommunications/{id}`, gravada pelo próprio
`sendCategoryCommunicationCore` logo após calcular as contagens de push. O painel
web lê essa subcoleção **direto do Firestore** (mesmo padrão já usado hoje pra ler
torneios/categorias — sem callable dedicado de leitura), com paginação via
`orderBy('createdAt', 'desc').limit(20)` + `startAfter` no botão "Carregar mais".
A leitura é autorizada em `firestore.rules` reaproveitando `canManageTournament(tournamentId)`,
a mesma função que já autoriza dono/staff/admin a gerenciar o torneio.

Escopo: histórico cobre **só** os avisos de `sendCategoryCommunication` (push +
WhatsApp por categoria). Os anúncios públicos de `postTournamentAnnouncement`
(que já persistem em `communityFeed`) ficam de fora — são um mecanismo e uma
audiência diferentes (feed público da comunidade, não histórico do organizador).

Não guardamos os links de WhatsApp no histórico: contêm telefone (dado pessoal
desnecessário de reter) e são regeráveis a qualquer momento a partir das
inscrições da categoria — não fazem sentido como registro histórico.

## Design — Firestore

### Documento (`tournaments/{tournamentId}/categoryCommunications/{id}`)

```ts
{
  categoryId: string;
  message: string;
  audience: 'all' | 'paid' | 'pending';
  sendPush: boolean;
  pushCount: number;       // entregues de fato (sent > 0)
  pushNoChannel: number;   // sem token/subscription nenhum
  pushFailed: number;      // tinha canal, FCM/Web Push rejeitou
  createdAt: Timestamp;    // FieldValue.serverTimestamp()
  createdBy: string;       // uid de quem enviou
}
```

`categoryId` fica sem nome denormalizado — o nome da categoria já está disponível
no `categories()` computed do componente (carregado junto com o torneio), então o
front resolve `categoryId → nome` do mesmo jeito que já faz hoje pro `sentLog`
local. Evita nome de categoria desatualizado se ela for renomeada depois do envio.

### `firestore.rules`

Nova regra ao lado de `match /tournaments/{tournamentId}` (reaproveita
`canManageTournament`, já definida no arquivo):

```
match /tournaments/{tournamentId}/categoryCommunications/{commId} {
  allow read: if canManageTournament(tournamentId);
  allow write: if false; // só Admin SDK (Cloud Function) escreve
}
```

## Design — Backend (`functions/src/organizer-category-ops.ts`)

Dentro de `sendCategoryCommunicationCore`, depois do loop que calcula
`pushSent/pushNoChannel/pushFailed` e antes do `return`:

```ts
await db.collection(`tournaments/${tournamentId}/categoryCommunications`).add({
  categoryId,
  message,
  audience,
  sendPush,
  pushCount: pushSent,
  pushNoChannel,
  pushFailed,
  createdAt: FieldValue.serverTimestamp(),
  createdBy: uid,
});
```

Falha nessa escrita não deve derrubar o envio (o push já foi disparado nesse
ponto) — envolver em `try/catch` com `logger.warn`, mesmo padrão já usado pro
histórico de notificação em `deliverNotificationToUser`.

## Design — Frontend (`frontend/projects/organizer`)

### `painel/data/organizer-ops.service.ts` ou novo arquivo `category-communications-repository.ts`

Nova função de leitura direta do Firestore (padrão de `tournaments-repository.ts`):

```ts
export interface CategoryCommunicationEntry {
  id: string;
  categoryId: string;
  message: string;
  audience: 'all' | 'paid' | 'pending';
  sendPush: boolean;
  pushCount: number;
  pushNoChannel: number;
  pushFailed: number;
  createdAt: Date;
  createdBy: string;
}

export function listCategoryCommunicationsPage(
  tournamentId: string,
  pageSize: number,
  afterCursor?: QueryDocumentSnapshot,
): Promise<{ items: CategoryCommunicationEntry[]; lastCursor: QueryDocumentSnapshot | null }>;
```

O cursor (`QueryDocumentSnapshot`) fica separado dos dados exibidos: o componente
guarda só o `lastCursor` da página mais recente (pra alimentar `startAfter` no
"Carregar mais") e a lista de `CategoryCommunicationEntry` pra exibir. Usa
`query(collection(...), orderBy('createdAt', 'desc'), limit(pageSize), ...(afterCursor ? [startAfter(afterCursor)] : []))`.

### `comunicacao.component.ts`

- Remove `sentLog` local; substitui por `signal` carregado da subcoleção ao abrir
  a tela (`load(tid)`, junto com o torneio).
- Depois de um envio bem-sucedido, dá **prepend otimista** do novo item na lista
  local (sem esperar reload) — igual já faz hoje — mas o dado real na próxima
  visita à tela vem do Firestore.
- Botão "Carregar mais" abaixo da lista quando a página retornada tiver
  exatamente `pageSize` itens (heurística simples de "pode ter mais", sem contar
  o total).
- Empty state: "Nenhum aviso enviado ainda." quando a primeira página vier vazia.
- Linha de cada item reflete os campos reais: `X push entregues` (omite a
  contagem de push inteiramente e mostra "Só WhatsApp" quando `sendPush === false`)
  + badge de alerta quando `pushNoChannel + pushFailed > 0`, igual ao
  comportamento já implementado pro item otimista.

## Testes

- `functions`: teste em `organizer-category-ops.send-communication.test.ts`
  (já existe) — nova asserção de que o doc é gravado em
  `tournaments/{id}/categoryCommunications` com os campos esperados, usando o
  `FakeFirestore` já usado nos outros testes desse arquivo.
- `functions`: falha ao gravar o histórico não impede o retorno normal da
  function (teste força um erro no `add` e confere que `pushCount` etc. ainda
  vêm certos).
- Frontend: sem suíte de testes automatizados nesse projeto Angular hoje (mesmo
  padrão dos componentes vizinhos) — validação por build + QA manual no dev.

## Fora de escopo

- Anúncios públicos (`postTournamentAnnouncement` / `communityFeed`) não entram
  nesse histórico.
- Sem exclusão/edição de itens do histórico depois de enviados.
- Sem exportar/baixar o histórico (CSV etc.).
- Sem contagem total de itens ("mostrando 20 de 143") — só cursor de paginação.
