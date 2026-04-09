Cada aplicação ou biblioteca Angular fica em uma pasta sob projects/.

Build de cada app (produção): artefatos na raiz do monorepo em dist/<nome-do-projeto>/browser/
  (angular.json: outputPath ../dist/<nome-do-projeto>)

Novo app (executar na pasta frontend):
  npx ng generate application nome-do-app --directory=projects/nome-do-app --routing --style=scss

Nova biblioteca compartilhada:
  npx ng generate library nome --prefix=nexago

Depois registre o projeto em angular.json (o CLI faz isso ao gerar).
