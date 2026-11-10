# Reservas por capacidade — a arena define a quadra

Status: **aprovado para construção** (10/11/2026). Entrega em 6 PRs (seção 9).

## 1. Problema

Arenas grandes (o caso de referência tem 15 quadras) não querem que o atleta escolha a quadra.
O atleta reserva **um horário**; a recepção direciona cada grupo para uma quadra na chegada.

Hoje tudo no motor de reservas é por quadra: a trava contra reserva dupla
(`arenaSlotLocks/{arena}_{quadra}_{data}_hXX`), o preço (documento da quadra), a grade do app,
a liberação do horário no cancelamento, e os fluxos de reserva manual, recorrente, aula, plano de
horário, clubinho, chuva, lista de espera e webhook de pagamento.

## 2. Decisão: as quadras são as vagas

Não existe contador de capacidade separado e o `courtId` da reserva **nunca fica nulo**.

- Para o atleta, a reserva não tem quadra: "a equipe define na chegada".
- Por dentro, a reserva segura uma **quadra provisória** com as travas que já existem, marcada
  como deslocável (`floating`).
- Capacidade disponível = quadras livres do esporte naquele horário, calculada a partir das
  travas. Não há número guardado que possa divergir das travas.

### Por que não um contador (`availability/{slotId}`)

- Aula, plano, clubinho e reserva manual continuam ocupando quadra específica. Com contador, todo
  fluxo teria que atualizar o contador **e** a trava; o primeiro que esquecer gera reserva dupla.
- `courtId: null` quebra quem lê a quadra da reserva (74 pontos). Ex.: a liberação do horário no
  cancelamento devolve vazio sem `courtId`, e a vaga nunca voltaria.
- Pagamento pendente, prazo do Pix, sweeper de vaga vencida e webhooks idempotentes já existem por
  quadra; com quadra provisória, continuam valendo sem mudança.

## 3. Configuração por arena

A arena escolhe no portal, página **Quadras**, card **"Como o atleta reserva"**:

- **O atleta escolhe a quadra** — padrão, comportamento de hoje.
- **A arena define a quadra** — o atleta reserva o horário; a recepção direciona.

Opções do modo "arena define":

| Opção | Padrão |
|---|---|
| Quadras que entram na distribuição | todas as ativas |
| Preço do horário por esporte | obrigatório |
| Mostrar a quadra ao atleta quando a recepção definir antes da chegada | não |
| O atleta pode escolher a quadra, se quiser (modo misto) | desligado |

Permissão: área `quadras` do RBAC da equipe da arena.

Gravação: campo no documento da arena, só por callable (valida, registra quem e quando):

```ts
bookingAllocation?: {
  mode: "court" | "capacity";       // ausente = "court"
  courtIds: string[];               // quadras da distribuição
  priceBySport: Record<string, number>;
  revealBeforeArrival: boolean;
  allowCourtChoice: boolean;
  updatedAt: Timestamp;
  updatedBy: string;
}
```

O campo fica bloqueado para escrita do cliente nas rules, e o save do perfil não pode enviá-lo
(campo congelado derruba o save inteiro). Cotação e criação leem o modo no servidor.

### Trocar de modo

Vale só para reservas **novas**; não há migração.

- "atleta escolhe" → "arena define": reservas existentes já têm quadra escolhida e ficam como estão.
- "arena define" → "atleta escolhe": as flutuantes continuam flutuantes até acontecerem; a recepção
  continua vendo a lista "sem quadra".
- O portal avisa antes: "Há N reservas futuras sem quadra definida; elas continuam assim."

### App antigo

Versões na loja não conhecem o modo. Numa arena "arena define", o servidor recusa reserva de
cliente que não declara suporte ao modo capacidade ("Atualize o app para reservar nesta arena").
Depois da versão na loja, subir o `minBuildNumber` (`docs/forced-app-update.md`).

## 4. Dados (só acréscimos)

Reserva (`arenaBookings`):

```ts
allocationStatus?: "unassigned" | "assigned"; // ausente = "assigned" (legado)
allocationSource?: "auto" | "staff" | "qr";
allocatedAt?: Timestamp;
allocatedBy?: string;
courtHistory?: Array<{fromCourtId, toCourtId, by, at, reason}>; // trocas de quadra
```

Trava (`arenaSlotLocks`): `floating: true` enquanto a reserva estiver `unassigned`.

## 5. Motor

1. **Trocar a quadra de uma reserva** (callable do gestor, PR 1). Move travas e `arenaSlots` numa
   transação. Se a quadra de destino está com uma reserva flutuante, as duas trocam de lugar.
   Vale nos dois modos.
2. **Ocupar quadra com deslocamento** (PR 2). Helper único para todo fluxo que reserva quadra
   específica (manual, aula, plano, clubinho, recorrente, bloqueio do gestor, chuva): se a trava é
   flutuante, move essa reserva para outra quadra livre do mesmo esporte; se não houver, recusa.
   É isso que dá a regra de integridade da manutenção ("não reduzir abaixo das reservas").
3. **Criação no modo capacidade** (PR 3). Lê as travas das horas pedidas em todas as quadras da
   distribuição pelos IDs exatos (15 quadras × 2 h = 30 leituras; nunca uma query do dia inteiro,
   que faria toda reserva do dia disputar a mesma transação). Escolhe a quadra que deixa menos
   buraco na grade (encostada numa reserva vizinha; mesma quadra da hora anterior do atleta).
4. **Congelamento.** Reserva `assigned` não é mais deslocável.

## 6. Alocação na chegada

- Recepção atribui pelo painel (`allocationSource: "staff"`), ou
- o atleta lê o **QR da quadra** para onde foi mandado (`arena-court-checkin-qr.ts`, já existe
  para aulas): a reserva vira `assigned` naquela quadra e a presença é marcada (`"qr"`).
- Sem ação nenhuma, vale a quadra provisória.

## 7. Telas

- **App:** grade só com horários disponíveis; confirmação "quadra definida na chegada"; push
  quando a quadra for atribuída; botão de ler o QR na reserva.
- **Painel da arena:** visão por horário (reservas, capacidade, vagas, ocupação); lista do horário
  com ações (atribuir quadra, chegou, no-show); quadro das quadras com arrastar e
  "Confirmar todas".
- **Relatórios:** ocupação e receita por horário sempre; por quadra só das reservas `assigned`.

## 8. Fora do escopo

- Blocos de 15 minutos (as travas são por hora).
- Vaga por jogador (é o clubinho).
- Coleção `availability` e novos status de reserva.

## 9. Entrega

1. **Trocar a quadra da reserva** + botão no painel. Útil sozinho, nos dois modos.
2. **Helper de deslocamento nos fluxos de quadra específica.** Sem mudança de comportamento (ainda
   não há flutuante). Testes de fiação por fluxo, não só da função pura.
3. **Modo capacidade na cotação e na criação** + card de configuração + recusa de app antigo.
   Ligado primeiro numa arena do DEV.
4. **App:** grade por horário, confirmação, push, QR — em três partes: 4a app + textos do
   servidor, 4b portal do atleta, 4c QR da quadra na reserva.
5. **Painel:** visão por horário, check-in, quadro de alocação.
6. **Relatórios.**

### Estado

- **PR 1** (#1147, mergeado): `changeArenaBookingCourt` + "Trocar quadra" no portal.
- **PR 2**: `claimCourtLocks` (`functions/src/arena-floating-booking.ts`) ligado em reserva do
  atleta, balcão, horário fixo, aula, clubinho, reposição de plano, remarcação por chuva, desfazer
  cancelamento e troca de quadra. Na troca, se a quadra de destino tem flutuante, ela vai para
  outra livre; se a única livre é a que a reserva deixa, as duas trocam de lugar. O gestor
  definindo a quadra de uma flutuante marca `assigned` e a trava para de flutuar. Prévias (conflitos
  da aula, opções de reposição) não contam trava flutuante como ocupada.
  Ficam para o PR 3: bloqueio de quadra feito pelo app/portal direto no Firestore (`arenaSlots`
  `blocked`, sem function no meio) e bloqueio do Modo chuva — os dois ainda não empurram flutuante.
  Grade e lista de espera do atleta (`isSlotFullyBooked`) entram no PR 4.
- **PR 3**: `setArenaBookingAllocation` + card "Como o atleta reserva" na tela Quadras (rules
  congelam `bookingAllocation`). `quoteArenaBooking`/`createArenaBooking` aceitam
  `allocation: "capacity"` sem `courtId`: ranqueiam as quadras da distribuição (encostada numa
  reserva primeiro), a transação pega a 1ª livre, preço = `priceBySport` do esporte, reserva
  `unassigned`/`auto` e travas `floating: true`. Cliente sem `allocation` numa arena capacidade
  recebe "Atualize o app" (modo misto aceita quadra escolhida). Bloqueio gravado pelo app/portal
  (`onArenaCourtBlockedRelocateFloating`) empurra as flutuantes; sem quadra livre ficam e o log
  avisa. **Modo chuva fica como está**: a flutuante numa quadra afetada segue a regra da chuva
  (crédito/remarcação), como qualquer reserva daquela quadra. Painel mostra "A definir ·
  provisória" no detalhe e "(provisória)" na lista.

## 10. Para confirmar com a arena

- O preço do horário é o mesmo para todas as quadras?
- As 15 quadras são todas do mesmo esporte?
- Se a recepção definir antes, o atleta pode ver a quadra, ou só na chegada?
- **PR 4a** (app do atleta + servidor): numa arena "a arena define a quadra" a rota de horários
  abre a grade por horário (`CapacitySlotsView`): esporte (os com preço), dia, duração e horários
  com "N quadras livres" / "Últimas vagas" / "Lotado" — um horário tem vaga quando alguma quadra
  da distribuição tem a duração inteira livre **na mesma quadra**. Modo misto: "Prefiro escolher a
  quadra" (ou chegar com uma quadra, ex. lista de espera) abre a grade por quadra. Confirmação,
  Pix e sucesso mostram "Quadra definida na chegada"; cotação e criação vão com
  `allocation: "capacity"` + esporte, sem quadra; retomada do Pix casa pela reserva `unassigned`
  do mesmo esporte e horário. **Quem vê a quadra** (`athleteSeesBookingCourt`, igual no app e nas
  functions): `unassigned` nunca; definida pela recepção antes da chegada numa arena que só mostra
  na chegada (`revealCourtBeforeArrival: false`, copiado na criação) só a partir do início; o resto
  sim. Vale para Minhas reservas/agenda/home, push "Sua quadra está definida" (não sai se
  escondida), lembretes de 1 h e 15 min, convite de jogadores e descrição do Pix. A grade por
  horário ainda não mostra o mínimo do horário de pico (o servidor recusa na confirmação) nem a
  lista de espera. Telas no canvas do Claude Design, página do atleta ("Reservas por capacidade ·
  app do atleta").
- **PR 4b** (portal web do atleta): mesma lógica do app, na lib compartilhada
  `@nexago/arena-discovery` (`booking-allocation.ts`: leitura da config, candidatas, horários
  livres na mesma quadra, duração, preço, `athleteSeesBookingCourt`). Reservar → horário vira
  grade por horário (esporte, duração, "N quadras livres" / "Últimas vagas" / "Lotado", resumo com
  "Quadra: definida na chegada"); modo misto com "Prefiro escolher a quadra". O pagamento abre com
  `allocation=capacity&sport&date&time&minutes` (sem `courtId`), monta a cadeia numa quadra livre
  com o preço do horário (`capacityChainFor`) e cota/cria sem quadra. Retomada do Pix e "Concluir
  pagamento" casam pela reserva `unassigned`. Reserva confirmada, Minhas reservas e agenda mostram
  "Quadra definida na chegada". Telas no canvas (página do atleta, abaixo das do app).

- **PR 4c** (QR da quadra na reserva): callable `checkInArenaBookingByCourtQr` (`bookingId`, `qr`
  lido). Usa o QR impresso por quadra das aulas (`arena-court-checkin-qr.ts`). Só o dono da
  reserva, de 20 min antes do início até o fim. Reserva `unassigned`: a quadra lida vira a da
  reserva (`allocationSource: "qr"`, `allocatedBy` = atleta); se for outra que a provisória, a
  reserva muda para ela pela mesma transação da troca do gestor (`moveBookingToCourt`, empurrando
  uma flutuante). Quadra ocupada por reserva definida, bloqueada, de outro esporte ou em
  manutenção: recusa e nada muda. Reserva já definida: o QR tem que ser da quadra dela. Nos dois
  casos marca o check-in (`attendanceStatus: "checked_in"`, `checkInMethod: "qr"`,
  `locationVerified: true`), que credita a gamificação pelo trigger de sempre. Recusas trazem
  `details.reason` (`qr_unknown`, `qr_invalid`, `qr_other_arena`, `court_taken`, `wrong_court`,
  `already_checked_in`, `not_allowed`). No app, a reserva numa arena que define a quadra ganha o
  card "Chegou? Leia o QR da quadra" (leitor das aulas) no lugar do "Fazer check-in"; depois
  mostra "Check-in feito" com a quadra. O topo da reserva lê a quadra do doc vivo. Telas no
  canvas (05–08, página do atleta). O portal web não lê QR (sem câmera no fluxo).
- **PR 5** (painel da arena, só portal; sem function nova): Agenda → **Por horário**
  (`/painel/agenda/horarios`; numa arena no modo capacidade a Agenda já abre nela, e "Quadras" volta
  para a grade por quadra com `?visao=quadras`). Horários do
  dia com ocupação das quadras da distribuição (reservadas / capacidade, "N sem quadra", vagas;
  capacidade não conta bloqueio, manutenção nem quadra fechada na hora). No horário escolhido:
  **Lista** (provisórias primeiro; Definir quadra/Trocar pela `changeArenaBookingCourt`; Chegou na
  janela do check-in da recepção; Faltou depois do início, escrita direta `attendanceStatus:
  "no_show"` que a rule da equipe já permite) e **Quadro** (quadras do horário; arrastar uma
  reserva para outra quadra chama a mesma callable — com provisória no destino, trocam de lugar;
  quadra definida, bloqueada, em manutenção, fechada ou de outro esporte recusa no cliente).
  **Confirmar todas** fixa as provisórias do horário na quadra que já seguram (uma chamada por
  reserva; falhas listadas no modal). Lógica pura em `painel/agenda/capacity-hours.ts`. Telas no
  canvas (04–06, página da arena).
- **O que desconta da capacidade do horário** (regra do dono, 10/11): aula fixa, reposição de
  aula, emenda de +1h, torneio e manutenção. Todos ocupam quadra específica pela trava, pelo
  bloqueio ou pela manutenção da quadra, e a capacidade é o que sobra.
  - Aula fixa e aula nova do professor (`createArenaClassLesson`) já passavam pelo
    `claimCourtLocks` (PR 2). Reposição que encaixa o aluno numa aula que já existe não usa
    quadra nova, então não desconta de novo.
  - **Emendar a aula (+1h)**: a callable `extendArenaClassSession` (`arena-class-extend.ts`)
    estica a aula na mesma quadra. Ela trava a hora a mais, estica a reserva e o `arenaSlots` da
    aula e grava `extendedMinutes`. Uma provisória na hora seguinte vai para outra quadra livre.
    Recusa com `reason: "no_vacancy"` quando há reserva definida, provisória sem outra quadra,
    bloqueio ou quadra em manutenção: **sem vaga, não marca**. Só a equipe ou o professor da
    aula com a chave "Agendar aulas" podem emendar. No app do professor fica o card "Emendar
    +1h" na aula (canvas, página Ecossistema).
  - **Torneio** virou motivo de bloqueio (`blockReason: "torneio"`, app e portal). O app antigo
    lê o valor como "Outro". O bloqueio continua tirando a quadra da capacidade e empurrando
    provisórias (`onArenaCourtBlockedRelocateFloating`).
  - **Manutenção**: o trigger `onArenaCourtMaintenanceRelocateFloating` roda quando a quadra
    passa a `maintenance`. Ele leva as provisórias dela, de hoje em diante, para outra quadra
    livre. Sem quadra livre, ficam e o log avisa.
