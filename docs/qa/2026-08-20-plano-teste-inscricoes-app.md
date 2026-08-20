# Plano de teste — Inscrições no app (QA sênior)

**Data:** 20/08/2026 · **Branch:** `claude/app-inscricoes-test-plan-a78cd2`
**Objetivo:** garantir que a criação de inscrição em torneio pelo app funcione em
**todas** as combinações de formato (dupla/trio/quarteto/quinteto), gênero
(masculino/feminino/misto/livre/composição exata), caminho de entrada (solo,
convite, link externo, capitão+elenco) e estado do torneio/categoria/perfil.

## Onde as regras realmente moram

| Camada | Arquivo | O que decide |
|---|---|---|
| App (UI/estado) | `tournament_registration_page.dart`, `registration_shell_logic.dart` | qual cartão aparece, o que está habilitado, qual callable é chamada |
| App (pré-validação) | `category_*_eligibility.dart`, `tournament_category_spots.dart` | selo/bloqueio da categoria antes de chamar o servidor |
| Backend (verdade) | `tournament-partner-invite.ts`, `tournament-team-registration.ts`, `tournament-registration-guards.ts`, `category-*-eligibility.ts`, `tournament-team-category.ts`, `tournament-solo-registration.ts` | cria/recusa a inscrição de fato |

A pré-validação do app **não é garantia**: quem decide é a callable. Por isso o
plano ataca as duas camadas separadamente e depois as junta no E2E.

## Matriz de variáveis

**A. Formato da categoria** — dupla (sem `teamSize` / `teamSize: 2`), trio (3),
quarteto (4), quinteto (5).

**B. Gênero** — masculina (`genderType: male`), feminina (`female`), mista de
dupla (`mixed` → exige 1H+1M), equipe livre (`genderMode: free`), equipe com
composição exata (`{men, women}`, ex. 2H+2M, 3H+1M, 4H+1M), categoria sem
declaração de gênero.

**C. Caminho de entrada**
1. reserva solo → convite → aceite
2. os dois reservaram solo → aceite funde (attach) e libera a outra reserva
3. convite direto sem reserva prévia → aceite cria (create)
4. convite por link externo (token) → cadastro → claim → aceite
5. capitão cria equipe nomeada → convida N-1 → aceites até fechar o elenco
6. recusa / cancelamento de convite / convite expirado
7. integrante sai da equipe · capitão cancela a inscrição

**D. Gates** — perfil incompleto (onboarding/WhatsApp/cidade), nível (teto e
piso), idade (`min`/`max`/`range`/referência), gênero declarado × ausente,
torneio (`draft`/`programado`/`cancelado`/`closed`/prazo aberto ou vencido),
categoria (`registrationClosed`, `isCompleted`, lotada com e sem fila).

**E. Uniforme** — `none`, `top_only`, `full`, nome/número na camisa, tamanhos
custom, auto-save pós-inscrição, uniforme viajando no convite.

**F. LGPD** — aceite no solo, na criação de equipe, no convite (convidante) e no
aceite (convidado); inscrição legada sem aceite.

**G. Conflitos** — já inscrito (solo e dupla), par repetido, convite duplicado,
auto-convite, convidado já na equipe, equipe completa, nome de equipe repetido,
duas reservas pagas.

## Estratégia de execução

**Camada 1 — integração real das callables contra o emulador do Firestore.**
Um harness novo (`functions/test/registration-matrix.test.mjs`) sobe o emulador,
semeia torneio/categorias/atletas e executa as callables de verdade
(`registerSoloTournament`, `sendTournamentPartnerInvite`,
`acceptTournamentPartnerInvite`, `createTournamentTeamRegistration`,
`leaveTournamentTeamRegistration`, `cancelTournamentRegistration`,
`createExternalPartnerInvite`/`claimExternalPartnerInvite`), conferindo o estado
final em `inscriptions`/`teams`/`tournamentRegistrationInvites`.
É aqui que a matriz inteira roda.

**Camada 2 — testes de widget do app.** Cada estado do cartão "Sua inscrição"
por tipo de categoria, com a callable dublada: garante que o app chama a coisa
certa com os argumentos certos e mostra o estado certo.

**Camada 3 — E2E em dois simuladores.** Dois atletas reais, app real, para os
caminhos principais: dupla (convite + aceite), equipe (capitão + integrante) e
dupla mista. Prova a fiação app↔backend que nenhuma das outras camadas cobre.

## Critério de pronto

- Camada 1 e 2 verdes, sem teste pulado.
- Todo bug encontrado: corrigido **ou** registrado no relatório com risco e
  decisão explícita do dono.
- Camada 3 com evidência (screenshot) por caminho.
