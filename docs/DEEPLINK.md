# Deeplinks resolvidos pelas páginas do site

Quando o usuário abre no celular uma URL do site (ex.: `https://www.loja.com.br/joias/colecao/bossa`) e tem o app instalado, o Deeplink Resolver precisa abrir a vitrine equivalente dentro do app. Este documento descreve como isso é feito sem manter um mapa manual de páginas na remote config.

## Por que não usar só o `deeplinkMap`

O `deeplink.deeplinkMap` da remote config exige uma entrada por página. Em lojas com muitas campanhas e coleções ele cresce sem parar. Na Monte Carlo chegou a ~25 mil linhas (1.235 entradas) e gerou dois problemas:

- **Crash de memória:** o parse do JSON grande quebra durante a ponte nativo → Eitri-App.
- **Dados desatualizados:** o site muda e o mapa fica para trás. Comparado com o site, 108 páginas do mapa abriam vitrines com cluster antigo ou com facet que não existe mais (ex.: `publico` foi renomeada para `genero`).

Também não dá para baixar a configuração do CMS do site no app, porque o `.decofile` da Deco tem ~10 MB e causa o mesmo crash. A API pública da VTEX também não resolve: ela informa os clusters de um produto, não qual cluster uma página usa.

## Como funciona

Uma AWS Lambda com Function URL (`page-index/lambda/index.mjs`) lê o `.decofile` do site **sob demanda** e responde, por página, qual vitrine ela configura. A resposta tem ~130 bytes na mediana. O app faz um GET por deeplink e nunca recebe o índice inteiro.

```
app: GET /<host>/<path>.json  →  Lambda (índice em memória)  →  .decofile do site (revalidado a cada 5 min)
```

Não existe build, cron nem arquivo publicado. Página criada no admin do site passa a funcionar no app em até ~10 minutos (5 de revalidação do índice + 5 de cache da resposta), sem deploy do app e sem mexer na remote config.

### Posição no pipeline

`resolveDeeplinkFromSitePages` (`src/services/SitePageResolver.js`) entra em `resolveDeeplinkPath` logo depois da remote config:

```
links de loja → raiz → produto (/p) → remote config (deeplinkMap) → páginas do site → landing page CMS → categoria → browser
```

- A remote config continua tendo prioridade e passa a servir apenas para **exceções**.
- Se a página não existir (404), a requisição falhar ou passar de 2 s, o passo devolve `false` e o pipeline segue como antes.

### Ativação

O passo só roda se a remote config tiver `pageResolverUrl` com o marcador `{path}`. Sem essa chave o comportamento do addon não muda.

```json
{
  "deeplinkResolver": {
    "slug": "eitri-shopping-addons-deeplink-resolver-deco",
    "pageResolverUrl": "https://<id>.lambda-url.<regiao>.on.aws/www.loja.com.br/{path}.json"
  }
}
```

### Formato da resposta

O `{path}` é o path da URL normalizado: sem query string nem `#`, sem barras nas pontas, cada segmento decodificado, sem espaços nas pontas, em minúsculas e codificado com `encodeURIComponent`. `/Joias/Colecao/Bossa/?utm=x` vira `joias/colecao/bossa`.

> [!WARNING]
> A normalização existe em dois lugares: `toIndexKey` no `SitePageResolver.js` e `normalizePath` no `lambda/index.mjs`. Se um mudar sem o outro, todas as consultas passam a dar 404 sem nenhum erro visível, e o app volta a cair no fallback de categoria.

Vitrine:

```json
{ "type": "catalog", "title": "Coleção Bossa", "facets": [{ "key": "productClusterIds", "value": "4047" }], "sort": "release:desc" }
```

O app abre a home com `route: 'ProductCatalog'` e `params: { facets, sort }`, no mesmo formato de uma entrada do `deeplinkMap`. Filtros `filter.*` e `sort` presentes na query do deeplink são somados às facets da página e têm prioridade sobre o sort dela.

Redirect (o app segue até 2 saltos):

```json
{ "type": "redirect", "to": "/aliancas" }
```

Páginas sem vitrine (institucionais, landing pages) respondem 404 e seguem para os próximos passos do pipeline.

## A Lambda

`page-index/lambda/index.mjs` é um arquivo único, sem dependências, que exporta `handler` no formato de evento da Function URL (payload 2.0). Ela não faz parte do Eitri-App: é publicada uma vez e atende todas as lojas liberadas.

Configuração:

| Item | Valor |
|---|---|
| Runtime | Node.js 20.x (usa o `fetch` nativo) |
| Handler | `index.handler` |
| Memória | 512 MB ou mais (pico medido de ~156 MB só com a Monte Carlo e ~190 MB com Osklen junto; o padrão de 128 MB não basta, e mais memória também encurta a instância fria) |
| Timeout | 30 s (o padrão de 3 s derruba a primeira chamada com `502 Internal Server Error`) |
| Function URL | auth type `NONE`: o app chama sem credencial |
| Variável `ALLOWED_SITES` | hosts aceitos, separados por vírgula (ex.: `www.montecarlo.com.br,www.osklen.com.br`). Obrigatória: sem ela a função vira um proxy aberto para o `.decofile` de qualquer site |
| Variável `REVALIDATE_MINUTES` | opcional (padrão 5): idade do índice que dispara a atualização em segundo plano |

Comportamento:

- **Cache (stale-while-revalidate):** o índice fica em memória no container e sobrevive entre invocações. Quando passa de `REVALIDATE_MINUTES`, a Lambda responde na hora com o índice atual e baixa o `.decofile` em segundo plano; o índice novo entra quando o download termina. Só a primeira chamada de cada container espera o download.
  - Há um único download por vez por site, mesmo com requisições simultâneas.
  - A Lambda envia `If-None-Match`, mas a Monte Carlo e a Osklen ignoram e devolvem 200 com o arquivo inteiro. Então cada revalidação custa o download e o parse completos, embora fora do caminho da resposta.
- **Falhas:** se o site cair ou devolver um `.decofile` com menos de 50 páginas, ela continua servindo o último índice bom. Sem índice bom (site que não é Deco, por exemplo), a falha fica em cache pela mesma janela e as requisições seguintes respondem 502 na hora, sem tentar baixar de novo.
- **Respostas:** 200 com `cache-control: max-age=300`, 404 para página sem vitrine, 400 sem path, 403 para host não permitido e 405 para método diferente de GET.
- **Instância fria:** a primeira chamada baixa ~900 KB (gzip) e processa o `.decofile`, o que leva ~1,2 s. As seguintes levam menos de 1 ms. A Function URL não tem cache próprio; com um CloudFront na frente, o `cache-control` passa a valer.

Para rodar localmente (o mesmo arquivo sobe um servidor HTTP quando executado direto):

```bash
ALLOWED_SITES=www.montecarlo.com.br node page-index/lambda/index.mjs 8787
curl http://localhost:8787/www.montecarlo.com.br/joias/colecao/bossa.json
```

Como a Lambda lê o `.decofile`:

- **Páginas** (`website/pages/Page.tsx`): usa o primeiro loader de vitrine (`*ListingPage.ts`) que tenha `selectedFacets`, seguindo referências a blocos nomeados (ex.: `"PLP Loader"`).
  - Isso inclui loaders próprios do site, como `site/loaders/Product/DiscountFilteredListingPage.ts`.
  - Prateleiras (`ProductList`) ficam de fora, para que landing pages com prateleiras não virem vitrine.
  - Paths cadastrados com espaço no fim (ex.: `"/joias/pedras/agata "`) são normalizados.
- **Redirects** (`website/loaders/redirect.ts`): viram respostas do tipo `redirect`. Quando uma página e um redirect têm o mesmo path, o redirect ganha, como no site.
- **Rotas com curinga** (`/*`, `/:slug/p`): são ignoradas. PDP e categoria já são tratadas por outros passos.

## Validação

`page-index/assert.mjs` executa o `SitePageResolver.js` real do addon (com Bifrost, shared e navegação simulados) para cada path do `deeplinkMap` e compara o resultado com o que o mapa mandava abrir.

```bash
node page-index/assert.mjs --index "http://localhost:8787/www.montecarlo.com.br/{path}.json"
node page-index/assert.mjs --index "https://<id>.lambda-url.<regiao>.on.aws/www.montecarlo.com.br/{path}.json" --report report.json --verbose
```

O site é a fonte de verdade, então diferenças em relação ao mapa são informativas:

| Grupo | Significado | Falha? |
|---|---|---|
| idêntico | site e mapa concordam | não |
| resolvido com a versão do site | o mapa estava desatualizado | não |
| removida/redirecionada no site | site responde 404 ou 3xx; a entrada pode sair do mapa | não |
| **regressão** | site responde 200 e o resolver não encontra a página | **sim (exit 1)** |
| ignorado | `forceWeb` e rotas estáticas, que continuam na remote config | não |

Resultado na Monte Carlo: 1.201 de 1.203 paths de catálogo resolvidos (1.093 idênticos e 108 com a versão mais nova do site), 2 páginas já removidas do site e 0 regressões.

## Migrando uma loja

1. Incluir o host da loja em `ALLOWED_SITES` da Lambda.
2. Rodar o `assert.mjs` contra a Function URL e confirmar zero regressões.
3. Adicionar `pageResolverUrl` na remote config do ambiente.
4. **Remover do `deeplinkMap` as entradas de catálogo.** Como a remote config vem antes no pipeline, qualquer entrada que ficar continua ganhando do site, inclusive quando estiver desatualizada. Devem ficar só as exceções: `forceWeb` e rotas que não são vitrine (`/login`, `/minha-conta`, busca etc.). Na Monte Carlo isso reduz o mapa de 1.235 para 32 entradas.

## Limitações conhecidas

- **Deeplinks por esquema** (`app://…`) passam pelo `UriDeeplinkSchemeResolver.js`, que ainda não consulta o índice.
- **Dependência do `.decofile` público:** se o site fechar o acesso a ele, instâncias que já têm o índice em memória continuam servindo a última versão, mas instâncias novas passam a responder 502 e o app cai no pipeline antigo. A alternativa definitiva é um loader no próprio site respondendo no mesmo contrato por path, e aí basta trocar a `pageResolverUrl`.
- **Lógica extra de loaders customizados:** o app aplica só as `selectedFacets`. Regras além delas, como o filtro de desconto do `DiscountFilteredListingPage`, não são reproduzidas.
- **Match do `deeplinkMap`:** ele casa por substring (`deeplink.indexOf(path)`) e a primeira entrada vence. Com `/app` antes de `/app-monte-carlo-joias`, a segunda nunca é alcançada. Isso vale para as exceções que ficarem na remote config.
