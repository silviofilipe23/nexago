# CRM da arena

Base de clientes da arena, contrato de cada mensalista, filas do time e conversão de avulso em
mensalista. Portal da arena → **Vendas › Clientes** (`/painel/clientes`).

Layout: canvas do Claude Design "NexaGO", página **Arena**, seção **CRM da arena** (5 artboards).

## Quem entra na base

| Fonte | O que vira | Escrita |
| --- | --- | --- |
| `arenaCrmContracts` | Contrato de mensalista registrado pela arena | CRM (callable) |
| `arenaScheduleSubscriptions` | Assinante dos Planos de horário | só leitura; cobrança continua nos Planos |
| `arenaBookings` (6 meses) | Histórico por mês, frequência real, avulsos | só leitura |

Cliente = atleta do app (`a:<uid>`) ou cliente só com nome (`n:<nome normalizado>`, sem acento e
caixa). Reserva de aula, clubinho, torneio e reserva feita como professor ficam de fora.

## Contrato

- **Plano**: livre ou um dos Planos de horário (sugere preço e frequência).
- **Período**: mensal, trimestral, semestral ou anual (1/3/6/12 parcelas).
- **Vencimento**: dia 5, 15 ou 25. A 1ª parcela vence no início; as outras, no dia escolhido.
- **Frequência combinada**: 1x a 5x por semana (comparada com a real das reservas).
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
com jogo. O CRM detecta o horário que se repete (3+ semanas no mesmo dia e hora), calcula o gasto
médio mensal e sugere o Plano de horário que cobre esse horário com a frequência mais parecida
(economia = gasto médio − preço do plano). A mensagem tem 3 modelos (economia, horário garantido,
1º mês com desconto) e "Fechou? Criar contrato" abre o contrato preenchido.

## Lembretes automáticos

Agendador `sendArenaCrmReminders`, todo dia às 9h (São Paulo). Push no app só para contrato do CRM com
atleta do app; assinantes dos Planos de horário já têm os lembretes da cobrança deles.

| Interruptor | Quando | Mensagem |
| --- | --- | --- |
| Mensalidade vencendo | 3 dias antes e no dia | vence em dd/mm / vence hoje |
| Mensalidade atrasada | +1 e +7 dias da parcela mais antiga | está em aberto desde dd/mm |
| Contrato terminando | 15 e 3 dias antes (só sem renovação automática) | fale com a arena para renovar |
| Sentimos sua falta | 14+ dias sem jogar, uma vez por sumiço | seu horário continua garantido |
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

## Backend

`functions/src/arena-crm-model.ts` (puro, testado) e `functions/src/arena-crm.ts`:

- `getArenaCrmOverview({arenaId})` — base, filas, KPIs e planos (área `agenda`, leitura).
- `getArenaCrmCustomer({arenaId, customerKey})` — contratos, pagamentos, contatos e reservas.
- `updateArenaCrm({arenaId, op, ...})` — `saveContract`, `cancelContract`, `renewContract`,
  `registerPayment`, `logContact`, `saveSettings` (área `agenda`, escrita).

Rules negam o cliente em `arenaCrmContracts` (e `payments`), `arenaCrmContacts`, `arenaCrmReminders` e `arenaCrmCache` (com `shards`).
Índices: `arenaCrmContacts (arenaId, at)` e `arenaCrmReminders (arenaId, sentAt)`.

Deploy: índices → functions (3 callables + `sendArenaCrmReminders`) → rules → portal da arena.
