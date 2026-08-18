# Compartilhar campanha — portal do atleta

Data: 2026-08-17
Superfície: `frontend/projects/athlete` (Angular)
Protótipos: Campeão (6 jogos), Vice-campeão (6 jogos), Terceiro lugar (5 jogos), Eliminado (4 jogos)

## Problema

O portal já compartilha três coisas como imagem: o pôster de uma partida, a inscrição confirmada
e o ranking de palpites. Falta a que o atleta mais quer postar quando o torneio acaba — a
**campanha inteira**: como ele terminou, contra quem jogou, com que placar, em uma imagem 9:16
pronta para stories.

A seção Trajetória do Modo Focus já desenha exatamente esses dados na tela. O comentário de
abertura do componente registra o botão de compartilhar como "trabalho futuro deliberado"
(`focus-journey.component.ts`). Esta spec é esse trabalho.

## Decisões

1. **A colocação sai do `matchType` da partida, nunca do `round`.** É a armadilha que este
   projeto já documentou duas vezes: a disputa de 3º lugar recebe o mesmo `round` da final, e
   quem decide por round coroa um terceiro colocado como campeão.
2. **Nada de simulação.** A colocação só é afirmada quando existe partida encerrada que a prove.
   Sem isso, o card sai como CAMPANHA — que é uma resposta honesta, não um estado de erro.
3. **Uma arte nova em arquivo próprio**, como as outras três. `share-canvas.ts` continua sendo só
   infraestrutura (medir, cortar, carregar, marca, paleta base).
4. **Duas entradas**, porque a única que já existia (Focus) fica inalcançável justamente depois do
   torneio, que é quando o card vale mais.
5. **Categoria de equipe (trio/quarteto/quinteto) fica de fora desta entrega**, com o botão
   escondido — melhor não oferecer do que sair com 2 dos 5 atletas.

## A regra de colocação

Uma função pura, quatro regras, na ordem. Só partidas **encerradas** entram: a leitura é por
`outcomeOf`, que já exige `matchIsCompleted` e `winnerId`.

| # | Condição na categoria do atleta | `CampaignPlacement` | Título no card |
|---|---|---|---|
| 1 | venceu a partida de `matchType` `Final` / `Grand Final` | `champion` | CAMPEÃO |
| 2 | perdeu a partida de `matchType` `Final` / `Grand Final` | `runner-up` | VICE-CAMPEÃO |
| 3 | venceu a partida de `matchType` `Third Place` | `third` | TERCEIRO |
| 4 | qualquer outro estado | `none` | CAMPANHA |

### Por que essa regra vale igual nos dois formatos

Verificado no gerador (`functions/src/category-bracket-builders.ts`):

- **Eliminação simples**: a final é gravada com `matchType: "Final"`; a disputa de 3º com
  `"Third Place"` (existe quando `n >= 4 && totalRounds >= 2`).
- **Dupla eliminação** (modelo de semifinais paralelas): a grande final também é `"Final"`, e a
  disputa de 3º também é `"Third Place"` (vice WB × vice LB). **Não há bracket reset** — o
  perdedor da final da WB não volta para a LB. Logo não existe "duas grandes finais", e a regra 2
  nunca afirma vice enquanto a decisão ainda está em aberto.

Ou seja: a DE **não perde** o TERCEIRO por falta de uma disputa de 3º real, e não precisa de um
ramo conservador próprio. Nenhum caso especial por formato.

### O que a regra deliberadamente NÃO faz

- **4º lugar não tem card próprio.** Quem perde a disputa de 3º cai em `none` (CAMPANHA) — os
  protótipos definem quatro tipos, e este é o quarto.
- **Não deriva de `bracketWorstPlaceOf`.** Aquela função responde outra pergunta ("o que a
  premiação já garante") e é conservadora de propósito: devolve 4º para quem *venceu* a disputa
  de 3º. Encadear as duas traria essa conservação para um lugar onde ela estaria simplesmente
  errada — aqui a campanha acabou e o resultado é conhecido.
- **Não detecta eliminação que aconteceu só na fase de grupos.** Mesma decisão de `winsToTitleOf`
  e `qualificationOf`: exigiria simular o desempate. Um atleta eliminado no grupo cai em `none`,
  que é o card certo para ele de qualquer maneira.
- **Não usa `round` em nenhum ramo.**

`isFinalMatchTypeOf` (hoje privada em `focus/focus-journey.ts`) passa a ser exportada e
compartilhada, em vez de copiada. Os comentários daquele arquivo registram que copiar essa regra
já deixou duas funções em desacordo entre rounds de review.

## Os dados do card

```ts
export type CampaignPlacement = 'champion' | 'runner-up' | 'third' | 'none';

export interface CampaignRow {
  outcome: 'win' | 'loss';
  /** "GRUPO A · J1", "QUARTAS", "LB · RODADA 1", "DISPUTA DE 3º", "FINAL". */
  phaseLabel: string;
  opponentName: string;
  /** "2–0", em sets, do ponto de vista do atleta. */
  setScore: string;
  /** "21-15 21-18" — parciais na mesma ótica. */
  partials: string;
}

/** Declarado aqui, não importado de `match-share-card.ts`: as duas artes não se acoplam — é o
 *  princípio que `share-canvas.ts` enuncia (infraestrutura é compartilhada, desenho não). */
export interface CampaignPlayer {
  initial: string;
  photo: string | null;
}

export interface CampaignShareData {
  placement: CampaignPlacement;
  /** "Masculino B · Duplas". */
  categoryLine: string;
  teamName: string;
  players: [CampaignPlayer, CampaignPlayer];
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  /** "Aprov. 83%" — `null` sem partida encerrada (estado que o portão já impede). */
  winRateLabel: string | null;
  rows: CampaignRow[];
  tournamentName: string;
  locationName: string | null;
  /** "25–26 ABR 2026"; "26 ABR 2026" em evento de um dia; `null` sem `startAt`. */
  dateRangeLabel: string | null;
}
```

Regras de montagem:

- **Só partidas encerradas viram linha**, em ordem cronológica (`byScheduleTime`). Partida
  pendente, ao vivo ou cancelada não entra: o card conta o que aconteceu.
- **Tudo na ótica do atleta.** Quando ele é o lado B, sets e parciais invertem. É a mesma lição
  que `mySetsLabelOf` já carrega: ler o placar cru faria parecer que ele perdeu o set que venceu.
- **Rótulo de fase com o prefixo do grupo de volta** — "GRUPO A · J1", não "J1". A tela do Focus
  corta o prefixo porque a seção já se intitula "Grupo A"; numa imagem solta esse contexto não
  existe. Grupo usa `groupLabelOf` + `roundDisplayNumberOf`; mata-mata usa `knockoutLabelOf`.
- **Chave dos perdedores mantém o rótulo do app** ("LB · Rodada 1"), não vira "Repescagem" como no
  protótipo. Decisão do dono: o card nunca discorda da tela.
- `wins`/`losses`/`setsWon`/`setsLost` saem de `tournamentNumbersOf`, que já existe; `winRateLabel`
  é `wins / (wins + losses)` arredondado.
- `categoryLine` = `categoryName` + formato, e formato é `teamSize == null ? 'Duplas' : …` — mas
  categoria de equipe nem chega aqui (ver Fora de escopo).

## A arte (`campaign-share-card.ts`)

1080×1920 como os outros três cards — proporção de Stories e status do WhatsApp.

### Paletas

| Variante | Fundo | Tinta | Acento (título) | Selo |
|---|---|---|---|---|
| `champion` | laranja `#ff6a1a` | preta `#0a0a0a` | preta (o próprio fundo já é a festa) | — |
| `runner-up` | quase-preto `#0a0a0a` | `INK` | prata `#c8cdd4` | `2º LUGAR` |
| `third` | quase-preto `#0a0a0a` | `INK` | bronze `#c88a4f` | `3º LUGAR` |
| `none` | quase-preto `#0a0a0a` | `INK` | laranja `#ff6a1a` | — |

Nas três variantes escuras, um halo radial do acento no canto superior direito. No `champion`, um
disco de laranja mais claro na mesma posição.

V/D das linhas: verde `#2bd17e` e vermelho `#ff3b30` — as duas cores já vivem no portal
(`AVATAR_GRAD` e `LIVE`).

### Estrutura vertical

Margem lateral 72, igual à do pôster de partida.

1. **Cabeçalho** — marca + wordmark à esquerda (mesma geometria de `match-share-card.ts`: logo
   60×60 no topo 85, wordmark com baseline 138), intervalo de datas à direita em mono tracked.
2. **Kicker** — `categoryLine` em mono tracked; o selo de colocação, quando existe, ao lado.
3. **Título** — Sora 800, o maior elemento do card, com `fitFont` + `truncate` emparelhados.
4. **Nome da dupla** — Sora 800 médio.
5. **Avatares** — dois círculos sobrepostos à esquerda (`drawPair` no espírito do pôster de
   partida), com `5V · 1D` em mono à direita deles.
6. **Painel da trajetória** — retângulo arredondado, cabeçalho `TRAJETÓRIA · N JOGOS` à esquerda e
   `SETS 10–5` à direita, depois uma linha por partida.
7. **Rodapé** — divisor, nome do torneio, `arena · Aprov. 83%`; à direita `BAIXE O APP` +
   `nexago.app`.

**O painel é ancorado no rodapé e cresce para cima.** É o que faz os quatro protótipos
funcionarem com número diferente de jogos: com 4 linhas sobra respiro no meio, com 6 o painel
encosta no bloco de cima.

### Transbordo — o painel cabe 6 linhas no passo largo, 8 no apertado

**Valores confirmados na implementação.** O painel cresce para cima a partir do rodapé, e a borda
inferior das fotos do atleta fica em y=651. No passo do protótipo (130px) a sétima linha já
invade as fotos; no passo apertado (104px) a nona também. Daí 6 e 8, e não os 7 e 9 que esta spec
estimou antes de a arte existir — `campaign-share-card.spec.ts` percorre 1..8 e falha se alguém
mexer nos tetos sem refazer a conta.

Uma campanha real passa disso (grupos + mata-mata, ou DE com várias rodadas de LB). Três degraus,
nesta ordem:

1. Acima de 7 linhas, a **fase de grupos colapsa numa linha só**: `GRUPO A · 3 JOGOS`, com `2V 1D`
   no lugar do placar. O mata-mata é a parte que conta a história.
2. Ainda passando, o **passo entre linhas encolhe** até um piso.
3. No limite, **corta as mais antigas** e o cabeçalho do painel passa a dizer `+N FORA`. O `N`
   conta **jogos, não linhas**: a linha de resumo vale pelo grupo inteiro, e ela própria é
   cortável — é a mais antiga de todas, e manter o começo da campanha à custa do fim inverteria a
   regra do corte.

O terceiro degrau é explícito de propósito: `fitFont` encolhe até o piso e devolve o texto inteiro
do jeito que estiver — encolher sozinho nunca garantiu encaixe neste projeto, e um corte silencioso
faria o card mentir sobre o tamanho da campanha.

### Uma mudança na infraestrutura compartilhada

`drawWordmark` hoje pinta "nexa" em `INK` e "GO" em `ORANGE`, fixo. No card do campeão, fundo
laranja, isso desaparece. Ganha dois parâmetros de cor **opcionais**, com os valores de hoje como
padrão: nenhum chamador existente muda.

## Diálogo e entradas

`CampaignShareDialogComponent` no molde de `MatchShareDialogComponent`: preview em `<canvas>`,
Web Share API com arquivo no celular, download como caminho equivalente no desktop, `AbortError`
não vira toast de erro, `Escape` fecha.

Recebe `data: CampaignShareData` pronta por `input`, como o diálogo de inscrição — quem monta é a
tela, não o diálogo. Isso deixa o diálogo idêntico nas duas entradas e mantém a montagem em função
pura, testável sem `TestBed`.

Duas entradas, mesmo portão: **a categoria tem ao menos uma partida encerrada do atleta** e
**não é categoria de equipe** (`teamSize == null`).

- **Focus → Trajetória** — botão no topo da seção.
- **Aba "Minha inscrição"** — segundo CTA no card da categoria, ao lado de "Compartilhar no story".
  Esta é a entrada que sobrevive ao fim do torneio: o link para o Focus só aparece enquanto
  `hasMyMatchToday()` for verdadeiro, e depois do evento o Focus deixa de ter caminho de volta.

O `teamId` da categoria sai de `store.myRegistrations()` (`{ teamId, categoryId }`), não de uma
varredura de partidas.

## Fora de escopo, com motivo

- **Categorias de equipe (trio/quarteto/quinteto).** Todo o ferramental do store (`duoPlayersOf`,
  `duoInitialsOf`, `duoAvatarsOf`) devolve exatamente dois atletas, e a arte desenha dois. Ler
  `memberUids` e desenhar uma fileira variável é uma segunda fase; até lá o botão não aparece
  nessas categorias, em vez de sair com o elenco pela metade.
- **Card do 4º lugar.** Os protótipos definem quatro tipos; o 4º usa CAMPANHA.
- **Link público / QR.** Nenhum dos cards do portal tem — o compartilhamento é só a imagem.
- **Projeção de ranking, XP e prêmio no card.** Mesma linha da seção Trajetória.
- **Compartilhar campanha de liga (várias etapas).** Este card é de um torneio.

## Arquivos

Novos, em `frontend/projects/athlete/src/app/tournaments/campaign/`:

- `campaign-share.ts` — `campaignPlacementOf`, montagem de `CampaignShareData`, colapso/corte das
  linhas. Funções puras, sem Angular e sem Firestore.
- `campaign-share.spec.ts`
- `campaign-share-card.ts` — a arte em canvas.
- `campaign-share-dialog.component.ts` / `.html` / `.scss`

Tocados:

- `tournaments/share-canvas.ts` — cores opcionais em `drawWordmark`.
- `tournaments/focus/focus-journey.ts` — exporta `isFinalMatchTypeOf`.
- `tournaments/focus/journey/focus-journey.component.html` / `.ts` / `.scss` — botão + diálogo.
- `tournaments/tabs/registration-tab.component.html` / `.ts` — segundo CTA + diálogo.

## Testes

`campaign-share.spec.ts`, sobre as funções puras (sem `TestBed` — o padrão de
`focus-journey.spec.ts`):

- **Colocação, eliminação simples**: venceu a final → `champion`; perdeu a final → `runner-up`;
  venceu o 3º → `third`; perdeu o 3º → `none`; eliminado nas quartas → `none`; só grupos → `none`.
- **Colocação, dupla eliminação**: venceu a grande final vindo da LB → `champion` (uma derrota no
  currículo não muda nada); perdeu a grande final → `runner-up`; venceu o 3º (vice WB × vice LB)
  → `third`.
- **Blindagem contra o bug de `round`**: partida de 3º lugar com o **mesmo `round` da final** —
  quem venceu o 3º sai `third`, e a final vencida por outra dupla não vira `champion` do atleta.
- **Ótica do atleta**: mesma partida com o atleta no lado A e no lado B produz o placar e as
  parciais invertidos.
- **Linhas**: só encerradas entram; pendente, ao vivo e cancelada ficam de fora; ordem cronológica.
- **Transbordo**: 8+ jogos colapsam o grupo; campanha longa demais corta e reporta `+N JOGOS`.

A arte em canvas não é testada — mesma linha dos outros três cards do portal.

## Riscos

- **Torneio antigo sem `matchType` nos padrões conhecidos.** A regra cai em `none` (CAMPANHA), que
  é o comportamento seguro: nunca afirma um pódio que não pode provar.
- **Foto de atleta sem CORS no bucket de produção.** `loadImage` resolve `null` e o desenho cai nas
  iniciais — a imagem nunca deixa de sair. O CORS de produção continua pendente, como nos outros
  cards.
- **Campanha muito longa em DE.** Coberta pelos três degraus de transbordo, com o corte declarado
  no cabeçalho do painel.
