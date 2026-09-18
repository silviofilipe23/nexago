# Runbook — subir a carteira por torneio

Escrito em 18/09/2026, com a decisão do dono: **a loja vem primeiro, o backend depois.**
Este arquivo existe porque a janela leva dias e o risco não é nenhum passo em si — é um passo
fora de ordem, executado depois, por quem não estava aqui.

## Por que a ordem é essa

O build publicado na loja (`1.0.11+108`) chama `requestOrganizerWithdrawal` **sem
`tournamentId`** e lê saldo direto de `organizerWallets/{uid}`. E o app da loja aponta para o
projeto **DEV** (`volley-track-dev-4596c`), que é onde está a base real de atletas.

Então, se as functions e a migração subirem antes de o build novo estar na mão dos usuários:

- todo saque pelo app devolve `invalid-argument: "Informe o torneio do saque."`;
- depois da migração, o dono vê **R$ 0,00** — que é exatamente o bug que originou este projeto.

Em 18/09 havia **um** organizador com dinheiro: R$ 951,73 no caixa do "Goiânia Open". É ele quem
veria o zero.

## Estado em 18/09/2026

| Item | Estado |
|---|---|
| `firestore.rules` no DEV | **no ar** (idêntico à main — o deploy respondeu "already up to date") |
| Índices do Firestore no DEV | **no ar**, incluindo os dois novos de `organizerWithdrawals` por `tournamentId` |
| Cloud Functions no DEV | **código antigo** — a fase 1 nunca foi publicada |
| Portal do organizador publicado | **bundle antigo** |
| App na loja | `1.0.11+108`, contrato antigo |
| Dados | ainda em `organizerWallets`; migração só em dry-run |
| PROD (`volley-track-2dd3b`) | **intocado**, e fora desta janela |

Nada estava quebrado em 18/09: a mudança inteira estava no escuro e o corte ainda não havia
acontecido.

## Passo 1 — loja

Versão `1.0.12+109`, na branch `chore/app-1-0-12-109`.

1. Submeter Android (AAB) e iOS.
2. **Esperar estar live de verdade.** Reenvio por rejeição da Apple bumpa o número do build — se
   isso acontecer, o `--min` do passo 3 é o número que ficou live, não o 109.

## Passo 2 — a janela do backend (só depois de o build estar live)

Os três sobem juntos, e não faz sentido separar:

- sem a migração, o portal **novo** mostra R$ 0,00 por evento, porque os caixas ainda não
  existem;
- sem o portal novo, a tela publicada quebra, porque `loadOrganizerWalletView` mudou de formato.

```bash
cd functions && npm run build
firebase deploy --only functions --project volley-track-dev-4596c
```

O `--project` é obrigatório em toda chamada: o default do `.firebaserc` é **PROD**
(`volley-track-2dd3b`).

Confirmar **"Successful update"** para cada função. `"No changes detected"` depois de uma falha
parcial **mente** — o hash é do pacote, não da função; nesse caso, redeployar por nome com
`--force`.

```bash
cd frontend && npx ng build organizer --configuration production
```

O bundle sai em `frontend/dist/organizer/browser/` e o upload é **manual, no hPanel da
Hostinger**. O portal é servido pela Hostinger e também pelo site `organizer-nexago`, e os dois
servem bundle apontando para o DEV.

```bash
cd functions
# dry-run IMEDIATAMENTE antes, e conferir o RESUMO:
node scripts/migrate-organizer-wallets-to-tournaments.js --project volley-track-dev-4596c
# só então, e este passo é do DONO por decisão dele:
node scripts/migrate-organizer-wallets-to-tournaments.js --project volley-track-dev-4596c --yes
```

O dry-run tem de ser refeito na hora, porque a base é viva: entre 16/09 e 18/09 o saldo do
Goiânia Open subiu de R$ 571,03 para R$ 951,73, por uma inscrição paga no meio.

O script é idempotente (`migratedToTournamentWalletsAt`), recusa lote acima de 500 operações e
não zera carteira com resto órfão. **Se aparecer órfão no resumo, pare e investigue** em vez de
aplicar: órfão é crédito cujo `registrationId` não resolveu para nenhum torneio.

## Passo 3 — fechar a porta do build velho

Só depois de o `109` estar live na loja:

```bash
cd functions && node scripts/set-min-app-version.js \
  --project volley-track-dev-4596c --platform android --min 109 --yes
```

`--min` é o **build number** (o `+N`), não o `1.0.x`. O gate lê `appConfig/appVersion` ao vivo.
Em 18/09 estava em `android.minBuildNumber: 101`, e **não havia chave `ios`** — se iOS também
tiver de ser fechado, é uma chamada própria com `--platform ios`. iOS propaga em até ~24h.

Aqui o gate não é cosmético: é o que tira de circulação o build que mostra R$ 0,00.

## Depois: as quatro verificações que só um humano faz

1. **Gestor de evento alheio**, no app: o caixa aparece, o saque vai para a **própria** chave, o
   saldo muda ao vivo.
2. **Administrador**: estado vazio explicativo no financeiro, e nenhum total de dinheiro
   alcançável — inclusive colando na barra de endereços
   `/organizer/tournaments/:id/financial` e abrindo a aba de pagamentos de uma categoria.
3. **Dono com 2+ eventos**: trocar de caixa e ver saldo, extrato e saques mudarem juntos; e,
   depois de sacar, confirmar que a tela **continua no mesmo caixa**.
4. **Backoffice**: um saque pedido por gestor mostra evento e solicitante na fila e no diálogo de
   aprovação.

## Se der errado depois da migração

Não há rollback automático. O que existe: `migratedToTournamentWalletsAt` em cada carteira
migrada, os `tournamentWallets` criados, e o `increment(-distribuído)` aplicado em
`organizerWallets`. Reverter é trabalho manual e exige o resumo daquele momento — **guarde a
saída do dry-run e a do `--yes`** antes de aplicar.

## Residuais conhecidos, nenhum bloqueando

1. O **mínimo de R$ 20** do saque vive só no cliente: `validateWithdrawalRequestShape` aceita
   qualquer valor positivo. Um pedido por fora do app custaria uma transferência PIX por centavo.
2. O template do diálogo de aprovação do backoffice não tem teste de componente, só as funções
   puras de texto.
3. `hasActiveTournamentStaffAccess` engole erro em `false`: falha transitória de rede joga um
   membro de equipe para a home de atleta. Caminho de login, não de carteira.
4. Discrepância de ~R$ 61 entre saques registrados (R$ 6.342,42) e o "já sacado" derivado do
   extrato (R$ 6.281,43). Não afeta a migração, que usa o extrato.
