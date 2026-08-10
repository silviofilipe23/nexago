# Convites de equipe pela aba "Minha inscrição" (portal do atleta)

**Data:** 2026-08-10 · **Branch:** `claude/group-inscription-invites-866684`

## Problema

Na inscrição em categorias de equipe (trio/quarteto/quinteto), o capitão precisa
conseguir enviar novos convites para preencher as vagas do elenco quando **entra
na inscrição**. Hoje:

- O backend já suporta tudo (`sendTournamentPartnerInvite` → ramo
  `sendTeamCategoryInvite`): valida capitão, vagas restantes, convites pendentes
  como vaga prometida e composição de gênero.
- O shell de inscrição (`/torneios/:id/inscricao?categoria=…`) já mostra elenco,
  busca de atletas, convites pendentes e convite por link para o capitão
  enquanto `partnerPending`.
- O card de acompanhamento do painel já linka para o shell com `?categoria=`.
- **O gap:** na página do torneio, categoria inscrita mostra "Ver inscrição" →
  aba **Minha inscrição** (`/torneios/:id/minha-inscricao`), que não tem nenhum
  caminho para convidar. O card ainda rotula equipe como "Dupla" e mostra só o
  flag genérico "convite pendente".

## Abordagens consideradas

1. **CTA na aba levando ao shell (escolhida).** A aba ganha fatos cientes de
   equipe (rótulo "Equipe", flag "Elenco X/N") e um CTA "Convidar atletas"
   (capitão) que navega ao shell, onde o fluxo completo de convite já existe.
   Mínima, zero duplicação, reusa LGPD/uniforme/busca/convite externo.
2. Embutir a UI de convite na aba — duplica busca com debounce, gating de
   LGPD/uniforme e convite externo. Rejeitada.
3. Extrair o bloco de convite do shell para componente compartilhado — refactor
   grande do shell (966 linhas) sem necessidade atual. Rejeitada (YAGNI).

## Design

Módulo puro `registration-roster-cta.ts` em `tournaments/tabs/` (mesmo padrão de
`painel/registration-progress.ts`), consumido pelo `RegistrationTabComponent`:

```
registrationRosterView(reg, uid) → {
  teamLabel:   'Equipe' | 'Dupla'
  rosterFlag:  'Elenco 2/4' (equipe com vaga aberta) | 'convite pendente' (dupla aguardando) | null
  inviteLabel: 'Convidar atletas' (capitão de equipe incompleta)
             | 'Convidar parceiro' (dupla com partnerPending) | null
  captainOnlyHint: 'O capitão convida os atletas que faltam.' (integrante) | null
}
```

Regras:
- Capitão = `captainUid ?? player1Id ?? participantUids[0]` (mesmo fallback do
  shell e do painel).
- Equipe completa (`!partnerPending`): sem flag, sem CTA, sem hint.
- Dupla com `partnerPending` sempre pode convidar (a inscrição pendente só tem o
  próprio convidante como participante).
- Em equipe, o CTA exige `uid === capitão`; `uid` nulo não convida.

Template da aba:
- `<dt>` do fato vira `card.teamLabel`; o flag vira `card.rosterFlag`.
- Hint do integrante e CTA de convite entram antes do CTA de pagamento.
- CTA de convite: `routerLink` para `['/torneios', id, 'inscricao']` com
  `{ categoria }`, estilo outline (`.reg-cta--invite`) para não competir com o
  CTA laranja de pagamento quando os dois aparecem.

## Fora de escopo

- Mudanças de backend ou rules (nada necessário).
- Fluxo do app Flutter.
- Convite embutido na aba (fica no shell).

## Testes

Spec do módulo puro (sem TestBed): capitão com vaga aberta, fallback de capitão
sem `captainUid`, integrante não-capitão, equipe completa, dupla pendente,
dupla formada, `uid` nulo.

## Plano de implementação

1. Spec + módulo puro (TDD: red → green).
2. `RegistrationCard` ganha os 4 campos; `cardOf` delega ao módulo.
3. Template + SCSS (`.reg-cta--invite`, `.reg-roster-hint`).
4. `ng test athlete --include='**/registration-roster-cta.spec.ts'` + build.
