# Redesign da tela `/perfil` do athlete web

## Contexto

Hoje `/perfil` (`frontend/projects/athlete/src/app/profile/athlete-profile-settings.component.ts`)
é um wizard de 4 etapas (identidade → história → compatibilidade →
reputação) com preview público lateral, pensado como um construtor de
"vitrine pública". A página não usa o shell padrão do app
(`AtPanelShellComponent`) — tem seu próprio wrapper com link "← Voltar ao
painel".

Dois mockups de referência (`05 _ Perfil _ visualização.html`,
`06 _ Perfil _ modo edição.html`) mostram um desenho bem mais simples: uma
tela de conta ("Meu perfil") com nível/XP, stats, "Sobre", conquistas,
compartilhar perfil e segurança — visualização e edição inline, dentro do
mesmo shell com sidebar (Início/Agenda/Reservar/Competir/Perfil) que já existe
em `AtPanelShellComponent` e é usado pela dashboard
(`athlete-painel.component.ts`).

Esse desenho mais simples já tem precedente direto no próprio repo:
`frontend/projects/backoffice/src/app/painel/profile/panel-profile.component.ts`
implementa exatamente esse padrão (view/edit inline, Segurança com
senha/MFA) pro perfil do admin do backoffice.

## Decisão

Substituir a página `/perfil` inteira pelo desenho simples dos mockups,
dentro do `AtPanelShellComponent`. O wizard de 4 etapas sai de circulação —
não vira uma tela separada nesta rodada.

## Escopo

### Dentro do escopo

- Novo componente de perfil (view + edit inline), reaproveitando
  `AtPanelShellComponent` como wrapper.
- Edição de: nome completo, cidade (campo único "Cidade, UF"), WhatsApp
  (campo novo), e-mail (somente leitura), esporte principal (abas única
  escolha: Vôlei de praia / Tênis / Padel), bio.
- Botão "Trocar foto" desabilitado ("Em breve") — sem upload de imagem nesta
  rodada.
- Nível/XP, Jogos, Sequência e Ranking lidos de dados reais existentes.
- Conquistas (grid de 4 + "Ver todas") lidas de dados reais existentes.
- Compartilhar perfil (URL pública + copiar + Web Share API), reaproveitando
  a lógica já existente no wizard atual.
- Segurança: reset de senha por e-mail (real); Verificação em 2 etapas
  mostrada como desabilitada/"Em breve" (sem enroll de TOTP nesta rodada).

### Fora do escopo

- Upload real de foto de perfil.
- Enroll de MFA/TOTP (fica pra outra tarefa; reaproveitar o padrão já
  existente no backoffice quando for feita).
- Fluxo de troca de e-mail com verificação.
- Qualquer edição dos campos avançados do wizard atual (headline,
  conquistas em texto livre, disponibilidade estruturada, instagram, mão
  dominante, altura, lado da quadra, parceiro fixo, objetivo, país). Esses
  campos **não são apagados** do Firestore — só deixam de ter UI de edição.
  O perfil público (`athlete-public-profile.component`) continua exibindo o
  que já estiver salvo neles.
- Agregação de "vitórias" — não existe em lugar nenhum do backend hoje; o
  stat sai da tela até essa agregação existir.
- Segmentação geográfica real do ranking — o stat vira só "Ranking" (não
  "Ranking municipal"), porque o dado real é por categoria/pontos
  (`artifacts/{projectId}/public/data/athleteRankings/{uid}`), não por
  cidade.

## Arquitetura

- `AthleteProfileSettingsComponent` reescrito do zero (mesmo arquivo/rota
  `/perfil`), envolvido por `<app-at-panel-shell>` — igual ao padrão já
  usado por `athlete-painel.component.ts`.
- Um signal `isEditing` alterna view/edit, igual ao `PanelProfileComponent`
  do backoffice (`frontend/projects/backoffice/src/app/painel/profile/panel-profile.component.ts`).
  Cancelar restaura os valores do form pro snapshot atual; Salvar grava no
  Firestore e sai do modo edição.
- HTML/SCSS direto no componente com as classes utilitárias `at-*` já
  existentes no projeto (mesma convenção de `athlete-painel.component.html`
  e `at-panel-shell.component.scss`) — sem introduzir uma lib de componentes
  `panel/ui` como a do backoffice, já que esse padrão não existe hoje no
  athlete.
- Ícones: SVG inline no mesmo estilo já usado em `at-panel-shell` e
  `athlete-painel` (stroke currentColor, sem lib de ícones).

## Dados e persistência

### Perfil (editável)

Continua no doc `athlete_profiles/{uid}` (mesmo doc que o wizard atual já
lê/grava):

- `fullName`
- `city` / `state` — a UI expõe um único campo "Cidade, UF"; ao salvar, faz
  split pela última vírgula e grava `city`/`state` separados (mantém
  compatibilidade com quem já lê esses dois campos, ex. o preview público).
  Se não houver vírgula, grava o texto inteiro em `city` e deixa `state`
  vazio — não bloqueia o salvamento por formato.
- `whatsappNumber` — campo novo, ainda não existe no modelo atual.
- `email` — somente leitura, vem do Firebase Auth.
- `primarySport` — seleção única (abas).
- `bio`

### Nível/XP e stats

Novo `AthleteGamificationService` (novo arquivo em
`frontend/projects/athlete/src/app/profile/` ou `src/app/core/`, a decidir
na hora de implementar) lê `users/{uid}/gamification/summary`:

- `xp`, `level` — curva real é 100 XP por nível (`level = xp // 100`,
  `xpParaProximo = ((level+1)*100) - xp`), diferente dos 1000 XP do mockup.
  A UI usa a fórmula real; só o texto/layout segue o visual do mockup.
- `streak` → stat "Sequência".
- `totalGames` → stat "Jogos".

Este doc é escrito só via Cloud Functions (regras do Firestore bloqueiam
escrita client-side) — a tela só lê.

"Ranking" lê `artifacts/{projectId}/public/data/athleteRankings/{uid}`
(mesma fonte que a dashboard já usa hoje, ver `athlete-painel.component.ts`
`mapRankingDoc`).

"Vitórias" **não aparece** — sem fonte de dado.

### Conquistas

Catálogo local em TypeScript com os 24 ids/títulos/descrições, espelhando
`functions/src/achievement-engine.ts` (não depende do pacote `functions` nem
do Flutter — é uma cópia leve só de metadados de exibição, sem a lógica de
regra de desbloqueio). Cruza com `users/{uid}/gamification_badges` (docs com
`badgeId`/`id` e `unlockedAt`) pra saber quais estão desbloqueadas.

Grid mostra as 4 primeiras (desbloqueadas primeiro). "Ver todas" abre uma
lista/modal simples com as 24 — não é uma rota nova.

### Compartilhar perfil

Reaproveita a lógica já existente em
`athlete-profile-settings.component.ts` (`publicProfileUrl()`,
`copyProfileLink()`), portada pro novo componente. URL real é
`${origin}/atletas/${identifier}` (não o `/p/handle` do mockup — mockup foi
só inspiração visual, a rota real já existe e funciona). Botão
"Compartilhar" tenta `navigator.share()`; sem suporte, cai pro mesmo
"Copiar".

### Segurança

- **Senha**: botão "Alterar" chama `sendPasswordReset` do `AuthService` do
  athlete (já existe, mesmo padrão do backoffice). Texto de status fica
  genérico ("Redefina sua senha por e-mail") — não existe data de última
  troca rastreada, então não inventamos uma.
- **Verificação em 2 etapas**: status fixo "Desativada", botão "Ativar"
  desabilitado com `title="Em breve"`. Athlete não tem nenhum código de MFA
  hoje (backoffice tem TOTP completo — vira o template quando essa feature
  for priorizada).

## Fora do documento (decisões de implementação livres)

- Nome exato do arquivo/localização do `AthleteGamificationService`.
- Estrutura exata do modal/lista de "Ver todas" as conquistas.
- Nomes de classes CSS específicas (seguir convenção `at-*` existente).
