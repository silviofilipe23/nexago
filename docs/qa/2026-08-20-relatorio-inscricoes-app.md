# Relatório de QA — Inscrições no app

**Data:** 20/08/2026 · **Branch:** `claude/app-inscricoes-test-plan-a78cd2`
**Plano:** [2026-08-20-plano-teste-inscricoes-app.md](./2026-08-20-plano-teste-inscricoes-app.md)

## Resumo

| Camada | O que prova | Resultado |
|---|---|---|
| Integração no emulador (código local) | as callables de inscrição, com Firestore de verdade | **147/147** |
| E2E contra o dev (código deployado + rules) | protocolo idêntico ao do app: Auth REST + callables + Firestore REST | **39/39** |
| Widget da tela de inscrição | qual cartão aparece e qual callable é chamada, com quais argumentos | **33/33** |
| Simulador iOS contra o dev | o app real, do card da categoria ao elenco montado | fluxo completo |
| Suíte de functions (regressão) | nada quebrou com as correções | **1440/1440** |
| Suíte Flutter (regressão) | nada quebrou | 2430 · 1 falha pré-existente fora de escopo |

**5 defeitos encontrados e corrigidos**, incluindo a capacidade que o servidor não aplicava. Nenhum risco em aberto.

## Como rodar

```bash
npm --prefix functions run test:registrations
```

```bash
node functions/scripts/qa-tournament-registration-e2e.mjs --keep
```

```bash
cd nexago_app && flutter test test/features/tournaments/
```

## Defeitos corrigidos

### 1. Convite expirado nunca era marcado como expirado

`acceptTournamentPartnerInvite` fazia `tx.update(inviteRef, {status: "expired"})`
e, na linha seguinte, `throw`. O `throw` aborta a transação — e a escrita morre
junto. O convite ficava `pending` para sempre, mesmo depois de vencido.

Efeito prático: lixo permanente na coleção de convites. As telas escondem o
convite vencido por filtro no cliente, então não aparecia; mas a intenção do
código (marcar `expired`) nunca acontecia, e qualquer relatório ou limpeza que
confie no status conta errado.

**Correção:** a expiração passou a ser decidida e gravada **antes** da
transação, e só para convite ainda `pending`. Dentro da transação continua a
segunda linha de defesa — agora sem escrita inútil.
`functions/src/tournament-partner-invite.ts`

### 2. Duplo toque em "Reservar minha vaga" criava duas reservas

`registerSoloTournament` lia ("o atleta já tem inscrição nesta categoria?") e
escrevia fora de transação. Duas chamadas simultâneas liam "não tem" ao mesmo
tempo e criavam **duas** inscrições para o mesmo atleta na mesma categoria.

Efeito prático: a segunda reserva fica **invisível no app** — a tela mapeia uma
inscrição por categoria (`result[categoryId] = ...`, a última vence) — e ocupa
uma vaga da categoria para sempre. O atleta não tem como cancelá-la pela
interface.

**Correção:** a criação entrou numa transação com releitura estreita das
inscrições daquele atleta naquele torneio, pelo índice
`tournamentId + participantUids` que já existia em `firestore.indexes.json`.
`functions/src/tournament-partner-invite.ts`

**Varredura no dev:** 83 inscrições lidas, **nenhuma** duplicata — a corrida
nunca se materializou lá. Vale repetir a varredura em produção antes do
lançamento (só leitura).

### 3. Mesmo problema em "Criar equipe"

`createTournamentTeamRegistration` tinha a mesma forma (varredura + `batch`):
dois toques simultâneos criavam duas equipes para o mesmo capitão, com o mesmo
efeito de vaga fantasma.

**Correção:** o `batch` virou transação com a mesma releitura estreita.
`functions/src/tournament-team-registration.ts`

### 4. "Conclua o pagamento" com o elenco em 2/4

Este apareceu no simulador, e nenhuma das camadas automatizadas o teria pego:
quando um integrante aceita o convite de EQUIPE, o app abria um aviso em tela
cheia — **"Bruno aceitou! Conclua o pagamento da inscrição."** com o botão
**Pagar** — mesmo com o elenco em 2 de 4.

A copy é da dupla, onde o aceite realmente fecha a inscrição (2/2). No quarteto
o aceite é só mais um integrante: não existe conta a pagar, e o aviso escondia
a única ação que restava — convidar quem falta. Pior: o capitão via esse mesmo
aviso a cada aceite, três vezes seguidas.

**Correção:** a copy passou a olhar o elenco (`partnerAcceptedFeedbackCopy`, em
`tournament_registration_logic.dart`). Elenco aberto vira **"Diego entrou na
equipe — Elenco 3/4. Convide os atletas que faltam."** com o botão
**Convidar**, que leva ao elenco. Elenco fechado (e toda dupla) segue indo para
o pagamento, como antes.
`nexago_app/lib/features/tournaments/presentation/widgets/tournament_invite_accept_coordinator.dart`

## Defeito 5 — a capacidade da categoria não era aplicada no servidor

`assertTournamentAcceptsRegistration` decidia "lotada" lendo
`categories[].spotsLeft` — um contador que nasce igual à capacidade e que
**nenhum writer decrementa**. O wizard do organizador grava
`maxTeams = spotsTotal = spotsLeft = spots` na criação e ninguém mexe depois.

O teste provou o efeito: categoria com `maxTeams: 1`, fila desligada, aceitou
**duas** duplas — e nenhuma delas sequer entrou na fila. A única trava real era
a tela do app; cliente desatualizado, corrida no último instante ou o caminho
do aceite de convite passavam por cima.

**Correção:** a ocupação passou a vir da **contagem dos documentos de
inscrição** — 1 doc = 1 vaga, que já era a regra registrada do projeto e o que
o portal do atleta sempre fez. Fila de espera não ocupa vaga. A consulta usa o
índice `tournamentId + categoryId` que já existia.

Três consequências que valem saber:

1. **A fila de espera passa a funcionar de verdade.** Antes ela praticamente
   nunca disparava (o contador nunca chegava a zero). Agora, categoria cheia com
   `waitlistEnabled` manda para a fila; sem fila, recusa com "Categoria lotada".
2. **Os números de vaga do app sobem.** O app contava só as inscrições pagas;
   passou a contar todas as não-enfileiradas, igual ao servidor e ao portal.
   No dev, "Misto Iniciante" saiu de `3/16` para `11/16` — a conta antiga
   escondia oito reservas que ocupam vaga de verdade. Sem esse alinhamento, a
   tela anunciaria vagas que o servidor recusaria.
3. **O organizador também é barrado em categoria cheia.** Ele fura o prazo, não
   a capacidade — é o que o guard já dizia por escrito, mas que na prática nunca
   acontecia. Se você quiser que o organizador possa estourar o teto, é uma
   linha a mais na opção `allowClosedRegistration`; me diga e eu faço.

**Confirmar uma inscrição que já existe não a joga na fila.** Pagamento PIX,
confirmação gratuita e reserva direta com o organizador excluem a própria
inscrição da contagem — sem isso, quem estava confirmando a vaga que já era
dele seria contado contra si mesmo e cairia na fila.

`functions/src/tournament-registration-guards.ts` ·
`functions/src/tournament-registration-pix.ts` ·
`nexago_app/lib/features/tournaments/data/tournament_inscriptions_repository.dart`

### Junto veio o risco B

Com `maxTeams: 0` o guard resolvia `spotsLeft = 0`, tratava a categoria como
lotada e gravava `waitlist: true` em silêncio. Agora "sem teto declarado"
significa **sem lotação**: `resolveCategoryCapacity` só aceita valor positivo e
devolve `null` quando a categoria não declara teto nenhum.

## Observações

- **Reservar a vaga depois de convidar mata o convite pendente.**
  `markStaleCreateInvitesAfterSolo` derruba o convite "create" do convidante
  quando ele reserva solo, embora a fusão *attach* desse conta do caso sozinha.
  Comportamento deliberado hoje; coberto por teste para não mudar por acidente.
- **As correções acima estão só no código local.** O E2E contra o dev passou
  39/39 com o código deployado (antigo), o que significa que os defeitos não são
  regressões recentes: são antigos e passavam despercebidos. Precisam de deploy.
- **Contrato app ↔ backend conferido:** as 73 callables que o app invoca existem
  em `functions/src/index.ts`. Nenhuma divergência de nome.
- **Falha pré-existente fora de escopo:**
  `test/core/deep_link/app_deep_link_logic_test.dart — rejects retired domains`
  (domínio `nexago.app` aposentado). Não tem relação com inscrição.

## Cobertura da matriz

**Formato:** dupla · trio · quarteto · quinteto
**Gênero:** masculina · feminina · mista (por `genderType` e por nome) ·
equipe livre · composição exata (2H+2M, 4H+0M) · sem gênero declarado ·
gênero "Outro" · perfil sem gênero
**Entrada:** reserva solo · convite direto · fusão de duas reservas · reserva do
convidado · convite por link (token) · capitão + elenco · recusa · cancelamento ·
expiração · saída de integrante
**Gates:** rascunho/programado/cancelado · vitrine fechada · prazo vencido ·
prazo não aberto · categoria encerrada/concluída/lotada · fila ligada e
desligada · perfil sem cadastro/WhatsApp/cidade · nível (teto e piso) · idade
(sub-N, +N, faixa, sem data)
**Uniforme:** nenhum · só regata · completo · nome · número · tamanhos custom ·
gravação posterior · uniforme por atleta em equipe
**LGPD:** reserva · criação de equipe · convite · aceite · fusão que preserva o
aceite da reserva liberada
**Fechamento:** categoria gratuita (dupla e quarteto) · pagamento direto com o
organizador
**Conflitos:** auto-convite · convite duplicado · já inscrito · par repetido ·
duas reservas pagas · equipe completa · nome de equipe repetido · atleta em
outra equipe · convite alheio · corridas de duplo toque

## O que o simulador mostrou

Fluxo completo de quarteto, no app real contra o dev, com a Elisa QA:

1. Card da categoria com a contagem real de vagas (3/16) e "Inscrever-se".
2. Tela de inscrição com os chips certos — **MISTO · QUARTETO · 2H + 2M ·
   INICIANTE 2** — e o cartão de uniforme entre a categoria e a inscrição.
3. "Criar equipe" sem o aceite LGPD não cria nada.
4. Com o aceite: equipe criada, **Elenco 1/4**, Elisa marcada CAPITÃO.
5. Convite ao Bruno: as vagas caem de **3 para 2** — convite pendente reserva
   cota, como no backend.
6. Aceite do parceiro chega ao vivo na tela de quem convidou.
7. O aviso de aceite mostra o passo certo (defeito 4, corrigido e reverificado).
8. Home do atleta com a trilha "Continue sua inscrição — PASSO 3/5, Elenco 2/4".

Os dados de teste criados nesse roteiro foram cancelados ao final; o dev ficou
como estava.
