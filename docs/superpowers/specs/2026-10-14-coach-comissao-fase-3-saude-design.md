# Comissão técnica — fase 3: saúde, evolução física, acompanhamento mental e consentimento (design)

Data: 14/10/2026 · Continua `2026-10-14-coach-comissao-tecnica-rbac-design.md` (§2, §7, P2). Fases 1 (backend) e 2 (portal) já estão na `main`.

## Escopo

Entram as áreas `saude` (lesões), `fisico` (plano de evolução), `mental` (acompanhamento do psicólogo) e o **consentimento LGPD do atleta** que as protege. Ficam de fora:

- `financeiro`: o financeiro real foi feito por outro fluxo e é só do dono (`financeiro` não tem nenhum cargo de staff). Nada a fazer aqui.
- `comunicacao`: é um chat que precisa chegar ao lado do atleta (app/portal do atleta, push). Fase 4.

## Decisões

1. **Disponibilidade = o campo `status` que já existe** em `coaches/{c}/athletes/{a}` (`ativo | lesionado | afastado | ferias`): já alimenta o anel do avatar e os cards "lesionados"/"afastados" do Início, visível a toda a comissão. Abrir uma lesão põe `lesionado` (só se estava `ativo`; não sobrescreve `afastado`/`ferias`); quando a última lesão aberta é liberada/excluída e o status era `lesionado`, volta a `ativo`. Quem escreve é a callable de lesão (o fisio não tem `atletas`/write).
2. **Dado clínico exige consentimento do atleta.** Autoridade = `users/{atleta}/healthConsents/{coachUid}` (doc do atleta, escrito só por Cloud Function). O link do treinador guarda um espelho `healthConsent` só para exibição, **congelado nas rules** (nem o dono o escreve). Sem consentimento: não se cria lesão nem nota (callable nega com mensagem clara).
3. **Revogar esconde de verdade**: cada lesão/nota carrega `consentActive` (bool). As rules só deixam ler com `consentActive == true`; conceder/revogar vira o campo em lote nos registros daquele atleta (e as consultas do portal filtram por `consentActive == true`, que é o formato que as rules aceitam). Os dados não são apagados na revogação (pedido de exclusão fica para revisão jurídica).
4. **Consentimento em dois momentos**: (a) checkbox na tela de aceite do convite do treinador (`acceptCoachAthleteInvite` ganha `healthConsent` opcional — app antigo continua funcionando, vínculo fica "pendente"); (b) tela `/consentimento-saude/:coachUid` para quem já é atleta vinculado (conceder/revogar), aberta por notificação quando a comissão pede autorização (`requestHealthConsent`). Mesmo precedente de `inscription-lgpd-consent`: campo opcional no servidor, nada de backfill.
5. **`mental` (P2 resolvida)**: só o psicólogo **autor** lê o texto de uma nota; o principal vê apenas metadados (atleta, data, autor) em `wellbeingNoteMeta`, e **não escreve** notas. Escrita só por callable (`saveWellbeingNote`/`deleteWellbeingNote`), restrita ao cargo `psicologo` (o dono não entra, mesmo sendo `coachUid`).
6. **`fisico`**: metas de evolução (`goals`) com escrita direta do cliente (`coachCan(fisico)`): preparador escreve, fisio lê, dono tudo. Sem dado clínico, sem consentimento.
7. Trilha de auditoria v1: `createdBy/updatedBy/updatedAt` nos registros clínicos (preenchidos pela callable). **Log de leitura fica de fora**: a leitura é direta no Firestore; registrar leituras exigiria passar por callable (fase posterior, junto da revisão jurídica).

## Modelo de dados

```
users/{atleta}/healthConsents/{coachUid}     { granted, termVersion, coachName, updatedAt }   (leitura: o próprio; escrita: function)
coaches/{c}/athletes/{a}.healthConsent        { granted, termVersion, at }                     (escrita: function; congelado nas rules)
coaches/{c}/injuries/{id}                     { athleteUid, type, occurredOn, forecastOn, doctor, status, notes, consentActive, createdBy, createdAt, updatedBy, updatedAt }
coaches/{c}/goals/{id}                        { athleteUid, title, fundamento, deadline, notes, status, createdAt, updatedAt }
coaches/{c}/wellbeingNotes/{id}               { athleteUid, authorUid, body, consentActive, createdAt, updatedAt }
coaches/{c}/wellbeingNoteMeta/{id}            { athleteUid, authorUid, createdAt, updatedAt }  (mesmo id da nota)
```

## Rules (resumo)

- `injuries`: `read` = `coachCan(c,'saude',false) && resource.data.get('consentActive', false) == true`; `write: false`.
- `goals`: `read`/`write` = `coachCan(c,'fisico', false|true)`.
- `wellbeingNotes`: `read` = `resource.data.get('authorUid','') == request.auth.uid && consentActive == true` (**não** usa `coachCan`: o dono não lê o texto); `write: false`.
- `wellbeingNoteMeta`: `read` = `coachCan(c,'mental',false)` (dono e psicólogo); `write: false`.
- `athletes`: `create`/`update` do dono continuam, mas **sem tocar** `healthConsent` (`diff().affectedKeys()`); `delete` como hoje.
- `users/{u}/healthConsents/{coachUid}`: leitura do próprio; escrita false.

## Matriz de cargos

Sem mudança para os cargos de staff (o teste de paridade segue valendo). Exceção só no portal/functions: o **principal não escreve `mental`** (`roleCanAccess('principal','mental','write') === false`) — as callables de nota exigem staff `psicologo`.

## Texto do termo

`HEALTH_TERM_VERSION = "2026-10"` em `functions/src/health-consent.ts` e `health-term.ts` do portal (duplicado de propósito; o teste de paridade compara as versões). **O texto precisa de revisão jurídica antes de produção.**
