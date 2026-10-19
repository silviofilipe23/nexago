# Loja · Personalizar (web 02b · app 02b/02c)

Entrada: produto com personalização ativa (tela 11 do backoffice). Web: o botão **Personalizar** da
página do produto abre `/loja/p/:slug/personalizar` (a seleção de eixos vai junto na query, por id do
eixo: `?cor=preto&tam=m`). App: o botão **Personalizar** do bloco "Personalize" da página do produto
abre `/loja/produto/:productId/personalizar?sku=<skuId>` depois de escolhidos cor e tamanho (sem
tamanho: os botões tremem com "Escolha um tamanho", como no "Adicionar"). Comprar sem personalizar
continua possível pela própria página do produto.

## Dados

### Config pública — `storeShowcase/{id}.customization` (gravado por `publicCustomization`)
```
fromCents, leadDays, defectOnlyReturns,
version,                                   // ms do updatedAt da config: o carrinho guarda com qual foi feito
name:  { enabled, maxChars, placement: 'costas_superior'|'costas_inferior'|'frente'|'manga',
         fonts: ['bloco'|'classica'|'mono' ...]  (só as ligadas; a 1ª é o padrão),
         colors: ['#rrggbb' ...] },
image: { enabled, formats: ['png'|'jpg'|'svg' ...], maxSizeMb, minWidthPx, minHeightPx,
         areas: [{ id, name, widthCm, heightCm }] (só as ligadas; a 1ª é o padrão) },
price: { nameOnlyCents, imageOnlyCents, bothCents }
```
`null` = sem personalização. `enabled` falso = a opção (passo/aba/preço) some. As **costas**
(imagem ou número abaixo do nome, PR #720) ainda não têm tela no cliente — ficam fora daqui.
`photos[].view` (`'frente'|'costas'|null`) passou a ir no espelho: a prévia usa a foto do lado e da cor.

### Imagem do atleta
Storage `store/custom-uploads/{uid}/{uuid}.{png|jpg|svg}`, com `contentType` certo. A rule deixa só o
dono criar (até 50 MB, `image/png|jpeg|svg+xml`) e ler; o limite do produto é conferido na callable.
Upload pede login.

### Callables (região do cliente)
- `checkStoreCustomName({productId, text})` → `{ok: true}` ou `{ok: false, problem}` com
  `problem ∈ empty|chars|length|blocked|disabled`. Chamada no blur do campo. A lista de bloqueio
  não sai do servidor.
- `addStoreCustomItemToCart({productId, skuId, qty, name?: {text, fontId, color},
  image?: {path, areaId, transform: {x, y, scale}}})` → `{lineId, extraPriceCents, unitPriceCents,
  quality}`. Revalida tudo (produto à venda, personalização ativa, SKU com saldo, nome, lista de
  bloqueio, fonte e cor da config, arquivo do próprio atleta, formato, peso, resolução lida do
  arquivo, área ligada), calcula o adicional e grava a linha. Erros chegam como `HttpsError` com a
  mensagem pronta em português.

### Linha personalizada no carrinho — `storeCarts/{uid}.items[]`
```
{ lineId, productId, skuId, qty,
  customization: { configVersion, extraPriceCents, addedAt,
    name?:  { text, fontId, color, placement },
    image?: { path, format, sizeBytes, widthPx|null, heightPx|null, areaId, areaName,
              transform: { x, y, scale }, quality: 'good'|'warn' } } }
```
- **Nunca soma** com outra linha (nem com a comum do mesmo SKU): cada configuração é uma linha.
- Quem reescreve `items` no cliente (adicionar comum, futuro carrinho) **preserva** `lineId` e
  `customization` das outras linhas — parse e escrita levam o mapa inteiro.
- O contador da sacola soma as unidades dessas linhas também.
- O checkout (ainda não existe) relê preço, saldo e personalização no servidor e cria o
  `storeCustomItems` (fila de arte, tela 10).

## Regras (iguais no web e no app)

### Opções e preço
- Nome e imagem são opcionais, mas **pelo menos um** é preciso para adicionar.
- `adicional = nome && imagem ? bothCents : nome ? nameOnlyCents : imagem ? imageOnlyCents : 0`.
- Total = preço do SKU escolhido + adicional; atualiza a cada mudança. Web: total grande e a
  composição "R$ 129,90 + R$ 24,90 de personalização". Cada passo mostra o preço da opção sozinha
  ("+ R$ 14,90 sozinho"). Pix (quando configurado) sobre o total.

### Nome
- Ao digitar: maiúsculas; só letras (com acento), números, espaço, ponto e hífen; sem espaço nas
  pontas nem duplo; até `maxChars`. Caractere inválido não entra: o campo treme e o hint fica
  vermelho "Só letras, números e espaço".
- Hint: "{n} de {max} caracteres · letras, números e espaço" (app: "{n} de {max} · …"); laranja
  a partir de `max − 2`.
- Blur → `checkStoreCustomName`; bloqueado: borda vermelha, "Esse nome não pode ser usado", e
  Adicionar desabilitado até mudar.
- Título do passo pelo `placement`: costas → "Nome nas costas"; frente → "Nome na frente";
  manga → "Nome na manga".
- Fonte: cards com "ABC" na própria fonte — Bloco (fonte display, 800), Clássica (serifada itálica
  700), Mono (mono 700) — os mesmos do backoffice. Padrão: a 1ª ligada.
- Cor do nome: swatches da config; padrão = a de **maior contraste** (WCAG) com o `hex` da cor do
  SKU; SKU sem cor conhecida → a 1ª. Trocar a cor do SKU não muda a cor que o atleta já escolheu.

### Imagem
- Validação no cliente antes de subir: formato em `formats`, peso ≤ `maxSizeMb`, resolução ≥
  `minWidthPx × minHeightPx` (SVG não tem mínimo). Reprovou: card vermelho com a regra, não sobe.
- Qualidade pela área: dpi efetivo = px ÷ (cm ÷ 2,54) no lado mais fraco; ≥ 300 → verde
  "Boa qualidade · {L} × {A} px"; abaixo → amarelo "Pode ficar levemente borrada no tamanho
  {área}" (segue). Recalcula ao trocar de área.
- Posição: cards "{nome} · {L} × {A} cm"; padrão a 1ª.
- Ajuste fino na prévia: arrastar move, alça (web) / pinça (app) escala; proporção travada e
  imagem sempre dentro da área. Salvo como `transform` relativo à área: `x, y` = centro (0–1),
  `scale` = largura da imagem ÷ largura da área (0,1–1).
- Upload com progresso no card; Adicionar desabilitado até terminar; erro → card vermelho com
  "Tentar de novo".
- Avisos: web "use só imagens suas ou com autorização"; app "A equipe NexaGO revisa a arte antes
  de produzir. Logos de marcas e fotos de terceiros podem ser recusados."
- **Remoção de fundo** (`removeBackground`): ainda não — precisa de serviço externo; a arte segue
  como enviada e a equipe trata na fila (tela 10).

### Prévia (ilustrativa)
- Foto do produto no lado (`view`): a da cor escolhida; senão a do lado sem cor; senão a do lado
  em **outra cor**, com o aviso "Foto em Preto · a sua sai em Branco areia" sob a prévia (peça
  cadastrada só com fotos de uma cor não pode virar tela vazia). Sem nenhuma foto do lado, fundo
  listrado "MOCKUP · FRENTE/COSTAS" **na cor da peça** (o `hex` da cor do SKU; sem hex, o escuro #0F1214) —
  o nome padrão contrasta com a peça, e no mockup escuro um nome escuro sumia. Rótulo do mockup
  escuro em peça clara. Seletor Frente/Costas; editar o nome mostra o lado do nome, editar a
  imagem mostra a frente.
- Peça de referência 60 × 70 cm: caixa da área = `widthCm/60` × `heightCm/70` do quadro. Centro das
  áreas conhecidas: `peito_esquerdo` (68%, 30%) — esquerdo de quem veste, direita de quem olha;
  `centro_frente` (50%, 45%); `manga` (88%, 24%); outra → (50%, 40%). Nome: `costas_superior`
  (50%, 24%), `costas_inferior` (50%, 62%), `frente` (50%, 30%), `manga` (88%, 24%), faixa de 60%
  da largura; texto em 1 linha, fonte reduzida até caber.
- Sem imagem: placeholder listrado "SUA IMAGEM" na área.

### Nota de produção
"Feito sob demanda: fica pronto em **{leadDays} dias úteis** depois que a arte é aprovada.
Personalizados só têm troca em caso de defeito." — a 2ª frase só com `defectOnlyReturns`.

## Web · 02b
Grid prévia (620) + configuração; prévia grande com miniaturas frente/costas abaixo. Passos
sempre visíveis: 1 Cor e tamanho · 2 Nome (com "Não quero") · 3 Imagem (com "Não quero") · nota ·
quantidade + **Adicionar ao carrinho**. Passo recolhido mostra "Adicionar nome / imagem". Ao
adicionar: mesmo retorno da página do produto (botão "✓ Adicionado", sacola pulsa, mini-carrinho).

## App · 02b/02c
Sem tab bar. Header voltar + "Personalizar" + "{produto} · {cor} {tamanho}". Prévia (300) com
Frente/Costas; abas Nome · Imagem · Cor e tam. (✓ verde quando preenchida; trocar de aba troca o
lado da prévia); "Pular" no fim de uma aba vazia; barra fixa "Com personalização · R$ X" +
**Adicionar**. Imagem: folha Fotos · Arquivos · Câmera; compressão leve mantendo a resolução
mínima. Voltar com alteração → folha "Descartar personalização?" (Descartar · Continuar editando).

## Fora (por enquanto)
Remoção de fundo, editar a partir do carrinho (o carrinho não existe), checkout criando o item da
fila de arte, reenvio de imagem pedido pela equipe, costas com imagem/número.

## Analytics
`loja_personalizar_open {produto_id, canal}` · `loja_personalizar_nome {fonte}` ·
`loja_personalizar_imagem {area, qualidade}` · `loja_add_carrinho {sku, qtd, preco, personalizado: true}`
