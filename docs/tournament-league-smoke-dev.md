# Smoke manual — torneios e ligas (dev)

Projeto Firebase: **`volley-track-dev-4596c`**

Checklist operacional para validar o fluxo end-to-end após mudanças em competições. Marque **Pass** ou **Fail** e anote o ID do torneio/liga usado.

## Pré-requisitos

- App Flutter apontando para `volley-track-dev-4596c` (`flutter run` com flavor dev).
- Conta **organizador** com permissão no torneio de teste.
- Conta **atleta** secundária (dupla / PIX).
- Functions e rules deployados na mesma revisão que o app.

## 7 passos

| # | Passo | Como validar | Pass | Fail se |
|---|-------|--------------|------|---------|
| 1 | Publicar torneio `open` | Organizador publica; atleta abre **Competir** | ☐ | Draft visível ou ausente na lista |
| 2 | Inscrever dupla + PIX | Fluxo convite/PIX até confirmação | ☐ | `isPaid` setado pelo cliente ou inscrição sem pagamento |
| 3 | Gerar chave | Organizador gera bracket na categoria | ☐ | Matches não ficam `Scheduled` ou status legado inconsistente |
| 4 | Agendar + `callMatchToCourt` | Partida na quadra; push/G1 mostra ao vivo | ☐ | `liveMatchesNow` ou status não refletem partida em quadra |
| 5 | I1 ponto a ponto | Registrar pontos até `Completed` | ☐ | `pointEvents`, placar final ou XP não disparam |
| 6 | J2 link público | Abrir link read-only da partida | ☐ | 404, auth indevida ou placar desatualizado |
| 7 | Encerrar inscrições | Fechar categoria/torneio | ☐ | Atleta ainda consegue iniciar nova inscrição |

## Extensões liga (após passos 1–7 em etapa de liga)

| # | Passo | Como validar | Pass | Fail se |
|---|-------|--------------|------|---------|
| L1 | Publicar liga + etapa | Etapa vinculada aparece `open` (não `draft`) | ☐ | Torneio da etapa permanece draft após publish da liga |
| L2 | Final da etapa | Encerrar final da categoria na etapa | ☐ | `leagueTeamRankings` não atualiza 1º/2º |
| L2b | 3º lugar / quartas | Encerrar Third Place e QF | ☐ | 3º/4º ou `quarters` não pontuam |
| L2c | Fase de grupos | Primeira partida mata-mata encerrada | ☐ | Equipes só de grupos não recebem `groups` |
| L3 | Ranking na liga | Atleta abre detalhe da liga | ☐ | Ranking vazio após final ou pontos ignoram best-N |
| L3b | Ranking atletas | Alternar para aba **Atletas** | ☐ | Pontos não espelham duplas |
| L4 | Best-N | Liga com `best_4_of_6` e 5+ etapas simuladas | ☐ | `effectivePoints` ≠ soma das 4 melhores etapas |
| L5 | Dupla eliminação | Encerrar última LB + Final | ☐ | 3º/4º da LB não pontuam; 1º/2º na Final |

## Registro da execução

```markdown
## Smoke — [data] — [revisão/branch]

Executor:
Ambiente: volley-track-dev-4596c

Torneio teste ID:
Liga teste ID:

| Passo | Resultado | Observação |
|-------|-----------|------------|
| 1 | | |
| 2 | | |
| ... | | |

Bloqueadores encontrados:
```

## Comandos úteis

```bash
# Deploy rules + functions críticas (ajuste conforme diff)
firebase deploy --only firestore:rules,functions:applyLeagueRankingForMatch,functions:generateCategoryBracket,functions:declareMatchWalkover --project volley-track-dev-4596c

# Testes automatizados relacionados
cd functions && npm test
cd nexago_app && flutter test test/features/tournaments/league_ranking_logic_test.dart
```

## Referências

- Skill compartilhada: `.cursor/skills/tournament-league-audit/SKILL.md`
- Schema: `docs/tournaments-firestore-schema.md`
