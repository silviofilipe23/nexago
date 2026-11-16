# Clube de Vantagens Nexa: especificação

Área de benefícios de parceiros dentro do Hub do atleta (referência: benefícios do iFood). A Fast Açaí é
o primeiro case (10% off) e a LinQ Telecom entra como patrocinador oficial (formulário de lead) para a
reunião comercial. Origem: quadro de tarefas do backoffice, etapas 1 a 4.

## Princípios

- **Parceiro novo entra só pelo Firestore** (ou pela tela do backoffice), sem atualizar o app.
- **Número inflado vale menos que número nenhum.** Os eventos que viram métrica na reunião são
  gravados pelo servidor (callable), com o uid de quem fez, nunca por escrita direta do cliente.
- **O dado do atleta só sai com consentimento.** O lead só é gravado com a caixa de consentimento
  marcada, e o texto aceito fica guardado junto.
- **Nada quebra o Hub atual.** O card do clube só aparece com a flag ligada ou para quem testa.

## Dados

### `partners/{partnerId}`

| Campo | Tipo | Observação |
|---|---|---|
| `name` | string | "Fast Açaí" |
| `logoUrl` | string \| null | PNG com fundo transparente; sem logo, o app mostra as iniciais na cor da marca |
| `category` | `food` \| `sports` \| `health` \| `services` \| `leisure` \| `other` | filtro da tela do clube |
| `benefitHighlight` | string (≤ 24) | o selo curto: "10% OFF" |
| `benefitTitle` | string (≤ 80) | "10% de desconto em todo pedido" |
| `description` | string (≤ 600) | texto do parceiro |
| `howToUse` | string[] (até 3) | os 3 passos; vazio usa o padrão do tipo de botão |
| `terms` | string (≤ 2000) | regulamento |
| `ctaType` | `link` \| `lead_form` | o que o botão faz |
| `ctaLabel` | string (≤ 32) | "Pedir com 10% off", "Quero contratar" |
| `link` | string \| null | URL https do parceiro (só `link`) |
| `couponMode` | `none` \| `fixed` \| `athlete` | código fixo (NEXAGO10) ou por atleta (NEXA-XXXX) |
| `couponCode` | string \| null | o código fixo |
| `brandColor` | string `#RRGGBB` | cor da marca (banner, botão, iniciais) |
| `cities` | string[] | vazio = todas; senão só atletas dessas cidades veem |
| `isMasterSponsor` | bool | vai para o banner "Patrocinador oficial" no topo |
| `priority` | number | maior aparece primeiro |
| `active` | bool | desligado some de todo lugar |
| `audience` | `all` \| `testers` | `testers` = só quem testa (ver abaixo) |
| `leadConsentText` | string \| null | texto da caixa de consentimento (só `lead_form`) |
| `leadSuccessMessage` | string \| null | "Pronto! A LinQ vai falar com você pelo WhatsApp" |
| `createdAt`, `updatedAt`, `updatedByName` | | gravados pelo backoffice |

Rules: leitura para usuário logado; escrita só admin/superAdmin, com allowlist de campos.

### `appConfig/benefitsClub`

`{ enabled: bool, testerUids: string[] }`. O card do Hub aparece com `enabled == true` **ou** para quem
testa. Quem testa = uid em `testerUids` ou papel `admin` no token. Parceiro `audience: 'testers'` (a LinQ
até o contrato fechar) também só aparece para quem testa. Como o app da loja aponta para o DEV, não há
"build de teste" separado: o teste é por pessoa, e liberar para todos é trocar um campo, sem build.

### `benefitEvents/{auto}` (só servidor)

`{ type, partnerId|null, uid, source, surface, platform, createdAt }`

- `type`: `hub_card_view`, `club_view`, `partner_view`, `cta_click`, `code_copy`, `lead_submit`.
- `source`: por onde a pessoa entrou no clube: `hub_card` (card do Hub no app), `competir_web` (card
  do Competir no portal), `home`, `deeplink`, `push`. A origem acompanha a visita inteira: o clique no
  botão de um parceiro aberto a partir do card do Hub grava `source: hub_card`. (`club_list` e
  `sponsor_banner` são aceitos para uso futuro.)
- Gravado pela callable `trackBenefitEvent`. Toque repetido do mesmo atleta no mesmo evento e parceiro
  em menos de 30 s não grava de novo.

### `partnerLeads/{partnerId}_{uid}` (só servidor)

`{ partnerId, partnerName, uid, name, whatsapp, neighborhood, cep, city, source, consent: true,
consentText, consentAt, status: 'new', createdAt, updatedAt, submitCount }`

Um lead por atleta e parceiro: reenviar atualiza o mesmo doc (`submitCount` sobe). Gravado pela callable
`submitPartnerLead`, que confere parceiro ativo com `ctaType: 'lead_form'`, consentimento, WhatsApp
(10 a 13 dígitos) e CEP (8 dígitos).

Rules de `benefitEvents` e `partnerLeads`: sem leitura e sem escrita pelo app e pelo portal; o backoffice
lê (admin) e o export é feito por lá ou pelo script.

## Telas

Desenho no canvas do Claude Design (página App do Atleta, seção "Clube de Vantagens Nexa"; backoffice na
página Organizador, Competição e Backoffice).

### App

1. **Hub**: card "Clube de Vantagens Nexa" de largura total logo abaixo da grade 2x3, selo NOVO, borda
   laranja, subtítulo "Descontos dos parceiros NexaGO" e as logos dos parceiros. Grava `hub_card_view`
   uma vez por sessão.
2. **Clube** (`/clube`): header, banner do patrocinador oficial na cor da marca, chips de categoria
   (só as que têm parceiro) e a lista. Grava `club_view` com a origem.
3. **Parceiro** (`/clube/:partnerId`): hero na cor da marca, benefício em destaque, código copiável,
   "Como usar" em 3 passos, termos e o botão fixo no pé. Grava `partner_view`, `code_copy` e
   `cta_click`.
   - `link`: abre o link com `utm_source=nexago&utm_medium=app&utm_campaign=clube_vantagens&ref=<código>`
     (`ref` é o código do atleta, nunca o uid).
   - `lead_form`: abre o formulário.
4. **Formulário** (`/clube/:partnerId/contratar`): nome e WhatsApp pré-preenchidos, bairro, CEP,
   consentimento obrigatório. Sucesso: "Pronto! A LinQ vai falar com você pelo WhatsApp".

### Portal do atleta (web)

Card no Competir, `/clube` e `/clube/:partnerId` com o mesmo conteúdo e o formulário em modal.
`utm_medium=web`.

### Backoffice

`/painel/clube`: abas Parceiros (lista + editor), Leads (tabela + CSV) e Métricas (por parceiro:
visualizações, cliques, códigos copiados, leads e atletas únicos, com período e CSV), além da flag e da
lista de quem testa.

## Código do atleta

`NEXA-` + os 4 primeiros caracteres alfanuméricos do uid em maiúsculas. Serve de `ref` no link e de cupom
quando o parceiro aceita código por atleta (`couponMode: 'athlete'`). Se o cardápio só aceita um cupom,
o parceiro usa `couponMode: 'fixed'` com `NEXAGO10`.

## Publicação (etapa 4)

1. Rules + callables (`trackBenefitEvent`, `submitPartnerLead`) no DEV.
2. Cadastrar a Fast Açaí (`audience: 'all'`) e a LinQ (`audience: 'testers'`):
   `node scripts/seed-benefit-partners.js --project <id>` ou pela tela do backoffice.
3. Build de loja com o card; testar com a flag desligada e o uid em `testerUids`.
4. Depois da loja: `enabled: true` no `appConfig/benefitsClub`.
5. Métricas: aba Métricas do backoffice ou `node scripts/benefits-report.js --project <id> --csv`.

---

# Versão premium (v2)

Pedido de 16/11/2026: deixar o clube com cara de programa premium (identidade de membro, valor
acumulado de verdade, benefício no momento do jogo). Prioridade por impacto: P0 (itens 1–4), P1 (5–7),
P2 (8–11). Ressalvas que valem para tudo abaixo:

- **Nada de economia estimada.** "Você economizou R$ X" só com resgate confirmado pelo parceiro e
  atribuído ao atleta (código por atleta). Sem confirmação, a tela não mostra valor nenhum.
- **Nada de moeda própria de pontos.** Usar o clube não dá pontos, XP, nível nem Elo.
- **Nada de encher o catálogo.** Nenhum parceiro fictício ou de exemplo é cadastrado; os recursos de
  descoberta (busca, mapa) só aparecem com 8 ou mais parceiros visíveis.

## Itens

| # | Prioridade | Item |
|---|---|---|
| 1 | P0 | Vitrine com foto de capa (`coverUrl`) e logo real |
| 2 | P0 | Carteirinha do membro no topo do clube (nome, foto, "Membro desde", nível, código + QR) |
| 3 | P0 | Resgate em um toque: o botão copia o cupom e, se o parceiro aceitar, já manda o cupom na URL |
| 4 | P0 | Acabamento: esqueleto com shimmer, transição do logo, vibração ao copiar, termos em chips, "Como funciona o clube" na 1ª visita |
| 5 | P1 | Benefício no momento do jogo: pós-jogo e dia de torneio (`placements`) |
| 6 | P1 | Validade (`startsAt`/`validUntil`), selos "Termina em", "Novo", "Destaque da semana" e push de parceiro novo e de oferta acabando |
| 7 | P1 | "Meus benefícios" (usados e salvos) e a pergunta "Conseguiu usar?" |
| 8 | P2 | Benefícios por status (Squad, inscritos de torneio, nível mínimo), mostrados bloqueados para quem não tem |
| 9 | P2 | Economia acumulada, só com resgate confirmado pelo parceiro (import no backoffice) |
| 10 | P2 | "Oferecido por" no clube, card do Hub em modo patrocinador e relatório para o patrocinador |
| 11 | P2 | Busca, "perto de você" e mapa (com 8+ parceiros) |

## Dados novos

### `partners/{partnerId}` (campos novos; todos opcionais na leitura)

| Campo | Tipo | Regra |
|---|---|---|
| `coverUrl` | string https \| null | foto de capa (16:9), Storage `app/partners/` |
| `startsAt` | timestamp \| null | antes disso o parceiro não aparece |
| `validUntil` | timestamp \| null | depois disso some; nos 7 dias antes mostra "Termina em N dias" ("Termina hoje") |
| `featured` | bool | "Destaque da semana": o de maior prioridade com `featured` vai para o topo |
| `placements` | lista ⊂ `post_game`, `tournament_day` | onde mais o benefício aparece |
| `couponUrlParam` | string `^[A-Za-z0-9_]{1,30}$` \| null | se definido, o link leva `&<param>=<cupom>` |
| `termsTags` | lista ⊂ `online`, `in_store`, `not_cumulative`, `unlimited`, `first_order`, `one_per_person` | chips dos termos |
| `locations` | lista (≤ 20) de `{name, address, lat, lng, hours?}` | "perto de você" e mapa |
| `requirement` | `{type}`: `none` \| `squad` \| `tournament` (`tournamentIds`, 1–10) \| `min_level` (`minLevel`, id da escada de nível) | quem pode usar |
| `requirementLabel` | string ≤ 80 \| null | texto do bloqueio ("Exclusivo para embaixadores do Squad") |

"Novo" = `createdAt` nos últimos 14 dias. Com `requirement.type != none` o `couponCode` público é
`null` (rules garantem) e o código fica em `partnerPrivate/{partnerId}.couponCode`.

### `partnerPrivate/{partnerId}` (só admin lê e grava)
`{couponCode: string|null, notifiedNewAt?: timestamp, notifiedEndingAt?: timestamp, updatedAt, updatedBy}`

### `users/{uid}/benefits/{partnerId}`
`{saved: bool, savedAt, useCount, firstUsedAt, lastUsedAt, lastAnswer: 'used'|'not_used'|null, answeredAt,
expiryNotifiedAt}`. O dono lê; o dono só cria/altera `saved` e `savedAt`; o resto é do servidor.

### `benefitCodes/{code}` (só servidor)
`{uids: string[], firstAt}`: liga o código `NEXA-XXXX` ao(s) atleta(s). Gravado quando o atleta copia o
código, clica no botão ou recebe o código pela `claimBenefit`. Dois uids no mesmo código = ambíguo.

### `benefitRedemptions/{partnerId}_{externalId}` (admin lê; só servidor grava)
`{partnerId, externalId, code, uid|null, status: 'matched'|'ambiguous'|'unmatched', discountCents,
orderCents|null, redeemedAt, importedAt, importedByName}`. Só `matched` entra na economia do atleta.

### `appConfig/benefitsClub` (campo novo)
`hubSponsorPartnerId: string|null`: o card do Hub vira "Oferecido por <parceiro>", com a cor da marca.

### Eventos (`benefitEvents`)
Tipos novos gravados pelo servidor: `use_confirmed`, `use_denied` (resposta do "Conseguiu usar?").
Origens novas aceitas: `post_game`, `tournament_day`, `featured`, `search`, `map`, `my_benefits`
(além das anteriores; `push` já existia).

## Callables novas e alteradas (região southamerica-east1)

- `trackBenefitEvent` (alterada): em `cta_click` e `code_copy` também atualiza
  `users/{uid}/benefits/{partnerId}` (`useCount + 1`, `firstUsedAt` se vazio, `lastUsedAt`,
  `lastAnswer: null`) e registra o código em `benefitCodes` quando o parceiro usa código por atleta.
- `claimBenefit({partnerId, source, surface, platform})` → `{coupon: string|null}`. Confere
  visibilidade e elegibilidade; devolve o cupom público, o privado (parceiro com requisito) ou o código do
  atleta. Erro `permission-denied` com frase PT quando a pessoa não cumpre o requisito.
- `getMyBenefits()` → `{uses: [{partnerId, useCount, firstUsedAt, lastUsedAt, lastAnswer, saved}],
  pendingQuestion: {partnerId} | null, savings: {confirmedCount, totalDiscountCents,
  byPartner: [{partnerId, count, discountCents}]}, eligiblePartnerIds: string[]}`. Datas em ms.
  `pendingQuestion` = uso mais recente entre 2 h e 7 dias atrás sem resposta. `eligiblePartnerIds` = os
  parceiros com requisito que esta pessoa cumpre.
- `answerBenefitUse({partnerId, used: bool})` → `{ok}`. Grava `lastAnswer`/`answeredAt` e o evento.
- `submitPartnerLead` (alterada): também confere o requisito.
- `importBenefitRedemptions({partnerId, rows: [{code, externalId, redeemedAt, discountCents,
  orderCents?}]})` (admin) → `{matched, ambiguous, unmatched, duplicates}`. Idempotente por `externalId`.
- `notifyBenefitPartner({partnerId, kind: 'new'|'ending', dryRun})` (admin) → `{recipients, sent}`.
  Público: só quem testa se o parceiro for de teste ou o clube estiver desligado; senão atletas das
  cidades do parceiro (todas se vazio) e que cumprem o requisito. Uma vez por parceiro e tipo.
- Agendada `benefitExpiryReminders` (diária, 10h de Brasília): parceiro que termina nas próximas 48 h →
  push para quem salvou e ainda não usou depois de salvar, uma vez por pessoa e parceiro.
- Push: `url` = `/athlete/clube/<partnerId>?origem=push` (app) e `webUrl` = `/clube/<partnerId>?origem=push`.
