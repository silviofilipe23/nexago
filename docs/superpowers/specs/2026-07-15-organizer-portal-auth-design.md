# Portal do Organizador (web) — auth design

## Contexto

Novo projeto Angular `organizer` no workspace `frontend/`, ao lado de `arena`, `backoffice`, `athlete` e `coach` — portal web pro organizador de torneios/ligas. Esta entrega cobre **só o scaffold do projeto e o fluxo de autenticação** (login, cadastro, esqueci/redefinir senha), espelhando o padrão já usado nos outros 4 portais. O conteúdo real do painel (torneios, ligas, financeiro, etc. — já uma feature madura em `nexago_app/lib/features/organizer/`) fica para uma entrega futura.

A role `organizer` já existe de ponta a ponta no backend: `functions/src/auth-roles.ts` a inclui em `ALLOWED_APP_ROLES`, `firestore.rules` já tem `hasRoleClaim('organizer')`/`isTournamentOrganizer()` protegendo dados de torneio/liga, e o Flutter já usa o claim (`kOrganizerAppRole`). O que falta é só a casca web — nenhuma mudança de regras ou de modelo de dados é necessária.

## Decisões

- **Escopo: scaffold + auth, não o painel.** Depois de logar/cadastrar, o organizador cai numa rota `/painel` guardada com um shell placeholder ("Painel do organizador — em construção" + botão sair) — prova que o fluxo funciona ponta a ponta, sem entrar no mérito de que telas o painel real vai ter.
- **Bloqueio de role via custom claim (estilo `coach`), não Firestore-doc (estilo `arena`).** `signInWithEmail` não rejeita ninguém na hora; um `organizerGuard` (cópia do `coach.guard.ts`) barra `/painel` depois do login lendo `roles` do ID token. Escolhido porque é assim que o backend e o Flutter já leem a role `organizer` hoje — manter os dois mecanismos (claim vs. doc) coexistindo seria duplicar fonte da verdade sem necessidade.
- **Cadastro completo, espelhando `coach`** (não só `arena`): tela de cadastro com nome + telefone + e-mail/senha. Sem CNPJ/cidade no cadastro inicial (isso é dado de arena, que é um estabelecimento físico; organizador de torneio não precisa disso pra criar conta).
- **Cloud Function nova: `completeOrganizerSignup`.** Não existe hoje (só `completeArenaSignup`/`completeCoachSignup`); precisa ser criada em `functions/src/organizer-signup.ts` pro cadastro funcionar de ponta a ponta — sem ela, a tela de cadastro não teria como setar a claim `organizer` na conta recém-criada.
- **Auth reaproveitado por cópia, não por lib compartilhada.** Hoje `arena`/`athlete`/`coach` já duplicam o mesmo módulo de auth cada um no seu projeto (não existe `@nexago/auth`). `organizer` segue a mesma convenção — extrair um lib compartilhado é um refactor futuro, fora do escopo de "deixar o login pronto".
- **Sem testes unitários novos para o módulo de auth.** Nem `arena` nem `coach` têm spec para login/signup/guard hoje (só utilitário puro de cálculo tem `.spec.ts` no monorepo) — manter essa convenção em vez de introduzir um padrão novo só aqui.
- **Sem provisionamento de Firebase Hosting agora.** Criar o hosting site/target real (`firebase hosting:sites:create` + entradas em `firebase.json`/`.firebaserc`) é uma ação de deploy separada, fora do que foi pedido ("criar o projeto e deixar o login pronto"); fica registrado como próximo passo, não feito nesta entrega.

## Cloud Function nova (`functions/src/organizer-signup.ts`)

Mesmo formato de `functions/src/coach-signup.ts`:

- `withOrganizerRole(existingRoles)` — adiciona `"organizer"` às roles existentes do caller sem duplicar/remover as demais (uma conta pode acumular papéis, ex. atleta + organizador).
- `completeOrganizerSignup` (`onCall`) — chamado uma vez pelo client logo após `createUserWithEmailAndPassword`; aplica a claim via `applyRolesToClaims` e espelha em `users/{uid}` (`displayName`, `phone`). Registrado em `functions/src/index.ts` no mesmo padrão de export dos outros `complete*Signup`.

Sem mudança em `firestore.rules` nem `firestore.indexes.json` — nada de novo modelo de dados nesta entrega.

## Configuração Angular / infra do frontend

- `angular.json` — novo projeto `organizer` (`root`/`sourceRoot: projects/organizer`), builder `@angular/build:application`, `outputPath: ../dist/organizer`, `fileReplacements` prod → `environment.prod.ts` (padrão `coach`, não o de `arena` que hoje não tem replacement nenhum), budgets 8kB/12kB, `styles: src/styles.scss`. Sem porta fixa no `serve` (nenhum dos outros 4 declara; documentar `ng serve organizer --port 4205` pra rodar em paralelo a outro portal quando precisar).
- `package.json` — novos scripts `start:organizer` e `build:organizer` (`ng build organizer --configuration production`); incluído em `build:all`.
- `index.html` — título `NexaGO — Organizador`, `lang="pt-BR"`, `<base href="/">`, favicon próprio.
- `src/styles.scss` — mesmo bloco de tokens `--nx-*` (paleta/fontes da marca) copiado de `arena`/`coach`, byte-idêntico — é design system da marca, não por-projeto.
- Prefixo de seletor/classe CSS: `og-*` (`og-auth-shell`, `og-field`, `og-panel-shell`, ...) — segue a convenção de 2 letras (`ar-`, `co-`, `bo-`).

## Arquitetura de arquivos (`frontend/projects/organizer/src/app`)

```
auth/                        (cópia do padrão coach, co-*→og-*)
  auth.service.ts             — login e-mail/senha, roleClaims via ID token,
                                 isOrganizer = computed(...), createOrganizerAccount(email, password, displayName, phone)
                                 chamando completeOrganizerSignup, reset de senha, sign-out
  organizer.guard.ts           — cópia do coach.guard.ts: bloqueia /painel se !isOrganizer() após authReady
  auth.guard.ts                — reaproveitado tal qual (genérico)
  firebase-auth-errors.ts      — cópia (mapeamento de erros Firebase Auth → pt-BR)
  login.component.ts
  signup.component.ts          — campos: nome, telefone, e-mail, senha
  forgot-password.component.ts
  reset-password.component.ts
  email-sent.component.ts
  ui/
    auth-shell.component.ts
    field.component.ts
    strength-meter.component.ts
painel/
  panel-home.component.ts     — placeholder guardado ("Painel do organizador — em construção" + sair)
app.config.ts                 — zoneless, provideRouter(routes, withComponentInputBinding()), sem HttpClient/Firebase provider explícito
app.routes.ts                 — entrar, entrar/recuperar, entrar/enviado, entrar/redefinir, cadastro, painel ([authGuard, organizerGuard])
app.ts                        — <router-outlet /> puro
environment.ts / environment.prod.ts — importam @nexago/firebase-config, iguais aos outros 4
```

Nomes de arquivo/seletor em inglês, rotas em português — mesma convenção do resto do monorepo.

## Fora de escopo desta entrega

Conteúdo real do painel (torneios, ligas, categorias, financeiro, staff, uniformes — tudo que já existe maduro no Flutter); extração de um `@nexago/auth` compartilhado; provisionamento de Firebase Hosting (site/target) e deploy; qualquer mudança em `firestore.rules`/modelo de dados (a role `organizer` já está pronta no backend); mudanças no app Flutter ou nos portais `athlete`/`arena`/`coach`.

## Testes

Sem suíte unitária nova para o módulo de auth (segue a convenção de `arena`/`coach`, que também não têm). Verificação é manual: rodar `ng build organizer` limpo, e testar o fluxo completo (cadastro → claim aplicado → painel placeholder → logout → login → esqueci/redefinir senha) contra o projeto Firebase de dev, igual ao que já foi feito nos portais anteriores.
