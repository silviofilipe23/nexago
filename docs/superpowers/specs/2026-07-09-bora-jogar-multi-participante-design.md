# Bora Jogar — convite para múltiplas pessoas (N participantes)

## Contexto

Hoje o "Bora Jogar" (`friendlyMatches/{id}`, código em
`nexago_app/lib/features/friendly_match/` e
`functions/src/friendly-match-*.ts`) é inteiramente 1:1: um doc por convite,
com `fromUid`/`toUid` fixos. O mesmo doc carrega **todo** o ciclo de vida do
jogo, não só o convite:

- Convite: `sent` → (`countered` opcional) → `confirmed` / `declined` /
  `expired` / `cancelled`.
- Dia do jogo: check-in mútuo (`friendly-match-checkin.ts`) — só vira
  `completed` quando **os dois** fazem check-in; se a janela fecha sem isso,
  `no_show` (penaliza reputação só quando **exatamente um** faltou — regra
  pensada pra não confundir "ninguém apareceu" com "os dois esqueceram").
- Avaliação (`friendly-match-review.ts`): double-blind — cada lado avalia o
  outro, e o reveal só acontece quando **os dois** avaliaram (ou o prazo
  vence).
- Reputação (`friendly-match-reputation.ts`): ledger por usuário, já
  genérico por uid (não é limitação aqui).

Ou seja: check-in, no-show e avaliação são hard-coded para exatamente 2
pessoas — não é só a tela de convite que assume um par.

A feature está em produção **apenas no dev** (`enabled=true` no dev,
`enabled=false` em prod; QA e2e 29/29 feito 08/07). Não há dados reais de
usuário em jogo — os docs existentes no dev são de QA e podem ser
descartados.

## Decisão

Generalizar o modelo do zero para suportar **N participantes** por jogo (ex.:
fechar uma dupla de vôlei de praia/beach tennis = 4 pessoas no total), com o
convite 1:1 de hoje passando a ser o caso especial `slotsTotal = 1` do mesmo
modelo — não dois sistemas paralelos.

Decisões de produto que moldam o desenho (validadas em brainstorming):

1. O organizador já escolhe todos os N convidados de uma vez, na criação do
   jogo (sem "sala vazia" que se preenche aos poucos por iniciativa alheia).
2. É um **pool único** de vagas — não há atribuição de time (Time A/Time B)
   no momento do convite.
3. Aceite é parcial: quem aceita fica confirmado; quem recusa libera a vaga.
   O jogo fecha (`confirmed`) assim que todas as vagas tiverem alguém
   aceitando — **não** depende de todo mundo do convite original ter
   respondido.
4. Só o **organizador** pode convidar alguém para preencher uma vaga aberta
   (recusada ou nunca preenchida).
5. O número de vagas é sugerido pelo esporte e editável pelo organizador.
6. Contraproposta de horário/local só existe quando `slotsTotal == 1` (o
   caso 1:1). Para N > 1 o convidado só aceita ou recusa o horário/local já
   definidos.
7. Check-in: `completed` exige check-in de **todos** os N participantes
   (generalização direta da regra unânime atual).
8. No-show: se **≥1** participante fez check-in, todo ausente é penalizado
   (o jogo claramente ia acontecer). Se **zero** fizeram check-in, ninguém é
   penalizado (mesma ambiguidade de hoje, agora em escala de grupo).
9. Avaliação: cada participante avalia cada um dos outros N-1
   individualmente (preserva o vínculo avaliação↔reputação por atleta).
   Reveal double-blind passa a ser **por par** — a nota de A sobre B só
   aparece pra B quando B também avaliar A (ou o prazo vencer), sem esperar
   o grupo inteiro terminar.

## Escopo

### Dentro do escopo

- Novo schema do doc `friendlyMatches/{id}`: `organizerUid` +
  `slots[]` + `participantUids[]` no lugar de `fromUid`/`toUid`.
- Nova máquina de estados do jogo (substitui `sent`/`countered`/`declined`/
  `expired` como estados do jogo — viram estados de **vaga**; ver
  "Máquina de estados").
- Callables reescritas: enviar/aceitar/recusar convite de vaga, cancelar
  jogo — operando sobre slots em vez do par fixo.
- Check-in, fechamento de no-show e avaliação generalizados para N
  participantes (regras 7–9 acima).
- Sweepers ajustados (expiração por vaga, lembretes, fechamento de
  check-in, reveal de avaliação) + sweeper novo para jogo que nunca fechou
  as vagas a tempo (`unfilled`).
- UI Flutter: seletor multi-atleta na criação, número de vagas sugerido por
  esporte (editável), tela do jogo mostrando status de cada vaga com opção
  de repor vaga aberta, fluxo de avaliação sequencial (N-1 avaliações).
- Reescrita das suítes de teste do backend (`friendly-match-*.test.ts`) e
  dos testes Flutter afetados.

### Fora do escopo

- Vagas com time atribuído (Time A/Time B) no convite — fica pool único por
  decisão de produto (item 2). Pode virar uma spec futura se for pedido.
- Qualquer um além do organizador convidar para vaga aberta (item 4) — sem
  "convite viral" nesta rodada.
- Migração de dados existentes no dev (`friendlyMatches` de QA) — são
  descartados, não migrados, porque a feature nunca foi pra prod.
- Painel web/organizador — "Bora Jogar" é só athlete-to-athlete no app
  mobile; nada muda no `frontend/`.
- Chat de grupo entre participantes do mesmo jogo — não existe hoje nem
  para o par, não entra aqui.

## Arquitetura

### Modelo de dados — `friendlyMatches/{id}`

Campos que mudam de nome/forma (o resto — `sport`, `objective`,
`scheduledAt`, `alternativeTimes`, `location`, `message`, `history`,
`createdAt`/`updatedAt`, campos de check-in/review/cancelamento — mantém
formato e semântica já existentes):

```
organizerUid, organizerName, organizerPhotoUrl   // substitui fromUid/fromName/fromPhotoUrl
slotsTotal: number                                // vagas além do organizador; 1 = caso hoje
slots: FriendlySlot[]                             // length == slotsTotal
participantUids: string[]                         // organizerUid + uids com slot 'accepted'
                                                   // fixado no instante em que status vira 'confirmed'
```

`FriendlySlot`:

```
{
  uid: string,
  name: string,
  photoUrl: string | null,
  status: 'invited' | 'accepted' | 'declined' | 'expired',
  invitedAt: Timestamp,
  respondedAt: Timestamp | null,
  expiresAt: Timestamp,        // expiração individual da vaga (mesma config de hoje)
  counterProposal: {...} | null, // só pode existir quando slotsTotal == 1
}
```

Não existe um estado "vaga vazia": toda vaga sempre tem um `uid` — na
criação (regra 1) e depois de qualquer recusa/expiração, até o organizador
repor. "Vaga aberta" (linguagem de produto) é só a leitura de UI para
`status: declined | expired` — o uid anterior continua visível ali (quem
recusou, quando) até o organizador repor. Repor a vaga **sobrescreve** o
mesmo registro (`uid`/`name`/`photoUrl`/`invitedAt`/`expiresAt` novos,
`status` volta a `invited`, `respondedAt: null`) — não cria um slot novo.

`toUid`/`toName`/`fromUid`/`fromName` deixam de existir no schema novo —
todo o app e as functions passam a ler `organizerUid`/`slots`/
`participantUids`. Não há necessidade de campos de compatibilidade porque
não há dados de produção a preservar.

### Máquina de estados do jogo

```
filling     → confirmed | cancelled | unfilled
confirmed   → cancelled | no_show | completed
completed   → reviewed
unfilled, cancelled, no_show, reviewed   (terminais)
```

- **`filling`** substitui `sent`/`countered`: pelo menos uma vaga ainda não
  foi aceita. Único estado onde slots individuais transitam
  `invited → accepted/declined/expired`, e uma vaga `declined`/`expired`
  não derruba o jogo — só fica visualmente "aberta" até o organizador repor
  (ver "Modelo de dados").
- **`confirmed`**: todas as `slotsTotal` vagas em `accepted`.
  `participantUids` é congelado neste instante.
- **`unfilled`** (estado novo): `scheduledAt` chegou com o jogo ainda em
  `filling`. Não existe hoje porque no 1:1 a expiração do único convite já
  resolve isso num prazo fixo pós-envio; com N vagas o organizador pode
  ficar repondo vagas indefinidamente, então precisa de um limite atado ao
  horário real do jogo.
- **`declined`/`expired` deixam de ser estados do jogo** — viram apenas
  valores de `slot.status`.
- Daqui pra frente (`confirmed` → …) a máquina é a mesma de hoje, só que as
  regras de transição (abaixo) iteram `participantUids` em vez do par fixo.

### Fluxos

**Criação:** organizador seleciona sport/objetivo/horário/local (igual
hoje) + N atletas (multi-seleção; número de vagas pré-sugerido pelo
esporte, editável). Uma callable cria o doc com `slotsTotal = N`,
`slots` todas em `invited` (uma por atleta escolhido, cada uma com seu
`expiresAt`), status `filling`. Notificação de convite disparada para cada
atleta escolhido (mesmo texto de hoje, um push por pessoa).

**Aceitar/recusar vaga:** callable identifica a vaga do `uid` chamador
dentro de `slots`. Aceitar marca `accepted` e adiciona o uid a
`participantUids`; se todas as vagas ficarem `accepted`, status vira
`confirmed` (dispara a mesma notificação "Deu match!" de hoje, agora para
todos os `participantUids`). Recusar marca `declined` (uid permanece no
registro, só para exibição/histórico) — notifica só o organizador ("Fulano
recusou, escolha outra pessoa pra vaga").

**Repor vaga aberta:** callable exclusiva do organizador, recebe
`slotId`/índice + novo `uid`; só aceita se a vaga estiver `declined` ou
`expired` e o jogo ainda em `filling`. Sobrescreve o registro do slot
(`uid`/`name`/`photoUrl`/`invitedAt`/`expiresAt` novos, `status: invited`,
`respondedAt: null`). Mesma checagem de "convite pendente" de hoje
(`hasPendingInviteBetween`), adaptada para "esse uid já tem uma vaga
`invited` neste match".

**Cancelamento:** igual hoje — organizador pode cancelar enquanto
`filling`; qualquer participante pode cancelar um jogo `confirmed` (com
penalidade de cancelamento tardio, mesma janela de configuração).

**Check-in / no-show:** ver regras de produto 7–8. `completed` dispara
reputação (`match_completed`) para todos os `participantUids`, igual hoje
mas para N pessoas.

**Avaliação:** ver regra 9. Estrutura de avaliações privadas muda de
`privateReviews/{reviewerUid}` (1 doc por avaliador, já que só havia 1
avaliado possível) para `privateReviews/{reviewerUid}_{revieweeUid}` (1 doc
por par avaliador→avaliado). Campo público `reviews` vira mapa aninhado
`{ [reviewerUid]: { [revieweeUid]: { stars, tags?, comment? } } }`. O reveal
por par roda tanto no submit (se o par já tiver as duas notas, revela
imediato) quanto no sweeper de prazo (revela o que existir de cada par,
igual à lógica de timeout de hoje). `reviewReceivedEventId` passa a incluir
`revieweeUid` (`review_received_{matchId}_{reviewerUid}_{revieweeUid}`),
porque agora um `matchId+reviewerUid` não identifica mais uma nota única.
Status do jogo vira `reviewed` quando todos os pares tiverem revelado (por
reveal mútuo ou por prazo vencido).

### Sweepers e notificações

- **Expiração de vaga** (era: expiração do convite): roda por vaga, não por
  jogo. Vaga `invited` com `expiresAt` vencido vira `expired` (uid
  permanece no registro); notifica só o organizador.
- **`unfilled`** (novo sweeper): jogos em `filling` com `scheduledAt` no
  passado viram `unfilled`; notifica organizador + quem já tinha aceitado.
- **Lembretes 24h/2h, fechamento de check-in, reveal de avaliação**: mesma
  mecânica e mesmos campos (`reminder24hAt`, `checkInCloseAt`,
  `reviewRevealAt`), só que os loops de notificação percorrem
  `participantUids` em vez do par `fromUid`/`toUid`.

### UI (Flutter)

- `friendly_match_invite_builder_page.dart`: troca os parâmetros únicos
  `toUid`/`toName` por uma lista de atletas selecionados; adiciona um passo
  (ou seção) de "quantas vagas" com sugestão por esporte.
- Tela de detalhe do jogo (existente, adaptada): lista as vagas com estado
  visual (confirmado / convidado / aberta) e, se o usuário for o
  organizador, ação de "convidar" na vaga aberta.
- Fluxo de avaliação pós-jogo: passa a percorrer N-1 telas/steps (uma
  avaliação por outro participante) em vez de uma única.
- Qualquer texto/label hoje condicionado a `FriendlyMatchStatus.sent` /
  `.countered` passa a checar `filling` + `slotsTotal` (para decidir entre
  "Aguardando resposta" no caso N=1 e "Faltam X vagas" no caso N>1).
- `FriendlyMatch.fromDoc` (`friendly_match_models.dart`) reescrito para o
  novo schema; `isParticipant`/`otherUid`/`otherName`/`responderUid` (hoje
  assumem exatamente 2) são substituídos por equivalentes baseados em
  `participantUids`/`slots`.

## Dados de dev

Os docs de `friendlyMatches` já existentes no dev (schema antigo, de QA)
não são migrados — são descartados antes do rollout desta mudança no dev
(não é dado real de usuário).

## Fora do documento (decisões de implementação livres)

- Nome exato dos novos campos/índices do Firestore além dos citados aqui.
- Estrutura exata das telas de multi-seleção de atletas e de avaliação
  sequencial (layout/componentes Flutter específicos).
- Se `unfilled` deve ou não permitir alguma ação de recuperação (ex.:
  reabrir prazo) — nesta rodada é terminal, sem reabertura.
