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
