# Wizard de inscrição no app — decisões

**Data:** 2026-09-01 · **Origem:** protótipos de 7 telas · **Superfície:** app Flutter
(`nexago_app`) apenas

Este documento **não** descreve as telas — os protótipos fazem isso melhor, e o plano de
implementação cobre a ordem de ataque. Ele guarda as **decisões**, com o porquê, e
principalmente o que foi decidido **não** fazer. Cada linha aqui é algo que, sem registro,
uma sessão futura desfaz achando que está consertando.

## O que muda

A inscrição deixa de ser **tela única** (`tournament_registration_page.dart`, 1656 linhas,
cards Categoria → Uniforme → Sua inscrição → Resumo) e vira um passo a passo, uma rota por
etapa, sob `/torneios/:tournamentId/inscricao`:

| # | Passo | Rota | Estado |
|---|---|---|---|
| 1 | Categoria (detalhe) | `…/inscricao/categoria` | nova — substitui o seletor de categoria |
| — | Confirmação de nível | folha, na saída do passo 1 | existe (`showLevelConfirmationSheet`) |
| 2 | Consentimento LGPD | `…/inscricao/consentimento` | nova — era checkbox inline |
| 3 | Condições da inscrição | `…/inscricao/condicoes` | nova |
| 4 | Parceiro / elenco | `…/inscricao/parceiro` | nova casca, passo reusado |
| 5 | Aguardando a dupla | `…/inscricao/aguardando` | nova casca, widget órfão reusado |
| 6 | Uniforme | `…/inscricao/uniforme` | nova casca, passo reusado |
| 7 | Pagamento | `…/inscricao/pagamento` | **já existe**, re-skin |
| 8 | Confirmação | `…/inscricao/sucesso` | **já existe**, re-skin |

Cobre **dupla, vaga solo e equipes trio+**. A tela única é aposentada.

O passo 3 tem três variantes: dupla obrigatória (`requireFormedPair`), dupla com reserva solo
permitida, e equipe trio+. Os protótipos só desenharam a primeira; as outras duas seguem a
mesma linguagem visual.

## O porteiro

`/torneios/:tournamentId/inscricao` **deixa de ser tela** e vira redirecionador. Os query
params de hoje (`categoryId`, `registrationId`, `inviteId`, `step`) continuam valendo — por
isso **nenhum dos ~10 pontos de entrada precisa ser tocado** (notificação push, aceite de
convite, home do atleta, "continuar inscrição", detalhe do torneio, aba "minha inscrição").

`resolveRegistrationStep` é função **pura**, e decide nesta ordem:

| # | Condição | Destino |
|---|---|---|
| 1 | categoria não resolvida | `categoria` |
| 2 | convite RECEBIDO pendente **e sem inscrição** | `condicoes` (modo "aceitar convite") |
| 3 | sem inscrição, com convite ENVIADO pendente | `aguardando` |
| 4 | sem inscrição, com aceite LGPD | `condicoes` |
| 5 | sem inscrição, sem aceite, folha de nível devida | `categoria` |
| 6 | sem inscrição, sem aceite | `consentimento` |
| 7 | parceiro/elenco pendente **com** convite enviado | `aguardando` |
| 8 | parceiro/elenco pendente **sem** convite enviado | `parceiro` |
| 9 | uniforme exigido e incompleto | `uniforme` |
| 10 | não pago | `pagamento` |
| 11 | pago e completo | `sucesso` |

Duas precedências dentro dessa tabela não são arbitrárias e já custaram bug:

- **A linha 2 exige `!hasRegistration`.** Sem esse qualificador, quem tem reserva
  solo aberta e recebe convite fica preso em "condições" — sem pagar e sem recusar,
  com o relógio da vaga correndo. A CF permite esse convite de propósito: o plano
  dela é ANEXAR o convidado à inscrição existente.
- **A linha 3 vem antes das linhas 4-6.** Quem já convidou alguém e volta pela
  notificação não traz `lgpd` na rota; se o consentimento fosse checado primeiro,
  ele refaria o começo do fluxo com um convite em voo.

O cérebro dessa decisão já existe: `buildRegistrationProgress`
(`domain/registration_progress_logic.dart`) sabe dizer qual passo está pendente numa
inscrição. **Reusar, não duplicar** — a trilha da Home e o porteiro têm que concordar sempre.

## Decisões que se perdem se não estiverem escritas

### A etapa 5 existe porque convidar não cria inscrição

O backend só cria a inscrição no **aceite** do convidado. Sem a etapa 5, quem
enviava o convite voltava ao porteiro e caía de novo na **busca de parceiro**,
com o campo aberto, logo depois de ter escolhido alguém.

Os **dois** caminhos vão para lá, e o que os separa de "reservei sozinho e
ainda não chamei ninguém" é o convite em voo (`hasSentInvitePending`):

- convite "no vácuo" (sem inscrição) → `aguardando`;
- reserva solo **com** convite enviado → `aguardando`;
- reserva solo **sem** convite → `parceiro`, porque é lá que se convida.

Duas consequências que não se deduzem olhando só a tela:

- **"Cancelar" cancela o CONVITE, não a inscrição** — não existe inscrição a
  cancelar. Volta para a etapa 4.
- **A ação "garantir a vaga pagando o integral" viaja junto** para a etapa 5
  quando há reserva solo em aberto. Ela já ficou inalcançável uma vez nesta
  branch: o porteiro nunca honra `step=payment` com parceiro pendente (o
  pagamento é posterior na ordem), então o botão é a única porta.

A tela é **viva**: o aceite chega pelo mesmo stream que a desenha
(`inviterTournamentPartnerInvitesProvider` carrega `pending` **e** `accepted`,
e o aceite carimba `registrationId` no próprio convite), ela mostra a virada e
só então segue para uniforme/pagamento. E quando o convite **sai do ar**, ela
lê o doc para dizer o desfecho — recusa de convite comum não gera notificação
nenhuma, e um salto silencioso para trás era tudo o que o atleta veria.

**Não há callable de reenvio** para convite de dupla: `resendSubstitutionInvite`
recusa qualquer convite que não seja de substituição. A ação fica fora da tela
até existir uma.

### A ordem do enum é contrato, e a caducidade de `waiting` acompanha a ETAPA

`resolveRegistrationStep` compara `index` para decidir se um passo pedido já
está liberado — mexer na ordem de `RegistrationWizardStep` muda o
comportamento de todas as rotas com `?step=`.

`registrationStepFromParam` deriva `waitingOnly` de
`step == RegistrationWizardStep.aguardando`, **não** de `value == 'waiting'`.
As duas grafias (`waiting`, das rotas antigas, e `aguardando`) pedem a mesma
tela, e as duas precisam caducar quando a dupla fecha: `aguardando` é o índice
4, menor que `uniforme` (5) e `pagamento` (6), e sem a caducidade venceria
sempre — prendendo na espera justamente quem acabou de fechar a dupla.

### `step` na rota é preferência, nunca ordem

O `step` só é obedecido se aquele passo já estiver liberado; ele nunca pula um passo
pendente. É isso que impede **as duas** falhas: pular o pagamento, e recriar o beco sem saída
da vaga solo pendente — bug que já aconteceu neste código e cuja correção foi justamente
parar de guardar o passo em `setState` e passar a derivá-lo do Firestore.

**Corolário:** o wizard **não** tem controller de sessão. Nenhuma tela guarda o passo. Cada
uma deriva do Firestore. As únicas exceções, ambas locais e justificadas: o rascunho do
uniforme antes de existir inscrição, e os checkboxes do consentimento antes de virarem
`lgpdAccepted` na callable.

### `kSearchMinPrefixLength` continua **2**

A busca de parceiro passa a exigir **3 letras**, mas a regra é **local**. A constante global
vale para arena, ligas, equipes e torneios — e é o mesmo número que o **gerador de
`keywords`** usa para montar os prefixos gravados nos perfis. Subir a constante quebraria o
índice, cujo backfill em `users` **nunca rodou**.

*Se você chegou aqui achando a diferença entre 2 e 3 uma inconsistência: não é. É deliberada.*

### A paridade com o portal web foi **restaurada** em 02/09

Esta seção dizia o contrário: "a paridade está quebrada de propósito, o portal continua em
tela única, não restaure sem decisão nova". **A decisão nova veio** — o dono pediu o fluxo
novo funcionando também no portal do atleta — e o wizard foi portado para o Angular em
02/09/2026. A tela única do portal (`tournament-registration-shell.component`, 1210 linhas)
foi aposentada junto, como a do app tinha sido.

O que o portal ganhou, em `frontend/projects/athlete/src/app/tournaments/registration/wizard/`:

| Peça | Arquivo |
|---|---|
| Porteiro (regra) | `registration-wizard-step.ts` — porte fiel de `registration_wizard_step.dart` |
| Porteiro (rota) | `registration-gate.component.ts`, em `torneios/:id/inscricao` |
| Cópia do passo 3 | `registration-terms-copy.ts` — porte de `registration_terms_copy.dart` |
| Status da categoria | `registration-category-status.ts` |
| Dados compartilhados | `registration-wizard.store.ts`, provido na rota-mãe |
| Seis passos | `steps/registration-{category,consent,terms,partner,waiting,uniform}.component.ts` |

**`resolveRegistrationStep` agora existe duas vezes** — Dart e TypeScript — com o mesmo
contrato e o mesmo conjunto de testes. É duplicação deliberada (não há runtime compartilhado
entre Flutter e Angular), e é o único ponto em que as duas superfícies **têm** de concordar:
quem começa a inscrição no celular e volta pelo navegador não pode cair num passo diferente.
Mexeu num, mexa no outro, e nos dois testes.

Três divergências que o portal mantém, todas por não existir equivalente lá:

- **O aceite do convite acontece no passo 3**, não numa rota dedicada. O app abre
  `tournamentPartnerInvite`; o portal nunca teve essa rota — o aceite sempre viveu dentro da
  tela de inscrição. O uniforme do convidado não viaja no aceite: o porteiro manda para o
  passo do uniforme logo em seguida.
- **`sucesso` é a aba `minha-inscricao`** do torneio, que já mostra elenco, pagamento e
  compartilhamento. O portal não ganhou tela de sucesso própria.
- **O convite por link** continua sendo o `InvitePartnerDialogComponent` (link para
  `/cadastro` com indicação), não a callable `createExternalPartnerInvite` que o app usa.

E dois nomes de query param: o portal escreve `categoria`/`registro`/`convite`, mas **lê as
duas grafias** (as do app incluídas). Um push aberto no navegador não pode voltar ao começo
do fluxo por causa do nome de um parâmetro.

### O texto do consentimento foi **corrigido**, não copiado do protótipo

O protótipo lista "Nome completo, data de nascimento e **CPF**" e afirma que "o organizador
nunca vê seu **cartão**". Nenhuma das duas é verdade: o organizador recebe nome, telefone,
nível, categoria e resultados; CPF só existe no app como dado de pagador de reserva de arena
e nunca chega ao organizador; e não existe pagamento por cartão.

O texto publicado descreve **o que é de fato compartilhado**. Numa declaração de tratamento
de dados assinada pelo atleta, descrever errado é o pior lugar para errar.

*Se a tela parecer "diferente do protótipo" nesse ponto: é intencional.*

### Dois aceites obrigatórios = **um** `lgpdAccepted`

O protótipo tem três caixas: dados (obrigatória), imagem (obrigatória) e marketing
(opcional). As duas obrigatórias são as duas metades do termo que já existe
(`domain/lgpd_term.dart`, versão `2026-08`) — marcar as duas manda o mesmo booleano de hoje.
**Zero mudança** em Cloud Function, regras do Firestore ou painel do organizador, que lê
`lgpdAcceptedUids`.

O aceite continua sendo **por inscrição**, não por perfil. Como o consentimento agora vem
antes da criação da inscrição, ele viaja pelo fluxo como parâmetro até a callable carimbar.
Quem fecha o app antes de criar a inscrição vê a tela de novo — correto para um aceite que
ainda não foi dado.

O opt-in de **marketing** é outra coisa: é consentimento de plataforma, gravado em
`users/{uid}.marketingOptIn`. **Não exige mudança no `firestore.rules`**: a regra de update de
`users` é uma lista de *proibições* (`roles`, `superAdmin`, `reputation`, `sandRank`,
`referredBy`, `phoneVerified`, níveis), não um allow-list de campos, e não há `affectedKeys`
limitando o conjunto — campo novo do dono passa. O campo também **não** entra em
`PUBLIC_PROFILE_FIELDS` (`functions/src/public-profile-sync.ts`), então não vaza para o
espelho público.

### Últimas duplas saem **só** da inscrição

`RecentPartnersRepository.loadRecentPartners()` lê a coleção `inscriptions` **inteira** e
depois faz um `get()` por documento com `teamId`. Custo O(inscrições da plataforma), sem
cache.

Ele tem três chamadores. **Só o da inscrição sai.** A substituição de parceiro e o perfil
público (`athletePublicPartnersProvider`) continuam usando — o segundo roda com o id do
**perfil visitado**, ou seja, abrir o perfil de qualquer atleta dispara a varredura completa.

*Isso não é esquecimento: foi decidido manter os outros dois. O repositório e
`TournamentRegistrationRecentPartnersChips` continuam existindo.*

## Busca de parceiro

- **Nada é listado antes da 3ª letra**, contada sobre o termo normalizado — acento e
  pontuação não contam (`J.R` vira `jr`, insuficiente).
- **O fallback de navegação sai.** Hoje, abaixo do mínimo, `searchPartners` cai em
  `listPartners`, que lê **100 perfis**. Sem ele e sem as últimas duplas, abrir a tela custa
  **zero leitura**.
- Debounce de 350ms: **mantido**, já existe.
- `max: 15` ao repositório → **60 documentos por busca** (o repositório lê `max × 4`, teto
  100; hoje `max: 25` significa **100**).
- Filtro de gênero da categoria roda no cliente, **depois** da busca; a tela mostra no
  **máximo 10**. Pedir 15 para exibir 10 é o que impede a lista murchar para 4 ou 5 numa
  categoria de gênero fixo.
- Atleta **sem gênero declarado continua aparecendo** — regra existente, mantida: sumir em
  silêncio deixava o convidante achando que o parceiro não existe, quando só está com o
  cadastro incompleto. O card avisa e o servidor recusa o aceite.

| | Antes | Depois |
|---|---|---|
| Abrir a tela | ~100 docs + varredura de `inscriptions` | **0** |
| Cada busca | 100 docs | **60** |

## Cortado dos protótipos

| Elemento | Por quê |
|---|---|
| `96% MATCH` | Não existe score de compatibilidade |
| `12 torneios juntos · último: …` | Não existe histórico de duplas |
| Seção "Suas últimas duplas" | Custo (ver acima) |
| Toggle **Pix \| Cartão** | Não existe pagamento por cartão; só PIX |
| `Sorteio da chave · 09 jul` | Não existe campo de data de sorteio em lugar nenhum |
| `Ver tabela de medidas` | Não existe tabela de medidas |

## Adicionado ao app

`registrationClosesAt` já existe no Firestore, nas Cloud Functions
(`tournament-registration-guards.ts`) e no painel do organizador, mas **nem o app nem o portal
liam**. Passa a ser lido e mostrado como "Inscrições até" nos passos 1, 3 e 5 das duas
superfícies, e a ser APLICADO pelo status da categoria — antes o prazo era só texto e a recusa
só vinha da callable, três telas adiante. Campo opcional — sem backfill, e `null` significa
"sem prazo", nunca "encerrado".

## Trabalho separado — **não** fazer nesta entrega

**Filtro de gênero no servidor.** Filtrar na query (`keywords arrayContains` + igualdade)
derrubaria a busca para ~40 documentos em *todas* as telas de busca de atleta, não só nesta.
Mas exige: campo `genderTag` **normalizado** no espelho `publicProfiles` (hoje `gender` é
texto cru — `genderTagFromText` aceita `m`, `male`, `masculino`, qualquer coisa com `masc`),
índice composto, **backfill** dos perfis existentes, e uma sentinela para quem não declarou
gênero (igualdade no Firestore não casa com campo ausente). É backend + migração num caminho
de busca compartilhado, não ajuste de UI.

**Índice de duplas.** Uma Cloud Function gravando os ex-parceiros de cada atleta mataria a
varredura de `inscriptions` nos dois chamadores restantes e permitiria a seção "últimas
duplas" voltar barata, em qualquer tela.

## Riscos

- A ordem da trilha da Home (`Uniforme → Dupla`) está **invertida** em relação ao wizard
  (`Parceiro → Uniforme`). Alinhar `buildRegistrationProgress` junto, ou as duas superfícies
  discordam sobre "qual é o próximo passo".
- Apagar a tela única antes de as rotas novas existirem deixa o app **sem inscrição** no meio
  do caminho. A ordem de ataque é assunto do plano, mas o risco nasce aqui.
- `marketingOptIn` não tem consumidor ainda: nada lê o campo. É consentimento guardado para
  quando existir envio de comunicação — e até lá é dado morto, que precisa ser respeitado por
  quem construir o envio.
