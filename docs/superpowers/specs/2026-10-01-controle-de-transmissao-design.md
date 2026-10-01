# Controle de transmissão no torneio

Portal do organizador (Angular) + rules + Cloud Functions + app Flutter (só o papel novo).
Uma tela "Transmissão" em cada torneio, de onde a equipe controla o que o overlay do OBS
mostra — e que serve de base para os gráficos que ainda vão nascer.

Este spec é o **sub-projeto 1** de três. Os outros dois só plugam gráficos no registro
definido aqui:

1. **Controle de transmissão** (este) — infraestrutura, gráficos que já existem, tarja de
   entrevista e o papel "Mídia".
2. **Jogos** — próximos na quadra, agenda do dia, ao vivo nas outras quadras.
3. **Resumo** — da partida, da categoria, resultados recentes.

## Problema

O overlay (`/overlay/:matchId` e `/overlay/:tournamentId/quadra/:courtId`) já desenha placar
de duelo, faixa KOTC, elenco antes do apito, classificação e classificadas da rodada,
campeões, doação PIX e patrocinadores. Mas **todo o controle é local ao OBS**:

- parâmetros de URL (`?tela=`, `?pos=`);
- atalhos de teclado na janela "Interagir" (D/O/P/L/setas);
- console `window.NXOverlay.set(...)`;
- "Grande final" por `localStorage` + `BroadcastChannel` (`overlay-final-sync.ts`).

O último só alcança abas do **mesmo navegador**. O OBS roda um navegador próprio (CEF), então
o botão "Grande final" da mesa nunca chega na transmissão. E quem opera a live não tem como
esconder o placar durante uma entrevista, nem pôr um gráfico no ar, sem mexer no OBS.

## Decisões (do dono, 01/10/2026)

1. **Uma transmissão por torneio, de uma quadra.** O controle é do torneio; o painel escolhe
   qual quadra a transmissão acompanha e pode trocar no meio do evento.
2. **Automático + chave.** Tudo o que hoje é automático continua automático; cada gráfico
   ganha uma chave de ligar/desligar. Gráficos sob demanda (a tarja) só entram quando alguém
   manda.
3. **Reporter = tarja de entrevista com dados do atleta** (nome, foto, parceiro, categoria),
   escolhido entre os atletas do torneio. Sem texto livre, sem letreiro.
4. **Quem opera:** gestão (dono, gestor, administrador) e um **papel novo, "Mídia"**. Mesário
   não.
5. **Estado num doc dedicado** (`tournaments/{id}/broadcast/control`), não no doc do torneio.
6. **Entrega em duas partes / dois PRs:** Parte A (controle + tarja, operado pela gestão) e
   Parte B (papel Mídia).

### Por que não no doc do torneio

Toda escrita em `tournaments/{id}` dispara `community-feed` e `search-keywords-sync` e chega
a todos que escutam o torneio (app, `/t/`, telão, LED). Pôr a tarja no ar 30 vezes numa
tarde seriam 60 execuções de função e uma onda de snapshots para quem nem está vendo a live.
E dar à mídia permissão de escrita "só neste campo" do doc mais sensível do sistema é risco
sem ganho. Realtime Database foi descartado: infraestrutura nova, e o Firestore entrega em
menos de 1 s, o que basta para gráfico de transmissão.

---

# Parte A — Controle de transmissão + tarja de entrevista

## A1. Dados

Documento `tournaments/{tournamentId}/broadcast/control`. **Ausente = default = o
comportamento de hoje**: nenhuma transmissão existente muda ao publicar esta parte.

```ts
interface BroadcastControl {
  /** Quadra que `/transmissao/:tournamentId` acompanha. null = nenhuma escolhida. */
  courtId: string | null;
  /** Chave de cada gráfico automático. Campo ausente = ligado. */
  graphics: {
    scoreboard: boolean;   // placar de duelo
    kocBar: boolean;       // faixa da rodada KOTC
    kocPreRound: boolean;  // "Próximos em quadra" (elenco antes do apito)
    kocRoundEnd: boolean;  // classificação + classificadas da rodada
    champions: boolean;    // campeões da categoria
    donation: boolean;     // ciclo da doação PIX
    sponsors: boolean;     // ciclo dos patrocinadores
  };
  /** Tela do fim de rodada KOTC. Substitui `?tela=` e as setas como controle remoto. */
  kocRoundEndScreen: 'rodizio' | 'resultado' | 'classificadas';
  /** Visual de Grande final. 'auto' = segue o matchType (comportamento de hoje). */
  finalMode: 'auto' | 'on' | 'off';
  /** Tarja de entrevista no ar. null = fora do ar. */
  interview: {
    name: string;
    photoUrl: string | null;
    partnerName: string | null;
    categoryName: string | null;
    /** Segundos no ar. null = fica até "Tirar do ar". */
    durationSec: number | null;
    /** Identidade do comando (Date.now() do painel no clique). */
    shownAt: number;
  } | null;
  /** "Mostrar agora" — carimbos, não estados. */
  commands: {
    donationNowAt: number;
    sponsorsNowAt: number;
  };
  updatedAt: Timestamp;
  updatedBy: string;
}
```

Parser puro `broadcastControlFromRaw(raw): BroadcastControl` com os defaults (tudo ligado,
`rodizio`, `auto`, `interview: null`, carimbos 0). Valor desconhecido cai no default do
campo, não derruba o doc.

**A tarja é desnormalizada.** O painel grava nome, foto, parceiro e categoria no clique. O
overlay só desenha: zero leitura extra, e funciona para qualquer atleta do torneio, não só
os da partida em quadra.

**Comandos são carimbos.** O overlay guarda os valores do primeiro snapshot como **linha de
base** e só age quando um valor muda depois dela. Recarregar o OBS não repete um "mostrar
agora" antigo nem reabre uma tarja já encerrada. Vale o mesmo para `interview.shownAt`: tarja
com `shownAt` igual ao da linha de base e `durationSec` não nulo é tratada como já expirada.

**Duração contada pelo overlay**, a partir de quando ele recebeu o comando — não comparando
`shownAt` com o relógio local, porque o painel e o OBS podem estar em máquinas com relógios
diferentes.

## A2. Rules

```
match /tournaments/{tournamentId} {
  match /broadcast/{docId} {
    allow read: if true;                         // OBS não tem login
    allow create, update: if docId == 'control' &&
      canManageTournament(tournamentId) &&       // Parte B soma a mídia aqui
      request.resource.data.keys().hasOnly([
        'courtId', 'graphics', 'kocRoundEndScreen', 'finalMode',
        'interview', 'commands', 'updatedAt', 'updatedBy'
      ]) &&
      request.resource.data.updatedBy == request.auth.uid;
    allow delete: if false;
  }
}
```

Leitura pública é segura: nome e foto já são públicos em `public_profiles`; quadra e chaves
não são sensíveis. Escrita direta do cliente (`setDoc` com `merge`), sem callable — mesma
exceção consciente do `bigScreen`: é preferência de exibição, não estado de jogo.

Testes no harness de rules (`functions/test/*.rules.test.mjs`): leitura anônima; escrita
pelo dono, gestor e administrador; recusa ao mesário, a anônimo, a docId ≠ `control`, a
campo fora do allowlist e a `updatedBy` de outra pessoa.

## A3. Overlay

### Rota nova

`/transmissao/:tournamentId` — pública, sem guard, servindo o **mesmo**
`OverlayPageComponent`. O fundo transparente já vem do `body:has(og-overlay-page)`.

O `OverlayLiveGateway` ganha um terceiro modo: escuta o doc de controle e, quando `courtId`
muda, desfaz a assinatura da quadra anterior e chama `startCourt(tournamentId, courtId)`
(mesmo `overlayCourtContextOf` do painel de LED — a regra de "qual partida está nesta quadra"
continua num lugar só). Sem quadra escolhida, placar e KOTC não aparecem; tarja, doação e
patrocínio funcionam, porque não dependem de partida.

### Todas as URLs obedecem ao painel

`/overlay/:matchId` e `/overlay/:tournamentId/quadra/:courtId` também escutam o doc de
controle, pelo `tournamentId` da rota ou da partida. Só a `/transmissao` segue a quadra do
painel. Listener novo: `watchBroadcastControl(tournamentId)` em repositório próprio
(`broadcast-control-repository.ts`), um doc só.

### Quem decide o que aparece

Função pura `overlayLayersOf(control, auto)`, em que `auto` é o que a página já calcula hoje
(`duelView`, `kocView`, `preRound`, `standings`, `campeoes`…). Regras:

- Cada gráfico automático aparece quando a regra de hoje manda **e** a chave dele está
  ligada.
- **Tarja no ar toma a tela.** Placar, faixa KOTC, elenco, fim de rodada e campeões saem (com
  a animação de saída que já têm) e voltam quando a tarja sai. Placar de duelo e faixa KOTC
  ficam no rodapé, exatamente onde a tarja entra; o card de campeões cobriria a câmera da
  entrevista.
- Os ciclos de doação e patrocínio tratam tarja no ar como "ocupado", como já tratam pódio e
  pausa (`patroOcupado`).
- Chave `donation`/`sponsors` desligada para o ciclo (`doacaoCycleStop` / ciclo do patro
  desligado). Carimbo novo em `commands` = "mostrar agora".
- **Precedência da tela de fim de rodada:** clique local (janela Interagir do OBS) > escolha
  do painel > `?tela=` > rodízio. Uma mudança no painel depois do clique local volta a mandar.
- **`finalMode`** substitui o `localStorage` + `BroadcastChannel`: `auto` segue o matchType,
  `on`/`off` forçam. `overlay-final-sync.ts` sai; o botão "Grande final" da mesa
  (`turnOnOverlayFinal`) passa a gravar `finalMode: 'on'` no doc de controle. A preferência
  antiga em `localStorage` é ignorada.

### Continua igual

Atalhos D/O/P/L/setas e o console `NXOverlay` seguem como ajuste local de quem está no OBS.
**Chave PIX e tempos da doação continuam só no console** — pôr no painel quem recebe dinheiro
é outra conversa.

### Tarja de entrevista

Componente `og-overlay-interview`: terço inferior à esquerda, foto redonda, nome grande e uma
linha "Categoria · com Parceiro" (cada parte some se vier nula). Painel **opaco** (lição do
overlay atual: translúcido brigava com o fundo), entrada e saída deslizando,
`pointer-events: none`, `prefers-reduced-motion` respeitado. Visual na linguagem do placar de
duelo; se o dono mandar mockup, o mockup manda.

### Falhas

Doc ausente = default. Queda de conexão mantém o último estado conhecido. Erro continua
sendo **nada na tela**, nunca spinner ou caixa vazia por cima do vídeo.

## A4. Painel — tela "Transmissão"

Rota `eventos/:id/transmissao`, item "Transmissão" nas ferramentas do torneio
(`torneio-detalhe.component.ts`, ao lado de Telão) e no menu lateral do shell. Ícone novo
`broadcast` no `og-icon`. Os links "Overlay" de Jogos e da Mesa ficam como estão.

Ordem no celular (no desktop, duas colunas):

1. **Saída** — URL `/transmissao/:id` com botão de copiar e dica "Browser Source
   1920×1080"; seletor de quadra em chips, cada um com o que está em quadra agora (ao vivo ou
   próxima, via `courtNowOf`).
2. **Entrevista** — atalhos com os atletas da partida da quadra escolhida; busca por nome em
   todos os atletas do torneio; duração **20 s** (padrão) / 1 min / até tirar; botão
   grande "Pôr no ar". No ar: "No ar: Fulano · 0:12" e "Tirar do ar". "Tirar do ar" grava
   `interview: null`. A expiração por duração **não escreve nada**: o painel deriva "no ar"
   de `shownAt + durationSec` (o `shownAt` é o relógio do próprio painel que gravou) e volta
   ao estado "fora do ar" sozinho; o overlay faz a mesma conta com o próprio relógio.
3. **Gráficos** — linhas desenhadas a partir do registro (A5), em grupos: *Partida*
   (Placar), *King of the Court* (faixa da rodada, próximos em quadra, fim de rodada com
   Rodízio/Resultado/Classificadas — grupo só aparece se alguma categoria for KOTC),
   *Encerramento* (Campeões, Grande final Auto/Ligado/Desligado), *Patrocínio*
   (Patrocinadores e Doação PIX, cada um com chave + "Mostrar agora").
4. **Prévia do ar** — iframe de `/transmissao/:id?preview`: mostra exatamente o que vai pro
   OBS. No celular fica recolhida.

**Fonte dos atletas:** equipes que aparecem nas partidas do torneio (`matches`, leitura
pública) → `fetchTeamsByIds` → `fetchProfileDisplays` (nome e foto). Tudo de coleções
públicas, então o mesmo código serve à gestão e à mídia (que não lê `inscriptions`). Antes da
chave existir a lista fica vazia — aceitável, porque a transmissão acontece com jogos.

**Escrita:** cada clique grava na hora (`setDoc(merge)` com `updatedAt`/`updatedBy`). A tela
escuta o próprio doc, então dois operadores veem o mesmo estado. Falha de escrita: a chave
volta e aparece mensagem na linha, sem diálogo.

## A5. Registro de gráficos (a extensibilidade)

`painel/transmissao/broadcast-graphics.ts`:

```ts
interface BroadcastGraphicDef {
  id: keyof BroadcastControl['graphics'];
  nome: string;
  descricao: string;
  grupo: 'partida' | 'koc' | 'encerramento' | 'patrocinio';
  controle: 'chave' | 'chave+agora';
  /** O grupo/linha só aparece quando faz sentido para o torneio (ex.: KOTC). */
  aparece?: (t: OrganizerTournament) => boolean;
}
```

Controles de modo (fim de rodada, Grande final) e a tarja são seções próprias da tela, não
linhas do registro. Um gráfico novo (sub-projetos 2 e 3) = entrada aqui + campo em
`graphics` (e no allowlist das rules, que lista as chaves de topo — `graphics` é mapa) +
componente no overlay + regra em `overlayLayersOf`.

---

# Parte B — Papel "Mídia"

## B1. Backend (`functions/src/tournament-staff-sync.ts`)

- `TOURNAMENT_STAFF_ROLES` ganha `"media"`; `staffRoleLabel` devolve `"mídia"`.
- `staffRoleGrantsOrganizerAccess` concede `organizer` à mídia **explicitamente** (hoje já
  concederia pelo `!== "scorer"`, mas por acidente). É ela que libera o login no portal.
- **Varredura das callables por área:** `assertCanManageTournament` já exige
  `role === "manager"`, então a mídia fica fora sem mudança — mas toda callable que lê
  `tournaments/{id}/staff` precisa ser conferida (não só as que importam `tournament-acl`).
  Nenhuma pode aceitar "qualquer staff ativo".

## B2. Rules

- Allowlist de papel do doc de staff: `['manager', 'eventAdmin', 'scorer', 'media']`.
- `broadcast/{docId}`: `canManageTournament(tournamentId) || isTournamentStaff(tournamentId,
  ['media'])`.
- Mídia **não** entra em `canManageTournament` nem `canScoreTournament`. Varredura das rules:
  nenhuma regra pode tratar staff ativo sem lista de papéis.
- Testes: mídia escreve o controle; mídia é recusada no doc do torneio, em partidas,
  inscrições e no caixa.

## B3. Portal (RBAC por área, não por lista de botões)

- `TournamentRole` ganha `'media'`; `roleFromStaffMirror` reconhece; o torneio entra em Meus
  Torneios. `roleReachesMoney('media')` é falso (Financeiro fora).
- Guard nas rotas `eventos/:id/**`: mídia é redirecionada para `eventos/:id/transmissao`. A
  página do torneio e o menu mostram só esse item. Varredura por área: toda rota filha de
  `eventos/:id`, toda ação da página do torneio, Início e Eventos.
- Tela Equipe: chip "Mídia", descrição "Opera a transmissão (overlays do OBS)".

## B4. App Flutter

- Enum `media('media', 'Mídia')` + descrição em `tournament_staff_models.dart`.
- `hasActiveTournamentStaffAccess` (e o que libera `isOrganizerStaffOperablePath`) **exclui a
  mídia**: ela não opera nada no app; a transmissão é só no portal.
- **Risco aceito, apps já publicados:** `TournamentStaffRole.fromValue` cai em gestor para
  papel desconhecido, então builds antigos mostram a mídia como gestora e liberam as telas de
  operação. As rules e callables são a fronteira: os botões aparecem e as escritas são
  recusadas. Mudar o default de app publicado não é possível.

## B5. Ordem de deploy

rules → functions → hosting do portal → app.

---

## Testes (as duas partes)

- Specs das funções puras: `broadcastControlFromRaw` (defaults, valor desconhecido),
  `overlayLayersOf` (cada chave, tarja tomando a tela, precedência do fim de rodada,
  `finalMode`), detecção de comando novo contra a linha de base (incluindo reload),
  expiração da tarja, `roleFromStaffMirror('media')`.
- Specs de componente: tarja, linhas do registro, guard da mídia.
- Testes de rules (A2, B2).
- `ng build organizer --configuration production` — obrigatório (AOT pega o que o Karma deixa
  passar) e conferir o budget de CSS.
- QA visual no Browser pane: tarja entrando e saindo com duração, chaves refletindo na
  prévia, troca de quadra, "Mostrar agora" de doação/patrocínio, URLs antigas obedecendo.

## Fora do escopo

- Gráficos de jogos e resumo (sub-projetos 2 e 3).
- Editar chave PIX e tempos da doação/patrocínio no painel.
- Várias saídas por torneio; pareamento por código.
- Tarja de texto livre e letreiro de mensagens.
