# Financeiro do painel da arena — dados reais

## Contexto

O painel Angular da arena (`frontend/projects/arena`) foi construído a partir de um protótipo visual (spec `2026-07-09-arena-painel-web-design.md`), com todas as 7 telas em dados mock. Desde então, Quadras, Comandas/Estoque e Perfil já foram migradas para dados reais, seguindo o mesmo padrão: um `*-repository.ts` com o SDK cru do Firestore, espelhando 1:1 o repositório equivalente do app Flutter.

O backend de pagamentos da arena já está pronto e em produção do lado do app: carteira (`arenaWallets/{arenaId}` + subcoleção `ledger`), saque via PIX/Asaas (`arenaWithdrawals`, callable `requestArenaWithdrawal`), e taxa de plataforma de 5% sobre reservas (isenta para planos Pro/Parceiro) — ver `docs/product/planos-de-pagamento.md` seção 6. A tela `panel-finance.component.ts` e `panel-finance-reports.component.ts` continuam 100% mock (arrays hardcoded), sem nenhuma referência a `arenaWallets`/`arenaWithdrawals`/`ledger` no projeto Angular.

Este design conecta as duas telas Financeiro/Relatórios aos dados reais, sem tocar em Cloud Functions existentes (só leitura + a callable de saque que já existe).

## Decisões

- **Sem Cloud Function nova.** Toda leitura é direta ao Firestore (rules já permitem: gestor lê `arenaWallets/{arenaId}`, sua subcoleção `ledger`, `arenaWithdrawals` do próprio `arenaId`, e `arenaBookings` — leitura autenticada ampla, `firestore.rules:993`). O saque usa a callable `requestArenaWithdrawal` já existente (`functions/src/arena-booking-pix.ts:392`), sem mudança de assinatura.
- **Taxa da plataforma exibida deixa de ser fixa.** Hoje o mock mostra "6%" fixo; passa a ser 0% (Pro/Parceiro com titularidade ativa) ou 5% (Essencial), lendo o mesmo entitlement já usado no gate de planos (`arena-plan.model.ts`/`arena-context.service.ts`).
- **Chave PIX de saque passa a viver no Financeiro.** O campo `arenas/{arenaId}.payoutPixKey`/`payoutPixKeyType` já existe no backend (lido por `readArenaPayoutPixKey`, `functions/src/mercadopago-arena-helpers.ts:104`) e o gestor já pode escrevê-lo (rules só bloqueiam campos de plano, `firestore.rules:683-690`), mas nenhuma tela expõe esse campo hoje — o comentário em `arena-profile.model.ts:5` já reserva esse fluxo para cá, não para o Perfil. A tela de Financeiro ganha o campo de edição (pré-preenchido se já existir).
- **"Movimentações" junta duas fontes, sem nova query pesada.** Créditos vêm de `arenaWallets/{arenaId}/ledger` (subcoleção, `orderBy(createdAt)` simples — sem índice novo); saques vêm de `arenaWithdrawals where arenaId==X orderBy(createdAt desc)` (índice composto já existe, confirmado em `firestore.indexes.json:515-527`). Cada lançamento do ledger é enriquecido com uma leitura pontual de `arenaBookings/{bookingId}` (quadra e horário — `courtName`/`date`/`startTime`/`endTime`, campos já denormalizados no doc da reserva, sem precisar consultar `courts` à parte; não há campo de esporte na reserva, e o nome do atleta seria uma segunda consulta em `users/{athleteId}` só pra exibição — fica de fora, mostra `customerName` quando existir ou "Atleta do app"), limitado às últimas ~30 entradas — mesmo volume que o mock exibia.
- **"Recebimento por quadra", gráfico de faturamento e "Pendências" reaproveitam a mesma estratégia do dashboard do app Flutter (`arena_dashboard_service.dart:50-55`): uma única query `where('arenaId','==',arenaId).limit(256)`, sem `orderBy`, e todo o agrupamento por período/quadra/dia acontece em memória no cliente** — exatamente para não precisar de índice composto novo (uma query com igualdade num campo + `orderBy` noutro, ex. `date`, exigiria um índice que não existe hoje). Reservas com `status` cancelado (`canceled`/`cancelled`) são descartadas antes de somar (mesma regra de `_bookingStatusIsCanceled`); dentro do período de ~30 dias, `paymentStatus == 'paid'` soma em "Recebimento por quadra" (agrupado por `courtId`, campo já existe — `arena_manager_booking.dart:22`) e no gráfico por dia; `paymentStatus` pendente/parcial soma em "Pendências" (`amountReais`, `asaas-arena-booking-webhook.ts:98`). **Sem índice novo, sem deploy pendente** — essa é uma correção em relação à primeira versão deste design, que propunha uma query com `orderBy` e exigiria um índice ainda não criado.
- **Export vira CSV real, sem PDF.** "Exportar extrato" e "Gerar relatório" passam a gerar um CSV de verdade no navegador (`Blob` + download), a partir dos dados já carregados/filtrados. A opção "PDF" do seletor de formato fica desabilitada (não há gerador de PDF no backend nem lib no frontend; adicionar uma só para isso não compensa agora).
- **Métrica "Comandas" e agrupamento "Forma de pagamento" ficam desabilitados no seletor.** O mock de Relatórios oferece essas duas opções, mas nenhuma tem fonte de dado neste design — comandas/PDV é um fluxo à parte (pagamento direto no balcão, não passa pela carteira da plataforma) e não existe registro de forma de pagamento por reserva. As duas opções ficam visíveis porém desabilitadas (mesmo tratamento do formato PDF), em vez de removidas — para não mexer no layout e deixar claro que é uma limitação de dado, não uma escolha de produto.
- **"Relatórios recentes" continua existindo, mas só na sessão.** Não há onde persistir histórico de relatório gerado hoje (não é um requisito novo, é a mesma limitação que já existe para fatura/assinatura — `subscription-repository.ts:59-60` documenta que não há coleção de histórico). A lista reinicia a cada reload; isso é aceito, não é bug.
- **Sem suíte de teste nova.** Nenhum dos repositórios já convertidos (`courts-repository.ts`, `comandas-repository.ts`) tem `.spec.ts` — o único spec do painel é de função pura (`ui/agenda-grid-math.spec.ts`). Mantém o padrão: validação manual no navegador.

## Arquitetura de arquivos

```
src/app/painel/finance/
  finance.model.ts          (novo — tipos: ArenaWalletSummary, ArenaLedgerEntry,
                              ArenaWithdrawalItem, FinanceMovement, CourtRevenueRow,
                              FinancePendingSummary)
  finance-repository.ts     (novo — espelha arena_wallet_repository.dart:
                              fetchWallet, fetchLedgerEntries, fetchWithdrawals,
                              fetchCourtRevenueAndPending (where arenaId==X + limit,
                              sem orderBy — mesma estratégia de arena_dashboard_service.dart),
                              requestWithdrawal (httpsCallable requestArenaWithdrawal),
                              fetchArenaPayoutPixKey/setArenaPayoutPixKey (leitura/escrita
                              direta em arenas/{arenaId}))
  finance-export.ts          (novo — buildFinanceCsv(movements | reportRows): string,
                              downloadCsv(filename, content))
  panel-finance.component.ts        (reescrito — consome finance-repository via
                                      ArenaContextService + signals, mesmo padrão de
                                      panel-stock.component.ts)
  panel-finance-reports.component.ts (reescrito — filtros já existentes passam a
                                       reconsultar/filtrar dados reais; botão de
                                       export chama finance-export.ts)
```

Nenhuma mudança em `firestore.indexes.json` ou `firestore.rules` — todas as queries usam índices/permissões que já existem.

## Tratamento de erro e estados

- **Sem chave PIX cadastrada:** botão "Solicitar saque" some, campo de chave PIX abre em modo edição com uma instrução curta, em vez de deixar a callable falhar com `invalid-argument`.
- **Saldo insuficiente / já existe saque pendente:** a callable já cobre os dois casos com mensagens em português (`failed-precondition`, `arena-booking-pix.ts:382-386` e `:459-461`) — a tela só repassa a mensagem como erro inline, sem reimplementar a validação.
- **Arena com mais de ~256 reservas nos últimos 30 dias:** o bloco de quadra/pendências pode ficar incompleto, já que a busca por `arenaBookings` é limitada e sem ordenação (mesma limitação já aceita hoje em produção pelo dashboard do app, `arena_dashboard_service.dart:54`) — não é um problema novo introduzido por este design.
- **Reserva referenciada pelo ledger não existe mais (edge case raro):** lançamento aparece na lista sem o detalhe de quadra/atleta (só valor e data), em vez de quebrar a linha.

## Fora de escopo (explícito)

- Aprovação/rejeição de saques acima de R$500 pela equipe da plataforma (tela de backoffice separada, não é o painel da arena) — pendência já registrada em `docs/product/planos-de-pagamento.md:169`.
- Reversão de carteira em caso de estorno de reserva — gap conhecido do backend (`docs/product/planos-de-pagamento.md:172`), não é deste design.
- Geração de PDF.
