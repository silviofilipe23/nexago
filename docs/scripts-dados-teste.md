# Scripts de dados de teste

Dois comandos simétricos para montar e desmontar um cenário de teste completo
no projeto de **dev**: `functions/scripts/seed-test-data.js` e
`functions/scripts/delete-test-data.js`, expostos como atalhos npm.

## Pré-requisitos

```bash
cd functions
npm run build                              # os scripts leem de ../lib
gcloud auth application-default login      # credenciais admin (ADC)
```

Alternativa às credenciais: `--credentials /caminho/serviceAccount.json` ou
`GOOGLE_APPLICATION_CREDENTIALS` apontando para um JSON de **service account**.

### Armadilha conhecida: ADC do Firebase CLI não é service account

Em máquina sem `gcloud` instalado, o próprio Firebase CLI já deixa uma ADC
utilizável em `~/.config/firebase/<conta>_application_default_credentials.json`
depois de um `firebase login`. Ela funciona para estes scripts **se copiada
para o caminho padrão da ADC**, `~/.config/gcloud/application_default_credentials.json`
(é o que `admin.initializeApp({projectId})`, sem `credential`, procura).

O que **não** funciona: passar esse arquivo via `--credentials` ou via
`GOOGLE_APPLICATION_CREDENTIALS`. Essas duas vias chamam
`admin.credential.cert(...)`, que exige um JSON de `service_account`
(`private_key`, `client_email`, etc.). A ADC do Firebase CLI é do tipo
`authorized_user` — sem esses campos — e a inicialização falha. Se as
credenciais "existem" mas o script não roda, essa é a causa mais provável;
confira o campo `"type"` no JSON antes de tentar as duas formas.

## Criar

```bash
npm run seed-test-data -- --project volley-track-dev-4596c --yes
```

Cria, numa execução: organizador seed, **320 atletas** (5 níveis × 2 gêneros ×
`--count 32`), **1 torneio** com **10 categorias**, **160 duplas** e **160
inscrições pagas** (16 duplas por categoria — `MAX_TEAMS_PER_CATEGORY`). O
torneio nasce `open`, sem chave gerada — gerar a chave pelo painel é o fluxo
que se quer testar manualmente depois.

Login dos seeds: `seed-<nivel>-<m|f>-NN@nexago.test` (ex.:
`seed-iniciante_1-m-01@nexago.test`, níveis `iniciante_1`, `iniciante_2`,
`intermediario_1`, `intermediario_2`, `open`) e `seed-organizer@nexago.test`,
senha `Senha123!` (ou `SEED_PASSWORD`).

| Flag | Default | Efeito |
|---|---|---|
| `--project <id>` | — (obrigatório, sem fallback de env) | projeto Firebase |
| `--yes` | dry-run | aplica de verdade |
| `--manager-uid <uid>` | cria organizador seed próprio | organizador do torneio |
| `--count <n>` | `32` (ou `COUNT`) | atletas por nível×gênero (total = `n × 10`) |
| `--today` | em 14 dias | torneio no dia de hoje |
| `--tournament-name <s>` | `Torneio seed nexaGO` | nome do torneio |

| Env var | Default | Efeito |
|---|---|---|
| `COUNT` | `32` | mesmo que `--count` (a flag tem prioridade) |
| `SEED_PASSWORD` | `Senha123!` | senha dos 321 logins seed (organizador e atletas) |

Idempotente: rodar de novo reaproveita contas e torneio existentes. Uma
ressalva sobre `SEED_PASSWORD`: a idempotência é por e-mail e **não regrava a
senha** de conta já existente no Auth — mudar `SEED_PASSWORD` e rodar de novo
não altera a senha de quem já foi criado.

### Guardas

As mesmas duas guardas de projeto do comando de limpeza, pelo motivo simétrico:

- **`--project` não tem fallback de env.** O alias `default` do `.firebaserc`
  aponta para produção; um `GCLOUD_PROJECT` exportado (comum ao mexer nas
  functions) faria o comando escolher o projeto sozinho.
- **Produção é bloqueada** (`volley-track-2dd3b`), mesmo com `--yes`. O seed
  cria 321 contas no Auth e um torneio `visibility: publicListing` /
  `listingStatus: open` — visível para usuários reais na listagem. E
  `delete-test-data.js` **se recusa a rodar em produção**, então desfazer seria
  100% manual.
- **Reutilizar torneio existente exige `seedTestTournament: true`.** A busca
  por nome casa por substring nos dois sentidos, então
  `--tournament-name "Copa"` casaria com uma "Copa Goiás" real. Se o nome casar
  com um torneio sem a flag, o comando **aborta sem gravar nada**, citando id e
  nome do torneio encontrado. (Os scripts antigos de torneio não têm essa
  exigência — ver "Scripts antigos".)

## Apagar

```bash
npm run delete-test-data -- --project volley-track-dev-4596c --yes
```

Apaga em cascata, **na ordem**:

```
matches → teams → inscriptions → tournaments → public_profiles → Auth → users
```

Essa ordem **não** é "filho antes do pai" — é "o documento que serve de
**índice** morre por último". `users/{uid}` carrega os flags
(`seedTestAthlete` / `seedTestOrganizer`) que o script usa para redescobrir
tudo o resto a partir do zero; enquanto ele existir, rodar o comando de novo
depois de uma interrupção (Ctrl+C, queda de rede, etc.) redescobre exatamente
o que falta apagar — apagar um doc que já sumiu é no-op. Pelo mesmo motivo
`teams` sai antes de `inscriptions`: um `team` só é encontrado através do
`teamId` de uma inscrição, então a inscrição precisa sobreviver até o team
já ter sido apagado. **Não reordene "de volta" para algo mais intuitivo** —
essa ordem existe para tornar a limpeza retomável, e trocá-la reabre a chance
de deixar órfãos que nenhuma execução futura reencontra.

| Flag | Default | Efeito |
|---|---|---|
| `--project <id>` | — (obrigatório, sem fallback de env) | projeto Firebase |
| `--yes` | dry-run | apaga de verdade |
| `--force` | — | prossegue mesmo com atleta real inscrito no torneio seed |

### Guardas

- **`--project` não tem fallback de env.** O alias `default` do `.firebaserc`
  aponta para produção; um fallback silencioso poderia apagar dados reais.
- **Produção é bloqueada** (`volley-track-2dd3b`), mesmo com `--yes`.
- **Atleta real inscrito em torneio seed** → aborta e lista os uids. Com
  `--force`, o torneio e as inscrições saem (inclusive a dele), mas o perfil e
  a conta Auth dele ficam.
- **Atleta seed inscrito em torneio real** → é preservado (doc, espelho e
  conta) e reportado no fim. Apagá-lo deixaria uma chave real com participante
  inexistente.
- **Organizador seed que é `managerId` de torneio real** → mesma lógica,
  preservado e reportado no fim. Sem essa exceção, o torneio real ficaria com
  `managerId` apontando para uma conta inexistente e o dono de verdade
  perderia acesso a ele (`managerId === uid` é o que o ACL de torneio checa).
- **Inscrição com `tournamentId` pendurado** (torneio apagado à mão pelo
  console, por exemplo) → **não** preserva ninguém. "Torneio real" e "torneio
  que não existe mais" são casos diferentes: tratá-los igual travaria a limpeza
  para sempre, com a mensagem falsa de que há torneios REAIS envolvidos. A
  inscrição órfã é apagada quando **todos** os participantes são atletas seed
  (é lixo do próprio seed) e apenas **reportada** quando envolve alguém que não
  é seed ou não tem participante — a limpeza não apaga o que não conseguiu
  provar que é de teste.

`tournaments` e `users` são apagados com `recursiveDelete`, não com
`batch.delete`: os dois têm subcoleções (`staff` e `categoryCommunications` no
torneio; `notifications`, `tokens` e `favorites` no usuário) que sobreviveriam
ao pai, sem caminho de descoberta. Adicionar mesário e disparar comunicação de
categoria são exatamente os fluxos que este seed existe para exercitar, então é
esperado que essas subcoleções existam na hora de limpar.

### Exit code

Se alguma conta do Auth não puder ser removida (`deleteUsers` retorna erro
para algum uid), o Firestore ainda é limpo normalmente, mas o script encerra
com `"Limpeza concluída COM FALHAS"` e **código de saída diferente de zero**.
Quem automatizar esse comando (CI, outro script) deve checar `$?` — sucesso
silencioso não é garantido só porque o comando "rodou até o fim".

## Scripts antigos

`seed-athletes.js`, `seed-tournament-with-enrollments.js`,
`seed-tournament-today-with-enrollments.js` e `delete-seed-athletes.js`
continuam funcionando como antes. Os novos comandos os orquestram; prefira os
novos, principalmente na limpeza — `delete-seed-athletes.js` apaga só os
atletas e deixa o torneio órfão.

Isso vale também para as guardas: os dois `seed-tournament-*` continuam
aceitando fallback de env em `--project` e continuam reutilizando qualquer
torneio cujo nome case, com ou sem `seedTestTournament`. É deliberado — alguém
pode estar usando um deles para despejar inscrições de teste num torneio criado
à mão pelo painel. A exigência da flag na reutilização é **opcional na lib
compartilhada** (`requireSeedFlagOnReuse`) e só o `seed-test-data.js` a liga,
porque só ele promete uma limpeza simétrica.
