# Carteira do torneio — o caixa passa a morar no evento

**Data:** 16/09/2026
**Decisões do dono:** tomadas nesta sessão (16/09/2026)
**Status:** desenho aprovado, implementação não iniciada

## Por que

Um organizador adicionado à equipe de um torneio abre o Financeiro do portal e vê
R$ 0,00. O crédito das inscrições pagas via Asaas vai para `organizerWallets/{uid}`
do **dono** do torneio (`tournament.managerId`), e a tela lê a carteira de quem
está logado. Quem opera o evento não alcança o dinheiro dele.

Em 10/09/2026 isso recebeu um paliativo: a callable `loadOrganizerWalletView` e um
seletor de carteira, com o PIX saindo sempre para a chave do dono
(`organizer-wallet-access.ts`). O backend está deployado no DEV; **o portal nunca
foi publicado** — o bundle no ar em `organizador.nexago.com.br` não contém
`loadOrganizerWalletView`, o que explica a reclamação atual. Publicar aquele build
resolve o sintoma, mas mantém dois defeitos de fundo: o KPI do Início continua
lendo a carteira própria (R$ 0,00 para o gestor), e o dinheiro de N eventos fica
num balaio único por pessoa.

Decisão do dono: **o caixa passa a ser do torneio**, e qualquer organizador da
equipe saca quando quiser, para a própria chave PIX.

## Decisões tomadas

| Pergunta | Decisão |
|---|---|
| Destino do PIX no saque | A chave de **quem está sacando** (não a do dono) |
| Freio no saque do gestor | Nenhum: saca livre, o dono é **notificado** |
| Onde o dinheiro mora | **Só no torneio**; o saldo atual migra |
| Escopo | Portal web **e** app Flutter na mesma entrega |
| Modelo | Coleção própria `tournamentWallets/{tournamentId}` |
| Torneio excluído com saldo | Exclusão **recusada** enquanto houver saldo |

Risco aceito explicitamente pelo dono: como a chave é de quem saca e a equipe é
adicionada pelo dono sem convite/aceite, qualquer gestor passa a poder transferir
o caixa do evento para a conta dele. O contrapeso escolhido foi a notificação ao
dono, não a aprovação prévia.

## Modelo de dados

### `tournamentWallets/{tournamentId}` (novo)

```
tournamentId: string
ownerId: string          // tournament.managerId no momento do crédito
availableReais: number
pendingReais: number
updatedAt: Timestamp
```

Subcoleção `ledger/{entryId}` — mesmos campos do extrato atual de
`organizerWallets`: `type` (`credit`), `registrationId`, `payerUid`,
`asaasPaymentId`, `grossReais`, `platformFeeReais`, `gatewayFeeReais`,
`netReais`, `createdAt`.

### `organizerPayoutProfiles/{uid}` (novo)

```
payoutPixKey: string
payoutPixKeyType: string
updatedAt: Timestamp
```

A chave PIX deixa de ser um dado da carteira e passa a ser um dado da **pessoa**,
porque é para ela que o dinheiro vai. Escrita apenas por Cloud Function
(`setOrganizerPayoutPixKey` passa a gravar aqui), leitura só do próprio dono e de
admin.

### `organizerWithdrawals/{id}` (existente, ganha campos)

- `tournamentId: string` — de qual caixa saiu (novo, obrigatório nos novos)
- `organizerId` — continua gravado com o `ownerId` do torneio, para não quebrar a
  fila do backoffice nem o webhook de payout
- `requestedBy`, `requestedByStaff` — já existem
- `pixKey`/`pixKeyType` — a do **solicitante**, resolvida no servidor

### `organizerWallets/{uid}` (existente)

Vira histórico read-only. As rules já proíbem escrita do client; após a migração
sai das telas. Não apagar: é o rastro dos créditos e saques anteriores.

## Fluxo do dinheiro

### Crédito

`asaas-tournament-registration-webhook.ts:390` (fase `credit`, só na liquidação)
troca o destino: em vez de `creditOrganizerWalletFromRegistration(db, organizerId, …)`,
credita o torneio. `tournamentId` já está no escopo (linha 169) e `organizerId`
vem de `tournament.managerId` (linha 173), que passa a ser gravado como `ownerId`.

A comissão continua resolvida por `organizers/{ownerId}.commissionPercent`
(fallback 8%) — a taxa é do dono do evento, não de quem saca.

Dinheiro `directWithOrganizer` continua **não** creditando nada, como hoje. A
explicação do saldo zerado por recebimento direto (`wallet-view.ts`,
`shouldExplainZeroBalance`) continua valendo, agora por evento.

### Saque

`requestOrganizerWithdrawal` passa a receber `tournamentId`:

1. **Autorização** — dono do torneio (`managerId`) ou gestor ativo da equipe.
   Mesário (`scorer`) não. Super admin continua alcançando.
2. **Chave PIX** — sempre do `organizerPayoutProfiles/{uid do solicitante}`. O
   payload não escolhe destino (mesma garantia de `resolveWithdrawalPixSource`,
   agora sem o caso delegado). Sem chave cadastrada → `failed-precondition`
   pedindo o cadastro.
3. **Reserva** — move de `availableReais` para `pendingReais` do caixa do torneio,
   em transação (as funções de `organizer-wallet.ts` ganham versão por torneio).
4. **Trava de concorrência** — um saque pendente **por torneio** (hoje é por
   pessoa). Com vários gestores sacando do mesmo caixa, a trava tem de ser do
   caixa.
5. **Aprovação** — auto até R$ 500 (`ARENA_WITHDRAWAL_AUTO_MAX_REAIS`), acima vai
   para a fila do backoffice. Regra atual preservada.
6. **Notificação** — sempre que o solicitante não é o dono, o dono recebe push com
   nome de quem pediu, valor, evento e chave mascarada
   (`notifyOwnerOfDelegatedWithdrawal`, ajustada para nomear o torneio).

### Exclusão do torneio

A exclusão é feita pelo client (rules em `firestore.rules:1947`, `allow delete`).
A trava vive lá: nega o delete enquanto `tournamentWallets/{tournamentId}` tiver
`availableReais > 0` ou `pendingReais > 0`. Custa um `get` a mais no delete. O
portal e o app mostram a mensagem dizendo quanto falta sacar antes de excluir.

## Rules

Bloco novo, isolado:

```
match /tournamentWallets/{tournamentId} {
  allow read: if request.auth != null && (
    isSuperAdmin() || isAdmin() ||
    tournamentManagerId(tournamentId) == request.auth.uid ||
    isTournamentStaff(tournamentId, ['manager'])
  );
  allow create, update, delete: if false;
  match /ledger/{entryId} {
    allow read: if request.auth != null && (
      isSuperAdmin() || isAdmin() ||
      tournamentManagerId(tournamentId) == request.auth.uid ||
      isTournamentStaff(tournamentId, ['manager'])
    );
    allow create, update, delete: if false;
  }
}

match /organizerPayoutProfiles/{uid} {
  allow read: if request.auth != null && (isSuperAdmin() || isAdmin() || request.auth.uid == uid);
  allow create, update, delete: if false;
}
```

Os dois helpers já existem (`tournamentManagerId`, `isTournamentStaff` em
`firestore.rules:93`), então o custo é pequeno. **Medir o orçamento de expressões
antes e depois** — o arquivo já bateu no teto de 1000 antes.

**Armadilha conhecida:** `isTournamentStaff` exige `role == 'manager'` explícito,
enquanto a CF (`staffRoleGrantsOrganizerAccess`, `buildStaffMirrorData`) trata
papel **ausente** como gestor. Um doc de staff legado sem `role` sacaria pelo
servidor e teria a leitura do caixa negada pelas rules — vê tela vazia e o saque
funciona, que é o pior tipo de incoerência para dinheiro.

Decisão: nenhuma das duas camadas muda de semântica (mexer em
`staffRoleGrantsOrganizerAccess` afetaria o acesso ao portal, que é outro
assunto). Em vez disso, a migração inclui um **backfill** que grava
`role: 'manager'` nos docs `tournaments/{id}/staff/{uid}` que estiverem sem o
campo. O teste de rules cobre o doc sem `role` para registrar o comportamento.

## Superfícies

### Portal do organizador (web)

- **Financeiro** (`painel/financeiro/financeiro.component.ts`): sai o seletor de
  carteira, entra a lista de **caixas por evento** — disponível, pendente,
  extrato e botão Sacar por evento. O card de chave PIX vira "minha chave de
  repasse", sempre editável.
- **Início** (`painel/inicio/panel-inicio.component.ts:410`): o KPI "Saldo
  disponível" passa a somar os caixas dos eventos que a pessoa alcança (próprios
  e operados), no lugar de `watchWallet(uid)`.
- **Config** (`painel/config/config.component.ts:97`): o card de chave PIX passa
  a ler o perfil de repasse.
- **Repositório** (`painel/data/wallet-repository.ts`): `watchWallet(uid)` é
  **removido**; entram `watchTournamentWallet(tournamentId)` (snapshot ao vivo —
  agora cabe nas rules) e `requestWithdrawal(tournamentId, amountReais)`.
  `loadOrganizerWalletView` **permanece**, recebendo `tournamentId`, e serve só o
  extrato: os rótulos de atleta saem de `resolveLedgerAthleteLabels`, que lê
  `inscriptions`/`teams`/`public_profiles` — leituras que o client não alcança.
  Saldo vem do snapshot, extrato vem da callable.
- `painel/data/wallet-view.ts`: `tournamentsOfWallet` é **removida** com seu spec
  (o recorte agora é o próprio caixa) e `shouldExplainZeroBalance` passa a
  receber o `collectedViaOrganizerCents` de um evento só.

### App Flutter

`features/organizer/data/organizer_wallet_repository.dart` (192 linhas),
`domain/organizer_wallet_providers.dart` e
`presentation/organizer_financial_page.dart` (667 linhas) — mesma lista por
evento. É a parte mais longa da entrega.

### Backoffice

- `painel/financeiro/panel-financeiro.component.ts`: a fila de aprovação mostra o
  evento e quem pediu (hoje mostra só o organizador).
- `painel/organizadores/data/organizers.repository.ts:180` e `role-form.state.ts:69`:
  a chave PIX exibida passa a vir de `organizerPayoutProfiles/{uid}`.

## Migração

Script `functions/scripts/migrate-organizer-wallets-to-tournaments.js`, dry-run por
padrão e `--yes` para aplicar (padrão dos scripts do repo):

1. Para cada `organizerWallets/{uid}`, percorre o `ledger` e resolve
   `registrationId` → inscrição → `tournamentId`.
2. Agrupa os créditos por torneio, cria `tournamentWallets/{tournamentId}` com o
   saldo correspondente e copia as linhas de extrato.
3. Copia `payoutPixKey`/`payoutPixKeyType` para `organizerPayoutProfiles/{uid}`.
4. Backfill: grava `role: 'manager'` nos docs `tournaments/{id}/staff/{uid}` sem o
   campo, para as rules e o servidor concordarem (ver a armadilha nas Rules).
5. Imprime relatório: por carteira, quanto foi atribuído a cada torneio e quanto
   **não** casou. O que não casar não é movido nem apagado — fica na carteira
   antiga para decisão manual.

Estado hoje no DEV (medido em 16/09/2026): 3 carteiras, 1 com saldo
(R$ 571,03 disponível, R$ 0 pendente), 2 saques registrados, 50 linhas de extrato.
Volume pequeno, migração barata. PROD tem de ser medido antes de rodar.

## Testes

**Functions (`node --test`):**
- crédito da inscrição paga vai para `tournamentWallets/{tournamentId}`, com
  `ownerId` do `managerId`
- saque autorizado para dono e gestor ativo; negado para mesário, para estranho e
  para gestor `status != 'active'`
- chave PIX é sempre a do solicitante, inclusive com `pixKey` adulterada no
  payload
- sem chave cadastrada, o saque falha pedindo cadastro
- um pendente por torneio: segundo pedido no mesmo caixa é recusado; pedido em
  outro torneio passa
- reserva e liberação do `pendingReais` do caixa do torneio

**Rules (`functions/test/*.rules.test.mjs`):** leitura do caixa pelo dono, por
gestor ativo, negada para mesário/estranho/anônimo; doc de staff **sem** `role`;
escrita sempre negada; `organizerPayoutProfiles` só do dono; delete de torneio
recusado com saldo e permitido com caixa zerado.

**Portal (specs Angular):** funções puras da lista de caixas, soma do KPI do
Início, explicação do zero por evento.

**App (Flutter):** repositório e tela do financeiro por evento.

## Ordem de deploy

1. `firestore:rules` (dev) — leitura nova e trava do delete
2. functions (dev, as duas regiões) — crédito por torneio + saque por torneio
3. migração (dry-run, conferir relatório, depois `--yes`)
4. portal do organizador — build de produção, zip manual no hPanel
   (`organizador.nexago.com.br`), limpando o diretório antes
5. app Flutter — build e loja

Entre o passo 2 e o passo 4 existe uma janela em que o crédito novo já cai no
torneio mas a tela publicada ainda lê a carteira antiga (saldo congelado).
Quanto mais curta, melhor; nenhum dinheiro se perde nessa janela.

PROD segue intocado até o dono decidir — mesma postura de `platform-fees-plan`.

## Fora de escopo

- Ligas (`leagues`) não têm caixa próprio nesta entrega.
- Carteira de arena (`arenaWallets`) não muda.
- Rateio automático entre organizadores (dividir o caixa em cotas) — o saque é
  manual, quem saca decide o valor.
- Aprovação prévia do dono para saque de gestor (descartada explicitamente).
