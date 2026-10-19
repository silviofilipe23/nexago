# Convidar jogadores para uma reserva de quadra — Design

Data: 2026-10-19
Status: decidido pelo padrão recomendado (pedido: "adicionar a função de convidar jogadores para jogar em
uma reserva"); decisões listadas no PR para revisão.

## Objetivo

Quem reservou a quadra chama os parceiros do jogo pelo app: convite direto para atletas do nexaGO (push) ou
link para mandar no WhatsApp. Quem aceita entra na lista da reserva ("Sua equipe"), vê o jogo na Agenda,
recebe o lembrete de 15 min e pode sair. O botão "Convidar jogadores" do detalhe da reserva hoje só mostra
"em breve".

## O que já existia

- `bookingInvites` + tela `/convite/:inviteId` (`BookingInvitePage`), do app 1.0.1. O app parou de criar
  convite em 08/06/2026 e a escrita de cliente foi fechada nas rules (PR #548): criar e aceitar o próprio
  convite dava +20 XP ilimitado e pendurava "convidado" em reserva alheia. O comentário das rules manda
  reabrir **só por callable que valide o dono e grave convite + reserva no servidor** — é o que este
  desenho faz.
- O app (inclusive as versões da loja) e o lembrete de 15 min já leem `participants: [{uid, name,
  avatarUrl}]` no doc da reserva (`parseConfirmedAthletesFromBooking`, `ATHLETE_ARRAY_FIELDS`).
- Gatilhos: `onBookingInviteCreatedNotifyInvitee` (push no create) e
  `onBookingInviteAcceptedAwardInviterXp` (+20 XP a quem convidou na transição para `accepted`, idempotente
  por `gamification_events/invite_{inviteId}`).
- Android reivindica `atleta.nexago.com.br/convite/*` (App Link); o AASA do iOS não. O portal não tem rota
  `/convite/:id` (cai em `/painel`).

## Decisões

1. **Dois canais.** Convite **direto** (busca de atleta por nome/apelido em `public_profiles.keywords`,
   push + inbox) e **link** (`https://atleta.nexago.com.br/convite/link_{bookingId}`, multiuso até lotar —
   serve para grupo de WhatsApp).
2. **Lotação: 4 jogadores por reserva** (dono + 3), o mesmo `kBookingTeamSlots`/`TEAM_SLOTS` do app e do
   portal. Não existe capacidade de quadra no cadastro. Convite pendente **não segura vaga**: quem aceitar
   primeiro entra; os demais veem "A quadra já está completa".
3. **Quem convida: só o dono** (`athleteId`). Reserva cancelada, aguardando PIX (`pending_payment`) ou já
   encerrada não aceita convite. Aula e clubinho ficam de fora (não têm dono atleta).
4. **Janela:** convidar, aceitar, sair e remover valem até o **fim** do horário (data + `endTime` em SP,
   fim ≤ início vira o dia seguinte). `expiresAt` do convite = fim da reserva.
5. **Um doc de convite por (reserva, atleta):** `bookingInvites/{bookingId}_{uid}`, qualquer canal.
   Reconvidar quem recusou/saiu reabre o mesmo doc. O XP (+20 por jogador que entrou) fica idempotente por
   reserva × atleta — sair e voltar não gera XP de novo. O link é `bookingInvites/link_{bookingId}`
   (`status: open`), e cada entrada por link grava/reabre o doc do atleta com `via: 'link'`.
6. **A lista de quem joga mora no doc da reserva**, gravada só pelo servidor: `participants`
   (`[{uid, name, avatarUrl, via, joinedAt}]`), `participantUids` (consulta da Agenda) e
   `confirmedParticipants = 1 + participantes`. As rules de `arenaBookings` **não mudam**: as allow-lists
   do dono e da equipe já recusam esses campos.
7. **Convidado vê o jogo na Agenda** (`participantUids array-contains`), abre o detalhe como convidado (sem
   cancelar, pagar, confirmar presença nem check-in — tudo isso segue do dono) e pode **sair do jogo**. O
   dono pode **remover** quem entrou e **cancelar** convite pendente.
8. **Pagamento fica de fora.** Convite não cobra nada; a divisão por PIX continua como está (portal,
   reserva `pending_payment`).
9. **Avisos:** convidado recebe "Você foi convidado para jogar" (pela callable — o gatilho de create
   passa a ignorar docs novos, que têm `kind`); o dono recebe aceite, recusa e saída; quem foi removido é
   avisado; cancelar a reserva avisa os participantes e encerra os convites pendentes (gatilho novo).
10. **Retrocompat.** App antigo do dono mostra os participantes (lê `participants`). App antigo do
    convidado abre a tela antiga: o link multiuso aparece como "não está mais disponível" (status `open`)
    e o aceite do convite direto falha nas rules — vale até subir o `minBuildNumber` depois da loja.

## Modelo

`bookingInvites/{bookingId}_{uid}` (convite direto ou entrada por link):

```
bookingId, arenaId, arenaName, courtId, courtName, date, startTime, endTime, sport
kind: 'direct' | 'link'          // canal do ÚLTIMO convite/entrada
invitedByUid, invitedByName      // sempre o dono
inviteeUid, inviteeName, inviteeAvatarUrl
status: 'pending' | 'accepted' | 'declined' | 'canceled' | 'left' | 'removed'
acceptedByUid, acceptedByName, acceptedAt   // legado lê acceptedByUid dos aceitos
createdAt, updatedAt, respondedAt, expiresAt
```

`bookingInvites/link_{bookingId}`: mesmos dados da reserva, `kind: 'link'`, `status: 'open'`, sem
`inviteeUid`.

Rules de `bookingInvites` iguais (leitura autenticada — o preview do link precisa; escrita só servidor).
Consultas do app usam só igualdades (`bookingId`; `inviteeUid` + `status`) e `array-contains` simples em
`participantUids`: dispensam índice composto.

## Peças

Backend (`functions/src/arena-booking-invite.ts`, núcleo puro com Firestore injetado):

- `inviteArenaBookingPlayers({bookingId, inviteeUids})` — até 10 por chamada e 12 pendentes por reserva;
  pula quem já joga ou já tem convite pendente. Push para cada convidado.
- `getArenaBookingInviteLink({bookingId})` — cria/reabre `link_{bookingId}` e devolve o id.
- `respondArenaBookingInvite({inviteId, accept})` — convite direto: só o convidado aceita/recusa. Link:
  qualquer atleta que não seja o dono. Transação relê convite + reserva, confere janela e vaga, grava os dois.
  Aceite credita o XP de quem convidou (`awardPlayerInviteXp`, mesmo id de evento do gatilho).
- `leaveArenaBooking({bookingId, participantUid?})` — convidado sai; dono remove (`participantUid`).
- `cancelArenaBookingInvite({inviteId})` — dono cancela convite pendente.
- Gatilho `onArenaBookingCanceledNotifyParticipants` — reserva → cancelada: avisa participantes, encerra
  pendentes.
- `onBookingInviteCreatedNotifyInvitee` ignora docs com `kind` (os novos avisam pela callable).

App:

- `BookingInviteService` passa a chamar as callables; leituras (`bookingInvites` da reserva, pendentes do
  atleta, reservas como convidado).
- Detalhe da reserva ciente do papel: dono vê "Convidar jogadores" (folha com link + busca), pendentes com
  "cancelar" e "remover" nos participantes; convidado vê o dono pelo nome, a si mesmo como "Você" e
  "Sair do jogo"; pagamento, presença, cancelamento e pedido na quadra somem para o convidado.
- `/convite/:inviteId` refeita: direto e link, aceitar/recusar, já está no jogo, lotado, cancelado,
  expirado, é o dono, sem login (guarda o convite e vai ao login).
- Agenda junta as reservas em que o atleta é convidado (sem "pagar" nem "confirmar presença").
- Home: "Convites para jogar" recebidos e pendentes, antes dos convites de dupla.

Portal do atleta (fora deste PR): página `/convite/:id`, convite no detalhe da reserva, reservas como
convidado na agenda e `/convite/*` no AASA (o arquivo já vai ajustado aqui; publica com o portal).

## Deploy

1. Functions (novas callables + gatilho novo + `onBookingInviteCreatedNotifyInvitee` alterado, juntos —
   senão o convite direto avisa duas vezes).
2. Build do app.
3. Loja → `minBuildNumber` (o app antigo do convidado não aceita convite).
4. Portal (com o AASA) quando a página `/convite/:id` existir.
