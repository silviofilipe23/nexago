# CRM da arena

Base de clientes da arena, contrato de cada mensalista, filas do time e conversão de avulso em
mensalista. Portal da arena → **Vendas › Clientes** (`/painel/clientes`).

Layout: canvas do Claude Design "NexaGO", página **Arena**, seção **CRM da arena** (5 artboards).

## Quem entra na base

| Fonte | O que vira | Escrita |
| --- | --- | --- |
| `arenaCrmContracts` | Contrato de mensalista registrado pela arena | CRM (callable) |
| `arenaScheduleSubscriptions` | Assinante dos Planos de horário | só leitura; cobrança continua nos Planos |
| `arenaBookings` (6 meses) | Histórico por mês, horas jogadas por semana, avulsos | só leitura |

Cliente = atleta do app (`a:<uid>`) ou cliente só com nome (`n:<nome normalizado>`, sem acento e
caixa). Reserva de aula, clubinho, torneio e reserva feita como professor ficam de fora.

## Contrato

- **Plano**: livre ou um dos Planos de horário (sugere preço e horas: vezes × duração do plano).
- **Período**: mensal, trimestral, semestral ou anual (1/3/6/12 parcelas).
- **Vencimento**: dia 5, 15 ou 25. A 1ª parcela vence no início; as outras, no dia escolhido.
- **Horas por semana** (`weeklyHours`): o mensalista **não tem horário fixo**. Ele tem um banco de
  horas por semana (seg a dom), de meia em meia hora (0,5h a 40h), e joga no dia e horário que
  quiser. Contrato antigo que guardava `timesPerWeek` vale 1h por vez (lido, nunca regravado à força).
- **Uso das horas**: soma a duração (`startTime`→`endTime`, 1h sem fim legível) das reservas da
  semana de calendário, plano e avulso, sem contar falta. A ficha mostra "esta semana: 1h30 de 3h"
  e as 8 últimas semanas; a lista mostra a média das 4 últimas semanas fechadas. Jogando mais que o
  contratado, sugere plano maior; usando menos da metade, avisa o risco de não renovar.
- **Renovar sozinho**: ligado, o período se repete até alguém cancelar. Padrão: ligado no mensal,
  desligado nos outros.
- **Pagamento**: baixa manual por parcelas (`paidInstallments` + subcoleção `payments`).
- **Renovar**: cria o contrato seguinte começando no dia depois do fim (ou hoje, se já passou) e
  liga os dois (`renewedFromId`/`renewedToId`).

## Status (calculado no dia, nunca gravado)

Na ordem de prioridade:

1. **Cancelado** — cancelado pela arena (Planos: encerrado pela arena).
2. **Inadimplente** — parcela vencida e não paga (vence no dia, atrasa no dia seguinte). Planos:
   mensalidade aberta vencida ou assinatura suspensa. Contrato que acabou devendo fica aqui.
3. **Não renovou** — contrato sem renovação automática passou do fim e não foi renovado. Planos:
   o atleta pediu para sair e a saída chegou.
4. **Vencendo** — termina em até 30 dias. Planos: saída pedida e ainda não chegou.
5. **Ativo**.

## Filas do time (aba Hoje)

- **Vencem esta semana**: mensalidade nos próximos 7 dias ou contrato terminando neles.
- **Não renovaram**: terminaram nos últimos 60 dias.
- **Inadimplentes**: do maior atraso para o menor.
- **Sem frequência**: mensalista (contrato com 14+ dias) sem jogar há 14 dias ou mais.

O botão WhatsApp abre a conversa com a mensagem pronta da fila e registra o contato; quem foi
contatado há menos de 3 dias desce para o fim da fila (esmaecido).

## Conversão (avulso → mensalista)

Oportunidade = sem contrato vivo, **6+ reservas avulsas em 90 dias** e **4+ das últimas 8 semanas**
com jogo. O CRM calcula as horas que ele já joga por semana (horas avulsas de 90 dias ÷ 13, em meia
hora, mínimo 1h) e o gasto médio mensal, e sugere o plano com as horas mais parecidas (o dia e hora em
que ele costuma jogar só desempata). Economia = gasto médio − preço do plano. A mensagem oferece o
banco de horas ("Xh por semana pra jogar quando quiser"), com 3 modelos (economia, joga quando
quiser, 1º mês com desconto), e "Fechou? Criar contrato" abre o contrato com essas horas.

## Cobrança online (Pix ou cartão)

"Cobrar online" na ficha ou na fila de inadimplentes gera um link do Asaas (fatura `UNDEFINED`: o
atleta escolhe Pix ou cartão) para 1 a 12 parcelas em aberto, a partir da próxima não paga.

- Só contrato do CRM com atleta do app: o Asaas exige CPF e o cliente Asaas mora em `users/{uid}`.
  Sem CPF guardado, o portal pede e ele fica salvo no cadastro do atleta.
- Arena precisa do pagamento online ligado e da chave Pix de repasse (mesma regra das Aulas e dos Planos).
- Um link aberto por contrato: `arenaCrmPaymentLinks/{linkId}` (`externalReference`
  `arenaCrmPayment:{linkId}`), espelho em `contract.onlineLink`. Pedir o mesmo link devolve o aberto;
  outro número de parcelas apaga o anterior no Asaas.
- Pago: o webhook dá baixa nas parcelas (`payments` com `method: online`) e credita o caixa da arena
  com a mesma taxa e as mesmas fases da mensalidade dos Planos (Pix credita no `RECEIVED`; cartão vai
  para o "a liberar" no `CONFIRMED`). Baixa manual, edição ou cancelamento do contrato apagam o link;
  se for pago mesmo assim (corrida), estorna.
- Webhook perdido: o agendador das 9h confere os links abertos no Asaas antes dos lembretes.
- Os lembretes de cobrança e as mensagens de WhatsApp da fila levam o link quando ele cobre a parcela.

## Lembretes automáticos

Agendador `sendArenaCrmReminders`, todo dia às 9h (São Paulo). Push no app só para contrato do CRM com
atleta do app; assinantes dos Planos de horário já têm os lembretes da cobrança deles.

| Interruptor | Quando | Mensagem |
| --- | --- | --- |
| Mensalidade vencendo | 3 dias antes e no dia | vence em dd/mm / vence hoje |
| Mensalidade atrasada | +1 e +7 dias da parcela mais antiga | está em aberto desde dd/mm |
| Contrato terminando | 15 e 3 dias antes (só sem renovação automática) | fale com a arena para renovar |
| Sentimos sua falta | 14+ dias sem jogar, uma vez por sumiço | suas horas estão te esperando |
| Resumo do dia | dono e gestores ativos, se houver algo na fila | vencem, atrasaram, sumiram, prontos pra plano |

- Um push por dia por contrato: o mais urgente (atraso > vence hoje > renovação > vence em breve > sumiço).
- Dias exatos: se o agendador falhar num dia, aquele marco passa.
- Idempotente: `arenaCrmReminders/{contrato}_{tipo}_{data}` é criado com `create` antes do push
  (no máximo uma vez). O sumiço usa a data do último jogo no id: só repete se ele voltar e sumir de novo.
- Interruptores em `arenas/{id}/crmSettings/main.reminders` (ausente = ligado).
- Efeito na aba Hoje (7 dias): pagaram a parcela lembrada, renovaram, voltaram a jogar. A fila mostra
  "Lembrete automático" quando ele é mais novo que o último contato humano (e não desce o cliente).

## Cache da visão geral

O caro é ler 6 meses de reservas e o perfil de cada atleta. Isso vira estatística por cliente e
identidade (nome, foto, telefone) em `arenaCrmCache/{arenaId}/shards/{i}` (400 clientes por shard),
válido no mesmo dia por 30 min (`arena-crm-cache.ts`). Contratos, mensalidades, contatos e lembretes
continuam ao vivo: o que a equipe faz no CRM aparece na hora; reserva nova, em até 30 min.
"Atualizar" força a releitura (no máximo a cada 2 min). O cabeçalho mostra "reservas de HH:MM".
O formato tem versão (`CACHE_VERSION`): mudou o que vai no cache, sobe a versão e o velho é ignorado.

## KPIs

- **Receita recorrente**: soma das mensalidades dos contratos vivos no dia (pausado não conta;
  contrato que acabou devendo é cobrança, não recorrência) + série dos 6 meses.
- **Dinheiro em risco**: mensalidade de quem está inadimplente, vencendo ou sem frequência.
- **Renovação 90 dias**: contratos fechados que terminaram nos últimos 90 dias e foram renovados.
- **Funil 90 dias**: jogaram avulso → frequentes → receberam oferta → viraram mensalista.
- **Meta do mês**: novos mensalistas no mês (`arenas/{id}/crmSettings/main.monthlyGoal`, padrão 5).

## Meu contrato (app do atleta)

O mensalista vê o próprio contrato no app: plano, valor, vencimento, período, próxima mensalidade,
parcelas (as 2 últimas pagas, as em aberto e as próximas), pagamentos e o banco de horas da semana
(o que já reservou até domingo, de 8 semanas). Em atraso, o valor em aberto vai pro topo; com o link
de pagamento aberto pela arena, "Pagar · Pix ou cartão" abre a fatura (baixa automática). Sem link,
pagar na arena, com "Falar com a arena" (WhatsApp da arena com a mensagem pronta).
Layout no canvas nexaGO, página App do Atleta, seção "Meu contrato".

- Rota `/meu-contrato?id=<contrato>`; entradas: **Sua conta → Meu contrato** (só com contrato) e
  **Cobranças** (tipo "Mensalidade": o atraso todo, ou a próxima quando vence em até 10 dias; o contrato
  também em Planos e assinaturas).
- O atleta vê: contratos não cancelados em vigor (ativo/vencendo, não substituídos pela renovação) e
  qualquer um com dívida. Nunca vê a anotação interna, o motivo de cancelamento nem quem registrou.
- **Push**: os lembretes (`arena_crm_*`, menos o resumo do gestor) levam `contractId`; o app novo abre
  Meu contrato pelo tipo. O `url` continua `/arena/{id}` porque o app antigo da loja só lê `url`.
- **Espelho** `arenaCrmMembers/{uid}` (`contractIds` não cancelados), mantido pelo gatilho
  `onArenaCrmContractWrittenSyncMember`: o app lê esse doc (uma leitura) para decidir se mostra o menu e
  se chama a callable. Contratos anteriores ao gatilho: `functions/scripts/backfill-arena-crm-members.js`.

## Backend

`functions/src/arena-crm-model.ts` (puro, testado) e `functions/src/arena-crm.ts`:

- `getArenaCrmOverview({arenaId})` — base, filas, KPIs e planos (área `agenda`, leitura).
- `getArenaCrmCustomer({arenaId, customerKey})` — contratos, pagamentos, contatos e reservas.
- `updateArenaCrm({arenaId, op, ...})` — `saveContract`, `cancelContract`, `renewContract`,
  `registerPayment`, `logContact`, `saveSettings` (área `agenda`, escrita).
- `getMyArenaContracts()` (`arena-crm-athlete.ts`) — os contratos do próprio atleta (Meu contrato).

Rules negam o cliente em `arenaCrmContracts` (e `payments`), `arenaCrmContacts`, `arenaCrmReminders`, `arenaCrmPaymentLinks` e `arenaCrmCache` (com `shards`); `arenaCrmMembers/{uid}` só o dono lê.
Índices: `arenaCrmContacts (arenaId, at)`, `arenaCrmReminders (arenaId, sentAt)` e `arenaBookings (arenaId, athleteId, date)`.

Deploy: índices → functions (4 callables + `sendArenaCrmReminders` + `onArenaCrmContractWrittenSyncMember` + `asaasWebhook`) → rules → backfill do espelho → portal da arena → app (build da loja).
O `asaasWebhook` roteia vários produtos: só deployar de uma árvore em dia com a main.
