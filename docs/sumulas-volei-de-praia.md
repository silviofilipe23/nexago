# Súmulas de vôlei de praia em PDF

`functions/scripts/generate-beach-scoresheets.js` gera **um PDF com a súmula de todos os jogos
de um torneio**: uma folha A4 por jogo, categorias na ordem do torneio e jogos pelo número.
O layout é o da súmula em papel (modelo ASAME), com as grades em colunas de largura fixa.
Os quadros de saque, as linhas de pontos e os quadros de baixo ficam alinhados.

O script **só lê** o Firestore e não grava nada.

## Uso

```bash
cd functions
gcloud auth application-default login   # se ainda não houver ADC
node scripts/generate-beach-scoresheets.js \
  --project volley-track-dev-4596c \
  --tournament <tournamentId> \
  --out ~/Downloads/sumulas.pdf
```

Opções:

| Flag | Padrão | Para quê |
|------|--------|----------|
| `--out` | `sumulas-<tournamentId>.pdf` | Caminho do PDF |
| `--competition` | nome do torneio + ano de início | Campo "Competição" |
| `--entity` | `ASAME` | 3ª linha do título da súmula |
| `--html` | arquivo temporário | Também salva o HTML (para ajustar o layout) |
| `--chrome` | Chrome/Chromium instalado, ou `CHROME_PATH` | Navegador que imprime o PDF |

Num worktree sem `node_modules`, prefixe o comando com
`NODE_PATH=<checkout principal>/functions/node_modules`.

> O PDF traz nomes reais de atletas. **Não salve dentro do repositório**, que é público.

## O que sai preenchido

- **Cabeçalho**: jogo, naipe (categoria), competição, fase (chave principal, repescagem, final…),
  local + quadra, data e hora (horário de Brasília), forma de disputa e origem das duplas
  (`Venc. jogo 7 / Perd. jogo 9`).
- **Sets**: as duplas e o placar de cada set. O início e o fim vêm dos `pointEvents` do placar
  eletrônico: o fim é o ponto que fechou o placar final, e os pontos desfeitos ficam de fora.
- **Resultado**: sets vencidos (V), pontos e duração por set, total, vencedor (`2 x 1`).
- **Equipes**: nome completo dos atletas (`users/{uid}.fullName`). O texto todo em caixa alta vira
  "Título".
- **W.O.** (`resultA/B == "W.O."`): os sets mostram "Partida decidida por W.O." e a explicação vai
  para Observações.
- Set que não aconteceu num jogo encerrado sai marcado "Set não disputado".

**Jogo ainda não encerrado** sai com a parte de resultado em branco. Dá para imprimir as súmulas
antes do evento, só com cabeçalho, duplas e horário.

## O que fica para a mão

Saque e rodízio (I–IV), pontos corridos, tempos, placar na troca de quadra, penalidades,
árbitros e assinaturas. O placar eletrônico não registra quem sacou primeiro em cada set, e é
isso que define qual dupla vai no quadro de cima.

## Código

- `functions/scripts/lib/beach-scoresheet.js`: regras puras (rótulos, horários dos sets, W.O.,
  vencedor, ordem).
- `functions/scripts/lib/beach-scoresheet-html.js` + `beach-scoresheet.css`: a folha em HTML.
- `functions/test/beach-scoresheet.test.mjs`: testes (`node --test test/beach-scoresheet.test.mjs`).

A súmula só tem espaço para 3 sets. Torneios em melhor de 5 sairiam incompletos.
