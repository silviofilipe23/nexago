# Artes de capa do perfil de equipe — prompts

Fallback de capa para `TeamPublicProfile` enquanto o atleta não pode enviar foto
própria. Mesma família visual das artes de esporte do perfil do atleta
(`assets/images/sports/`, ver `SportArtCatalog`): silhueta em contraluz,
preto + laranja, 3:2.

## Como gerar

- Uma imagem por mensagem no ChatGPT (mosaico 4-em-1 derruba a resolução de cada tile).
- Peça **1536 × 1024 (3:2 horizontal)**.
- Antes de commitar: `cwebp -q 90 -m 6 entrada.png -o saida.webp` (~1,6 MB → ~130 KB).
- Destino: `nexago_app/assets/images/team_covers/<arquivo>.webp`
  (subpasta precisa de linha própria no `pubspec.yaml`).

## BASE — cole em TODO prompt

> Fotografia esportiva cinematográfica, horizontal 3:2 (1536×1024).
> Contraluz forte de pôr do sol: os atletas aparecem como silhuetas pretas
> recortadas contra um céu laranja incandescente, com luz de recorte (rim light)
> âmbar desenhando ombros, braços e cabelo. Nenhum rosto legível — apenas
> silhuetas. Paleta exclusivamente preto + laranja/âmbar (#FF6A00), sem nenhuma
> outra cor saturada; pretos profundos, contraste alto, grão fotográfico sutil.
> O terço esquerdo do quadro é praticamente preto puro, sem nenhum elemento.
> O grupo de atletas fica à direita do centro; a área mais luminosa (sol,
> refletor) fica na metade inferior direita — o topo do quadro permanece escuro.
> A faixa central inferior fica limpa e escura (será coberta por avatares).
> Deixe ~12% de respiro no topo e no pé: a imagem será cortada em 16:9.
> Biotipos e cabelos variados (curtos e longos) — a equipe não deve parecer de um
> gênero só. Sem texto, sem números, sem logotipos, sem marcas d'água.

---

## Duplas

### 1. `beach_tennis_dupla.webp`
[BASE] Dupla de beach tennis na areia ao pôr do sol. Uma atleta está no ar, no
ponto alto do smash, raquete de beach tennis (pá curta, sem cordas, com furos)
acima da cabeça; a parceira está agachada junto à rede, raquete à frente do
corpo, pronta para a defesa. A rede de beach tennis cruza o quadro em diagonal
suave. Grãos de areia levantando sob os pés, faiscando na luz. A bolinha
suspensa no ar, recortada contra o disco do sol. Mar e horizonte ao fundo.

### 2. `volei_praia_dupla.webp`
[BASE] Dupla de vôlei de praia. Um atleta em suspensão, braço armado no ataque
acima da rede; o parceiro no chão, joelhos flexionados e braços unidos na base
de defesa, cobrindo o fundo da quadra. Bola de vôlei de praia recém-golpeada
acima da fita da rede. Areia explodindo sob o pé de impulso, mar calmo e sol
baixo no horizonte.

### 3. `futevolei_dupla.webp`
[BASE] Dupla de futevôlei na areia. Um atleta no meio de um shark attack: corpo
na horizontal, no ar, pé acima da fita da rede batendo na bola; o parceiro
agachado logo atrás, braços abertos, pronto para a cobertura. Bola de futevôlei
suspensa contra o sol. Rede em diagonal, mar ao fundo, areia em suspensão.

### 4. `tenis_dupla.webp`
[BASE] Dupla de tênis em quadra — **não é praia**. Fim de tarde, céu laranja
sobre o alambrado escuro. Um atleta no alto do saque: corpo arqueado, raquete
atrás das costas, bola no ápice; o parceiro à frente, junto à rede, agachado com
a raquete empunhada em posição de volley. Linhas da quadra fugindo em
perspectiva, refletindo a luz rasante.

---

## Trios

### 5. `volei_praia_trio.webp`
[BASE] Três atletas de vôlei de praia em quadra 3×3. Um salta para o ataque na
rede; os outros dois estão no chão, afastados, formando um triângulo de defesa
com joelhos flexionados e braços prontos. Bola no ar acima da rede. Areia,
rede em diagonal, mar e sol baixo ao fundo.

### 6. `futevolei_trio.webp`
[BASE] Trio de futevôlei na areia. Um atleta no ar em bicicleta junto à rede,
outro logo abaixo finalizando o levantamento com o peito, e o terceiro mais ao
fundo acompanhando a jogada em corrida. Bola de futevôlei contra o sol, areia
em suspensão, mar ao fundo.

### 7. `basquete_trio.webp`
[BASE] Basquete 3×3 em quadra urbana de concreto ao pôr do sol — **não é praia**.
Um atleta em suspensão no arremesso, bola saindo da mão; os outros dois em
marcação, braços erguidos, um deles em corrida para o rebote. Tabela e aro
recortados contra o céu laranja, alambrado escuro ao fundo, textura de concreto
no piso refletindo a luz.

### 8. `beach_tennis_trio.webp`
[BASE] Equipe de três atletas de beach tennis parados na areia, em fila
irregular, levemente escalonados em profundidade — retrato de equipe, não jogada.
Raquetes de beach tennis apoiadas no ombro ou penduradas ao lado do corpo,
postura confiante, encarando o horizonte. A rede de beach tennis atrás deles,
mar e sol baixo ao fundo, sombras longas na areia.

---

## Quartetos

### 9. `volei_praia_quarteto.webp`
[BASE] Vôlei de praia 4×4. Dois atletas saltam juntos na rede formando um
bloqueio duplo, braços estendidos acima da fita; atrás deles, dois companheiros
em base de defesa, afastados um do outro. Bola tocando o topo do bloqueio.
Areia levantando, rede em diagonal, mar e sol baixo ao fundo.

### 10. `futevolei_quarteto.webp`
[BASE] Quatro atletas de futevôlei na areia, quadra 4×4. Junto à rede, um atleta
no ar em bicicleta e outro agachado na cobertura; ao fundo, mais dois em
posição, um deles com o corpo virado acompanhando a bola. Bola de futevôlei
recortada contra o sol, areia em suspensão, mar ao fundo.

### 11. `volei_quadra_quarteto.webp`
[BASE] Vôlei de quadra em ginásio escuro — **não é praia**. Fila de refletores
âmbar ao fundo fazendo o contraluz, fumaça leve no ar. Dois atletas saltam na
rede em bloqueio duplo, braços acima da fita; atrás, dois defensores em base
baixa, afastados. Piso de quadra polido refletindo a luz dos refletores em
faixas alaranjadas.

### 12. `futebol_quarteto.webp`
[BASE] Quatro jogadores de futebol society em campo ao pôr do sol. Um conduz a
bola em arrancada, corpo inclinado; dois acompanham em corrida, passadas
abertas; o quarto vem mais atrás, recortado menor. Névoa rasteira sobre a grama
pegando a luz laranja, trave e alambrado escuros ao fundo.

---

## Quintetos

### 13. `volei_quadra_quinteto.webp`
[BASE] Cinco atletas de vôlei de quadra em ginásio escuro — **não é praia**.
Dois no alto da rede em bloqueio; três atrás, espalhados em formação de
recepção, um deles mergulhando para o passe com o braço estendido. Fila de
refletores âmbar ao fundo, fumaça leve, piso polido refletindo faixas de luz.

### 14. `futebol_quinteto.webp`
[BASE] Cinco jogadores de futsal/society em quadra ao anoitecer. Silhuetas
dispostas em diagonal, do mais próximo ao mais distante: o da frente domina a
bola com a sola do pé, os demais em corrida e marcação, braços em movimento.
Refletores altos criando o contraluz laranja, arquibancada escura ao fundo,
piso liso refletindo as silhuetas.

### 15. `basquete_quinteto.webp`
[BASE] Cinco atletas de basquete em quadra coberta — **não é praia**. Um sobe
para a bandeja junto ao aro, bola na mão acima da cabeça; os outros quatro em
corrida e disputa de rebote, braços erguidos. Tabela e aro recortados contra a
luz laranja dos refletores, arquibancada vazia e escura ao fundo.

---

## Escada de fallback proposta

1. Foto de capa da equipe (não existe hoje).
2. Arte `esporte + tamanho do elenco`.
3. Mesmo esporte, maior tamanho disponível abaixo do pedido
   (beach tennis quinteto → `beach_tennis_trio`; basquete quarteto → `basquete_trio`).
4. Arte de 1 atleta do esporte (`SportArtCatalog`).
5. Gradiente + padrão de círculos atual (`OUTROS` e esporte desconhecido).

## Estado hoje (6 artes no app)

Já no bundle (`assets/images/team_covers/`, catálogo em
`TeamCoverArtCatalog`): `beach_tennis_dupla`, `volei_praia_dupla`,
`volei_praia_trio`, `volei_praia_quarteto`, `futevolei_dupla`, `tenis_dupla`.

| Esporte | Dupla | Trio | Quarteto | Quinteto |
|---|---|---|---|---|
| Beach tennis | ✅ | dupla | dupla | dupla |
| Vôlei de praia | ✅ | ✅ | ✅ | quarteto |
| Futevôlei | ✅ | dupla | dupla | dupla |
| Tênis | ✅ | dupla | dupla | dupla |
| Vôlei de quadra | solo | solo | ⏳ | ⏳ |
| Futebol | solo | solo | ⏳ | ⏳ |
| Basquete | solo | ⏳ | solo | ⏳ |
| Corrida | solo | solo | solo | solo |

✅ arte própria · *minúscula* = desce para essa arte do mesmo esporte ·
`solo` = arte de um atleta do `SportArtCatalog` · ⏳ = prompt escrito, imagem
ainda não gerada.

**Para entrar com uma arte nova:** converter para WebP, jogar em
`assets/images/team_covers/` e acrescentar uma linha em
`TeamCoverArtCatalog._byCodeAndRoster`. Não precisa tocar em mais nada — o
teste do catálogo cobre asset morto e pubspec faltando.
