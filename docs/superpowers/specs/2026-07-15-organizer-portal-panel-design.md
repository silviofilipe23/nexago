# Portal do Organizador (web) — painel v1

**Data:** 2026-07-15
**Status:** Aprovado (execução autônoma autorizada pelo dono: "pode fazer as ações recomendadas sem ficar perguntando")

## Contexto

O scaffold + auth do portal `organizer` foram entregues hoje (spec
`2026-07-15-organizer-portal-auth-design.md`), com `/painel` guardado por
`authGuard`+`organizerGuard` e um placeholder. Esta entrega substitui o
placeholder pelo **conteúdo real do painel**, espelhando as funcionalidades
que já existem maduras no app Flutter (`nexago_app/lib/features/organizer/`).

## Escopo v1 (gestão/acompanhamento + financeiro)

1. **Shell do painel** — sidebar `og-*` (Início, Torneios, Ligas, Financeiro,
   Sair), padrão visual dos outros portais (`coach`/`arena`).
2. **Início** — cards de visão geral (Eventos ativos, Inscritos no total,
   Saldo disponível) + listas dos torneios/ligas recentes do organizador.
3. **Torneios** — lista dos torneios com `managerId == uid` (status, data,
   inscritos/capacidade); detalhe com categorias, inscritos por categoria
   (com status de pagamento) e jogos com resultados (read-only).
4. **Ligas** — lista das ligas com `managerId == uid`; detalhe com etapas e
   torneios vinculados.
5. **Financeiro** — espelho da `organizer_financial_page.dart` do Flutter:
   saldo disponível/pendente, chave PIX de saque (callable
   `setOrganizerPayoutPixKey`), extrato (ledger), lista de saques e
   solicitação de saque (callable `requestOrganizerWithdrawal`).

## Fora do escopo (fase 2)

Wizards de criação (torneio/liga/etapa — 15+12+7 telas no Flutter), operação
de categoria (gerar/regerar chaves, WO, lançar placar — `category_ops`/
`match_ops`), staff de torneio, uniformes, edição de torneio existente.
O v1 é o painel de GESTÃO; operação de quadra continua no app.

## Fonte dos dados (nenhuma mudança em rules/functions/índices)

- `tournaments/{id}` (top-level): filtrar `where('managerId','==',uid)`.
  Campos mapeados como em
  `frontend/projects/athlete/src/app/data/tournaments-repository.ts`.
- `leagues/{id}` (top-level): mesmo filtro `managerId` (campo confirmado em
  `league_create_mapper.dart:60`). Vínculo etapa→torneio conforme
  `league_stage_tournament_factory.dart`.
- Inscrições: `artifacts/{projectId}/public/data/inscriptions`
  `where('tournamentId','==',id)` (como
  `athlete/src/app/data/tournaments-repository.ts:290`).
- Jogos: `artifacts/{projectId}/public/data/matches`
  `where('tournamentId','==',id)` (como
  `athlete/src/app/data/matches-repository.ts`).
- Carteira: `organizerWallets/{uid}` (+ subcoleção `ledger` ordenada por
  `createdAt` desc) e `organizerWithdrawals where organizerId == uid`,
  callables `setOrganizerPayoutPixKey`/`requestOrganizerWithdrawal` —
  contrato exato em
  `nexago_app/lib/features/organizer/data/organizer_wallet_repository.dart`.

## Decisões

- **Reuso por cópia adaptada** dos repositories do portal do atleta (mesma
  convenção dos 5 portais: sem lib compartilhada de dados).
- **Cards do Início** = Eventos ativos (torneios com status inscrições/
  andamento), Inscritos no total (soma das inscrições dos torneios ativos) e
  Saldo disponível (carteira) — números honestos sem derivadas ambíguas.
- **Sem testes unitários novos** (convenção dos portais; verificação =
  `ng build organizer` + QA manual contra dev).
- **Streams via `onSnapshot`** apenas no Financeiro (saldo/saques mudam por
  ação do usuário); demais telas usam `getDocs` com refresh por navegação —
  padrão do portal atleta.
- Prefixo `og-*`, standalone components, signals, OnPush, rotas em português:
  `/painel` (Início), `/painel/torneios`, `/painel/torneios/:id`,
  `/painel/ligas`, `/painel/ligas/:id`, `/painel/financeiro`.

## Verificação

`ng build organizer` limpo por task; QA manual no dev ao final: login de um
organizador real → vê seus torneios/ligas/inscritos/jogos → financeiro mostra
saldo/extrato reais → solicitar saque (com saldo) cria doc em
`organizerWithdrawals`.
