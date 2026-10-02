# Perfil público do organizador

Data: 2026-10-02

## Contexto

O atleta não tem como conhecer quem organiza um evento. O app e o portal mostram só a linha
"Organizado por X · ★ nota" no cabeçalho do torneio, e ela é texto, sem link. Não existe tela de
organizador em nenhuma superfície. O `/o/{slug}` do site é a página de links (link-in-bio), não
um perfil.

O que já existe e é público:

- `organizerReputation/{uid}`: nota média, distribuição e os 5 aspectos (`organization`,
  `schedule`, `refereeing`, `venue`, `prizes`). Fica `null` abaixo de 3 avaliações.
- `tournamentReviewSummaries/{tid}`: nota por evento, consultável por `organizerId`.
- `tournaments` (`read: if true`), ligados ao organizador por `managerId`.
- Campeões em `tournaments/{id}.categoryOps.{cat}.championTeamId` → equipes → `public_profiles`.

O que não é público ou não existe:

- **Identidade da marca.** `users/{uid}.organizerProfile` (`orgName`, `logoUrl`, `city`, `state`,
  `contactEmail`, `contactPhone`) não é legível pelo visitante: `users` só abre para doc de atleta.
  `public_profiles` não copia `organizerProfile`, e conta só de organizador não tem nome lá. Por
  isso a linha "Organizado por" hoje some para esses organizadores.
- **Bio e capa**: o organizador não tem esses campos.
- **Selo verificado**: não há campo.
- **Mensagem**: não há chat.
- **Total de atletas** e **seguidores de organizador**: não há agregado.
- **Vagas preenchidas**: `enrolledCount` e `spotsLeft` são contadores mortos. O número real é a
  contagem de `inscriptions`, que exige login (o portal e o app já fazem).

## Decisões do dono

- **Superfícies:** portal do atleta (web) e app Flutter. O site sem login fica para depois.
- **Entram de verdade:** selo verificado, contador de atletas e botão WhatsApp.
- **Sai:** o comentário de atleta. A spec das avaliações (2026-10-01) mantém o público só com
  agregados, sem texto.
- **Bio e capa editáveis** no painel web do organizador e no app (modo organizador).
- **Entradas:** "Organizado por X" vira link (torneio e liga), mais uma lista "Organizadores" no
  hub Competir.
- **Seguir** dispara push quando um evento do organizador abre inscrição.
- **Abordagem:** documento público mantido pelo servidor (`organizerPublicProfiles/{uid}`).
  Rejeitados: calcular os números no cliente (lógica duplicada em Dart e TS, contagem de atletas
  cara por visita, inviável sem login) e pendurar em `public_profiles` (aquele espelho é
  regravado sem merge a cada escrita em `users` e apagaria os contadores; mistura pessoa e marca).

## Definições

| Termo | Definição |
|---|---|
| Evento listado | Torneio do `managerId` com `listingStatus` em `open`, `closed` ou `completed`, e `visibility !== 'linkOnly'`. Doc sem `visibility` conta como listado, igual ao app e ao portal (`isPubliclyListedTournamentDoc`). |
| Evento realizado | Evento listado com `listingStatus === 'completed'`. |
| Inscrição aberta | Evento listado com `listingStatus === 'open'`. |
| Atletas | uids distintos de inscrições que jogaram (`isPaid && !waitlist && !partnerPending && teamId`) em eventos realizados. Os uids saem de `registrationAthleteUids(registration, team)`. |
| Verificado | `organizers/{uid}` existe. Só o cadastro do backoffice (`saveOrganizerRegistration`) cria esse doc. |
| Organizador desde | Menor `startAt` entre os eventos listados. `users.createdAt` não existe para conta criada como organizador. |
| Onde acontece | Até 3 locais mais frequentes entre os eventos listados. A chave é `arenaId` quando existe; senão o `locationName` normalizado (trim, minúsculas, sem acento, espaços colapsados). O painel web nunca grava `arenaId`. |
| Esportes | Valores distintos de `sport` entre os eventos listados, do mais frequente ao menos frequente. |

## Modelo de dados

### `organizerPublicProfiles/{uid}`

Leitura pública (`allow read: if true`), escrita só por Cloud Function.

```
uid: string
name: string                 // orgName → displayName → fullName → name → "Organizador"
logoUrl: string | null
coverUrl: string | null
bio: string | null           // ≤ 280
city: string | null
state: string | null         // UF
whatsapp: string | null      // só com organizerProfile.publicWhatsapp === true; dígitos com DDI 55
isOrganizer: boolean         // tem o papel organizer
verified: boolean
listed: boolean              // isOrganizer && stats.listedEvents > 0 → entra na lista
followersCount: number       // FieldValue.increment
stats: {
  listedEvents: number
  eventsCompleted: number
  openEvents: number
  athletes: number
  organizerSince: Timestamp | null
  sports: string[]
  venues: { name: string, arenaId: string | null, city: string | null, count: number }[]
}
identityUpdatedAt: Timestamp
statsUpdatedAt: Timestamp
```

Os números não dependem do relógio (nada de "próximos" calculado no servidor). Mudam só quando
um torneio muda, então não ficam velhos com o passar do tempo.

### `organizerPublicProfiles/{uid}/followers/{athleteUid}`

```
userId: string        // == athleteUid
organizerId: string   // == uid
followedAt: Timestamp // serverTimestamp
```

Regras: ler, qualquer logado. Criar, só o próprio atleta, sem seguir a si mesmo, com exatamente
essas três chaves e `followedAt == request.time`, e só se o doc pai tem `isOrganizer == true`.
Apagar, só o próprio atleta. Sem update.

Um doc pode existir **sem identidade**: o recálculo dos números cria `{uid, stats, listed: false}`
para qualquer `managerId`. Os clientes só exibem o perfil quando `isOrganizer === true`.

### `organizerFollowerPushes/{lockId}` (privado)

`lockId` = `tournamentId`; etapa de liga usa `league_{leagueId}_{AAAA-MM-DD}` (dia em São Paulo),
porque publicar uma liga cria todas as etapas abertas no mesmo batch.

```
organizerId: string
tournamentId: string
status: 'scheduled' | 'sending' | 'sent' | 'skipped'   // 'sending' = reivindicada; at-most-once
sendAt: Timestamp
createdAt: Timestamp
sentAt?: Timestamp
recipients?: number
skippedReason?: string
```

`allow read, write: if false`. Índice composto `status ASC, sendAt ASC`.

### Campos de origem novos em `users/{uid}.organizerProfile`

- `bio: string` (≤ 280)
- `coverUrl: string` (Storage `profiles/{uid}/organizer-cover.jpg`)
- `publicWhatsapp: boolean`

A regra de update de `users` não restringe `organizerProfile`. O card "Perfil" do painel grava o
mapa com `setDoc(..., {merge: true})`, então os campos novos sobrevivem ao save dele.

## Cloud Functions

Todos os gatilhos herdam a região de `global-options.ts` (São Paulo).

1. **`onUserWrittenSyncOrganizerPublicProfile`** (`users/{uid}`)
   - Projeta a identidade com uma função pura `buildOrganizerIdentity(userData)`: nome até 60,
     imagens só `https://`, WhatsApp normalizado para 55 + DDD + número.
   - Sai cedo se a projeção de `before` for igual à de `after`. `users` é gravado o tempo todo.
   - O que grava vem de `users/{uid}` e `organizers/{uid}` lidos na transação, não do `after`:
     gatilhos não chegam em ordem.
   - Usuário que nunca foi organizador e não tem doc público: não cria nada.
   - Perdeu o papel: `isOrganizer: false`, `listed: false`. Identidade e números ficam.
   - Usuário apagado: apaga o doc público. Os seguidores ficam órfãos, sem problema: nada os
     lê sem o doc.
2. **`onOrganizerRecordWrittenSyncVerified`** (`organizers/{uid}`): `verified` = o doc existe,
   lido na transação.
3. **`onTournamentWrittenOrganizerStats`** (`tournaments/{id}`)
   - Só age se mudou algum campo relevante: `managerId`, `listingStatus`, `visibility`, `sport`,
     `startAt`, `locationName`, `arenaId`, `city`, ou se o doc foi criado ou apagado. Placar e
     `categoryOps` não disparam nada.
   - Recalcula `stats` do `managerId` com `computeOrganizerStats(tournaments)`, função pura sobre
     todos os torneios do organizador.
   - **Atletas** só são recontados quando o torneio envolvido está ou esteve `completed`.
     Nos outros casos, o valor anterior é preservado.
   - Grava `stats` inteiro com `update` (substitui o mapa), mais `listed`.
4. **`onOrganizerFollowerWritten`** (`organizerPublicProfiles/{uid}/followers/{f}`): criação
   soma 1, remoção subtrai 1 de `followersCount`. Só em doc existente: não ressuscita perfil
   apagado.
5. **`onTournamentWrittenNotifyOrganizerFollowers`** (`tournaments/{id}`)
   - Dispara na transição para "inscrição aberta e listado". Antes não era `open && listado`;
     depois é.
   - Cria a trava com `create()`. Se ela já existe, para: um evento só avisa uma vez, mesmo que
     reabra. Se a trava existente ainda está `scheduled`, ela segue a data nova.
   - Evento já aberto que muda `registrationOpensAt`: trava `scheduled` vai para a nova data, ou
     para agora se a data foi adiantada ou limpa.
   - `registrationOpensAt` no futuro: trava com `status: 'scheduled'` e `sendAt`. Senão, cria com
     `status: 'sending'`, envia na hora e grava `status: 'sent'`. Se a function cair no meio, o
     reenvio do gatilho encontra a trava e não repete: preferimos perder um aviso a duplicar.
6. **`sendScheduledOrganizerFollowerPushes`** (agendada, a cada 5 minutos): pega as travas
   `scheduled` com `sendAt <= agora`. Confere se o torneio continua aberto e listado. Envia, ou
   marca `skipped`. A reivindicação (`scheduled` → `sending`) é feita numa transação, então duas
   execuções simultâneas não enviam duas vezes. Se o organizador adiou `registrationOpensAt`, a
   trava volta para `scheduled` com o novo `sendAt`.
7. **Envio** (`notifyOrganizerFollowers`):
   - Destinatários: todos os seguidores, menos o próprio organizador.
   - Usa `deliverNotificationToUser` (push e caixa de entrada) em lotes de 20.
   - `type: 'organizer_event_registration_open'`
   - `title: '{name} abriu inscrições'`
   - `body: '{tournamentName} · {dd/MM} · {locationName}'`. Partes vazias somem.
   - `data: { url: '/torneios/{id}', webUrl: '/torneios/{id}', tournamentId, organizerId }`. A
     rota existe no app e no portal, e builds antigos do app abrem `url` que começa com `/`.
8. **Backfill**: `functions/scripts/backfill-organizer-public-profiles.js`. Simula por padrão;
   grava com `--yes`; `--project` obrigatório. Para cada usuário com papel de organizador, roda
   identidade, verificado, `stats` (com atletas) e conta os seguidores. Semeia trava `skipped`
   para eventos listados já abertos ou fechados, para um fechado→aberto depois do deploy não
   avisar no meio de um evento antigo. Falha de um organizador não interrompe os outros.

## Edição pelo organizador

**Painel web, `/painel/config`.** Card novo "Perfil público", separado do card "Perfil":
- Capa: upload redimensionado para 1600 px de largura (JPEG), com prévia 4:1 e botão de remover.
- Bio: textarea com contador até 280.
- Switch "Mostrar botão de WhatsApp no meu perfil". Usa o telefone de contato do card "Perfil".
  Desabilitado, com dica, quando o telefone está vazio.
- Link "Ver meu perfil público", que abre `/organizadores/{uid}` no portal do atleta.

**App, modo organizador.** Tela nova "Perfil público" (`/organizer/perfil-publico`), com entrada
pela home do organizador:
- Edita nome da organização, logo, capa, bio, cidade/UF, telefone de contato (WhatsApp) e o
  switch de público.
- Mostra uma prévia do cabeçalho e o link "Ver meu perfil".

**Gravação, nas duas superfícies:**
- Só os campos da tela, por caminho pontilhado (`organizerProfile.bio` etc.). O resto do mapa
  nunca é reenviado.
- O payload é montado por uma função pura com teste.

**Validação:**
- Bio ≤ 280.
- Nome 2–60.
- Imagens até 5 MB antes de redimensionar.
- UF da lista fixa.

## O que o atleta vê (portal e app)

**Rotas**
- Portal: `/organizadores` e `/organizadores/:organizerId`, ambas com `authGuard` e
  `onboardingGuard`. O prefixo `/organizadores` entra em `COMPETIR_PREFIXES`.
- App: `/competir/organizadores` e `/competir/organizadores/:organizerId`.

**Cabeçalho**
- Breadcrumb "Competir › Organizadores › Nome" no portal. No app, AppBar com voltar.
- Capa (ou gradiente), logo quadrado (ou iniciais), nome, selo verificado.
- "Cidade · UF" e "Organizador desde AAAA".
- Números: eventos realizados, atletas, nota média e seguidores. A nota só aparece com
  reputação pública (3 ou mais avaliações).
- Ações:
  - Compartilhar: copia o link do portal; no app, abre o share sheet.
  - Mensagem: abre `https://wa.me/{whatsapp}`, só quando `whatsapp` existe.
  - Seguir/Seguindo: otimista, desfaz em caso de erro. Some no próprio perfil.
- Chips de esporte.

**Abas**
- **Visão geral**
  - Até 3 próximos eventos (abertos ou fechados, que não terminaram), por data. Cada card tem:
    - Selo de estado: Inscrições abertas, Últimas vagas (preenchimento ≥ 80%), Ao vivo, Em breve
      (`registrationOpensAt` no futuro) ou Inscrições encerradas.
    - Tipo: Torneio, ou Liga · Etapa N.
    - Nome, data e local.
    - Barra de vagas com a contagem real de inscrições.
    - "a partir de R$ X por dupla".
    - Botão Inscrever (inscrição aberta) ou Acompanhar, que leva ao evento.
  - Histórico: 3 últimos realizados, com data, número de duplas e os campeões da primeira
    categoria. Mais "Ver os N".
  - Lateral: bio, "Onde acontece" e card de reputação (nota, estrelas, número de avaliações,
    barras dos 5 aspectos). Mais "Ver todas".
- **Eventos**: próximos e realizados, em grupos.
- **Resultados**: realizados, com os campeões de cada categoria.
- **Avaliações**: nota geral, distribuição de 1 a 5, os 5 aspectos e a nota por evento
  (resumos `closed` com `count ≥ 3`). Sem texto de comentário.

**Lista "Organizadores"**
- Fonte: `organizerPublicProfiles where listed == true`.
- Busca por nome e cidade, feita no cliente.
- Ordem: `openEvents > 0` primeiro, depois `followersCount`, depois nome.
- Card: logo, nome, selo, cidade/UF, nota, eventos realizados, seguidores e "N com inscrição
  aberta".

**Entradas**
- Portal: "Organizado por X" no cabeçalho do torneio vira link, e o card "Organizado por" da liga
  linka por `managerId`. O nome passa a vir de `organizerPublicProfiles`, com fallback para
  `public_profiles`.
- App: a seção do organizador no detalhe do torneio fica tocável.
- Card "Organizadores" no hub Competir, nas duas superfícies.

**Estados**
- Organizador inexistente ou sem doc: "Organizador não encontrado", com botão para a lista.
- Sem próximos eventos: aviso com convite a seguir.
- Reputação sem nota: "Ainda sem avaliações suficientes".
- Erro de rede: mensagem com "Tentar de novo".

**Portal: orçamento de bundle**
- Rotas com lazy load.
- Nada novo no `app.routes.ts` além de `loadComponent`.
- Estilos divididos em subcomponentes para ficar abaixo do limite de 24 kB por componente.

## Fases e PRs

1. **Backend:** coleções, regras, índices, functions, backfill e testes. Inclui esta spec.
2. **Painel do organizador:** card "Perfil público".
3. **Portal do atleta:** perfil, lista, links e card no Competir.
4. **App:** perfil, lista, links e editor no modo organizador.

As fases 2 a 4 dependem só do contrato desta spec e podem ser feitas em paralelo.

## Ordem de deploy

1. Regras e índices.
2. Functions.
3. Backfill no dev: primeiro simulando, depois com `--yes`.
4. Painel do organizador.
5. Portal do atleta. Antes do backfill, ele mostraria "Organizador não encontrado".
6. App, que vai no próximo build da loja.

## Riscos aceitos

- **O push alcança só instalações vivas**, cerca de 13% da base na medição de 10/09. A caixa de
  entrada segura o resto.
- **Evento "por link" que vira público com a inscrição aberta dispara o push nessa hora.** É
  quando ele passa a existir para o público.
- **"Onde acontece" agrupa pelo nome digitado.** Grafias diferentes viram locais diferentes.
- **"Organizador desde" é o ano do primeiro evento listado**, não o do cadastro.
- **A lista de seguidores é legível por qualquer logado**, igual à de arenas e atletas.

## Fora do escopo

- Comentários de atleta.
- `@handle`.
- Aba "Seguindo".
- Página no site sem login.
- Filtros da lista.
