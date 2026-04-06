Cada aplicação ou biblioteca Angular fica em uma pasta sob projects/.

Novo app (executar na pasta frontend):
  npx ng generate application nome-do-app --directory=projects/nome-do-app --routing --style=scss

Nova biblioteca compartilhada:
  npx ng generate library nome --prefix=nexago

Depois registre o projeto em angular.json (o CLI faz isso ao gerar).
