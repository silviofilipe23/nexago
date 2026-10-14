# Portal do treinador — RBAC da comissão técnica (design)

Data: 14/10/2026 · Status: **proposta, aguardando decisão nas 4 perguntas abertas**

Hoje a tela `painel/permissoes` é mock (5 cargos fixos, dados de exemplo). O backend só conhece
**um** papel: o dono. `coaches/{coachUid}/**` tem `allow read, write: if auth.uid == coachUid`, e todo
serviço do portal usa `auth.user().uid` como `coachUid`. Este desenho transforma os 5 cargos em
acesso real, espelhando o RBAC da arena (`2026-07-31-arena-equipe-rbac-design.md`).

## 1. Cargos

| Cargo | Chave | Vínculo |
|---|---|---|
| Treinador principal | — (o dono, `uid == coachUid`; **não** é gravado) | implícito |
| Auxiliar | `auxiliar` | `staff/{uid}` |
| Preparador físico | `preparador_fisico` | `staff/{uid}` |
| Fisioterapeuta | `fisioterapeuta` | `staff/{uid}` |
| Psicólogo | `psicologo` | `staff/{uid}` |

O principal ser implícito evita o estado "treinador sem dono" e dispensa transferência de titularidade
na v1.

## 2. Áreas e matriz (leitura = r, escrita = w)

Áreas por **dado**, não por tela — a tela herda a área do que ela lê/escreve.

| Área | Dados | principal | auxiliar | prep. físico | fisio | psicólogo |
|---|---|---|---|---|---|---|
| `atletas` | `athletes`, `squads` | rw | r | r | r | r |
| `treinos` | `trainings` (agenda, série) | rw | rw | r | r | — |
| `presenca` | presença dentro de `trainings` | rw | rw | r | r | — |
| `convocacoes` | `callUps` | rw | rw | — | — | — |
| `avaliacoes` | `evaluations` (técnicas) | rw | r | r | — | — |
| `fisico` | plano de evolução física (novo) | rw | — | rw | r | — |
| `saude` | lesões, histórico clínico (novo) | rw | — | — | rw | — |
| `mental` | notas de acompanhamento (novo) | ver P2 | — | — | — | rw |
| `comunicacao` | avisos (novo) | rw | rw | — | — | — |
| `financeiro` | pagamentos/planos (novo) | rw | — | — | — | — |
| `equipe` | `staff`, convites | rw | — | — | — | — |

`presenca` mora dentro do doc de `trainings`; hoje é um campo no mesmo doc. Como rule não separa
campo por área sem lista explícita, `presenca` exige a guarda de campos da seção 5 — ou mover a
presença para subcoleção `trainings/{id}/attendance` (preferível: a rule fica trivial).

### Disponibilidade vs. clínico

Preparador e auxiliar precisam saber **quem pode treinar**, não o diagnóstico. Separar:

- `athletes/{id}.availability` ∈ `apto | restrito | afastado` — lido por toda a comissão, escrito
  por `saude` (fisio) e pelo principal.
- `coaches/{c}/injuries/{id}` — detalhe clínico, só `saude`.

## 3. Modelo de dados

```
coaches/{coachUid}/staff/{memberUid}     { role, displayName, invitedBy, createdAt }
coachStaffInvites/{inviteId}             { coachUid, role, status, expiresAt, createdBy, acceptedBy? }
users/{uid}/coachStaff/{coachUid}        { role, coachName }   ← espelho por trigger
coaches/{c}/injuries, fisico, wellbeingNotes, announcements   (novos, por área)
```

- **Convite por link**, id aleatório, validade 7 dias — como na arena (não há infra de e-mail
  transacional). E-mail **não** é verificado: risco aceito conscientemente, igual à arena.
- **Escrita em `staff`, convites e espelho só por Cloud Function** (`write: false` no client), como
  `coachAthleteInvites`. Nem o dono grava `staff` direto: aceite, troca de cargo e remoção precisam ser
  transação (convite + vínculo + espelho).
- O espelho `users/{uid}/coachStaff/{coachUid}` é como o portal descobre a que treinadores o usuário
  pertence (as rules não permitem query por `staff` de outro).

Callables novas: `createCoachStaffInvite`, `acceptCoachStaffInvite`, `changeCoachStaffRole`,
`removeCoachStaff`, `leaveCoachStaff`. O principal não sai nem é removido na v1.

## 4. Rules

```
function coachCan(coachUid, area, write) {
  return request.auth != null && (
    request.auth.uid == coachUid ||                       // dono: tudo
    coachStaffAllows(coachUid, area, write)
  );
}
function coachStaffAllows(coachUid, area, write) {
  let s = get(/databases/$(database)/documents/coaches/$(coachUid)/staff/$(request.auth.uid));
  // exists() antes do get(): get em doc inexistente é erro de avaliação = deny sem explicação
  ...matriz literal por cargo...
}
```

Cada `match` de subcoleção troca `uid == coachUid` por `coachCan(coachUid, '<área>', <bool>)`. O doc
raiz `coaches/{coachUid}` (perfil) fica **só do dono**; staff lê o necessário pelo espelho.

Custo: 1 `get()` por avaliação, bem abaixo do limite de 10 por request.

## 5. Os dois riscos já conhecidos (vêm das memórias da arena)

1. **Congelar campos.** Todo `allow update` de staff precisa da lista do que o cargo *não* move.
   Aqui: `athletes/{id}` — só `saude`/principal mexe em `availability`; auxiliar não toca em `squadId`
   se for só `r`. Sem teste de `assertFails` por campo, "pode escrever o doc" vira "é dono".
2. **O RBAC parava nas rules.** Callables que hoje assumem `auth.uid == coachUid` ignorariam o staff
   (ou, pior, o autorizariam errado): `inviteAthlete`/`searchAthleteForCoachInvite`, `sendCallUp`,
   `getCoachTournamentOverview`, o aceite de convite do atleta. Criar
   `functions/src/coach-area-access.ts` → `assertCoachAreaAccess(uid, coachUid, area, write)` e aplicar em
   todas — **varrendo por área, não por lista** (ver `rbac-varrer-por-area-nao-por-lista`).

## 6. Mudança no portal (a parte grande)

Todo serviço usa `auth.user().uid` como `coachUid`. Passa a existir um **contexto de treinador ativo**:

- `CoachContextService` com `activeCoachUid` (signal) e `role` (computed), lidos de
  `users/{uid}/coachStaff/*` + o próprio uid como dono. Quem pertence a mais de um treinador (um
  fisio atende dois) escolhe no topo do menu; persistência da escolha em `localStorage` (conveniência).
- Os serviços trocam `auth.user().uid` por `ctx.activeCoachUid()` (≈ 8 arquivos: squads, trainings,
  athletes, evaluations, perfil, convocação…).
- `CoachAccessService.can(area, 'r'|'w')` + guard de rota por área + esconder itens do menu
  (`panel-shell`). Gating de **botões de escrita** por área — varrer por área, inclusive gestos e rotas
  diretas.
- A matriz existe em **3 lugares** (rules, `functions/src/coach-roles.ts`, model do portal). Adicionar um
  **teste que extrai a matriz das rules e compara com o TS** — na arena os comentários prometiam isso
  e era falso.
- A tela `Permissões` deixa de ser mock: lista `staff`, convite por link, trocar cargo, remover.

## 7. LGPD

Saúde e anotações psicológicas são dado sensível. Antes de `saude`/`mental` irem a produção:
termo de consentimento do **atleta** no vínculo (já existe `inscription-lgpd-consent` como precedente) e
log de leitura de `injuries`. Não é bloqueante para as áreas de treino.

## 8. Entrega em fases

1. **Fundação**: `staff` + convites + espelho + callables + `coachCan` nas rules das 5 subcoleções
   existentes + `coach-area-access` + testes de rules (assertFails por cargo×área×campo).
2. **Portal**: `CoachContextService`, seletor de treinador, gating, tela Permissões real.
3. **Áreas novas** (`saude`, `fisico`, `mental`, `comunicacao`, `financeiro`) — cada uma nasce já com
   rules por área; hoje só existem como mock.
4. QA e2e contra o dev com contas descartáveis (modelo `qa-arena-staff-rbac-e2e.mjs`).

Retrocompatibilidade: sem `staff`, tudo continua exatamente como hoje (dono-only). Deploy de rules e
functions antes do portal, nessa ordem.

## 9. Perguntas abertas

- **P1. `auxiliar` lê `avaliacoes`?** Proposta: sim (r), só principal escreve. Alternativa: auxiliar escreve
  (comum em comissão pequena).
- **P2. Principal lê `mental`?** O mock diz "acesso total" para o principal e "restrito" para o
  psicólogo. Proposta: só o autor (psicólogo) lê o texto; o principal vê apenas que existe nota e a data.
  Confirmar com o produto — é decisão de privacidade, não técnica.
- **P3. Vários treinadores por usuário** (seletor ativo) entra na v1 ou fica 1 treinador por membro?
  Proposta: entra — o custo é o mesmo do refactor do `coachUid`.
- **P4. Atleta enxerga a comissão?** Hoje o atleta só vê o treinador (dono). Proposta: continua assim na v1.
