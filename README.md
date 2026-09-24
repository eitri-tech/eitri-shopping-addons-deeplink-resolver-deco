# Eitri Shopping Addons
[Eitri Shopping Addons](https://github.com/eitri-tech/eitri-shopping-addons) são uma maneira rápida de integrar provedores de serviços e novos recursos e funcionalidades em aplicativos Eitri. Você precisa apenas configurar seus Eitri-apps para utilizarem os add-ons selecionados.

## Deeplink Resolver
O Eitri Deeplink Resolver é um addon plug-n-play para aplicações do Eitri App Shopping.

Com ele você pode dar ao seu app a capacidade de interpretar e direcionar para a página correta do app a grande maioria dos deeplinks padrão de e-commerce como deeplinks de páginas de categoria, produto, coleções, favoritos, minha conta e muito mais.

Alem disso, você pode configurar regras e caminhos personalizados para seus deeplinks a partir da configuração remota de sua aplicação.

Se preferir você pode tambem criar uma cópia do Deeplink Resolver em sua aplicação para personalizar ainda mais os comportamentos usando nosso template.

### Deeplinks suportados (Vtex)
Para saber mais sobre os deeplinks suportados acesse nossa [documentação sobre deeplinks](https://docs.eitri.tech/pt/eitri-shopping/deeplinks/).

### Ativando o Deeplink Resolver padrão (Para Vtex)

Para ativar o deeplink resolver com os comportamentos padrão, siga os seguintes passos:

1. Acesse o [Console Eitri](https://console.eitri.tech/) e vá em `Aplicativos`
2. Selecione o aplicativo no qual deseja configurar o Deeplink Resolver e em seguida acesse `Seus ambientes`
3. Clique em `Configurar` no ambiente desejado e procure a sessão `Configurações customizadas` para edita-las
4. Clique em `Editar configurações` e altere com cuidado o JSON apresentado para incluir as informações descritas nas proximas sessões (`deeplinkResolver` e, caso necessário, `deeplinks`).
5. Solicite à equipe Eitri a ativação do Deeplink Resolver para o seu app (Não é necessário caso você crie [seu próprio deeplink resolver](#criando-seu-próprio-deeplink-resolver))

> [!IMPORTANT]
> Ao alterar as configurações remotas de um ambiente, esteja atento à sintaxe do JSON pois o efeito das alterações é imediato e você pode quebrar seu app caso formule mal o JSON.

#### deeplinkResolver

Inclua em qualquer parte da raiz do JSON o `deeplinkResolver` com o slug de nosso Eitri-app para ativar o suporte ao processamento de deeplinks.

Esta entrada define qual será o Eitri-app responsável por processar seus deeplinks.

```json
    "deeplinkResolver": {
        "slug": "eitri-shopping-addons-deeplink-resolver"
    }
```

### Personalizando deeplinks para seu app

Alem dos deeplinks padrão, você pode definir deeplinks customizados para seu App para expandir ainda mais as possibilidades de tratamento e abertura de páginas do seu aplicativo. Para isso inclua as informações em sua configuração de ambiente conforme descrito à seguir.

#### deeplinks

Inclua em qualquer parte da raiz do JSON o `deeplink` com `deeplinkMap` dentro dele. Em `deeplinkMap` você deve criar um array com um objeto para cada personalização de path que deseja receber e tratar.

Exemplo:

```json
{
    "deeplink": {
        "deeplinkMap": [
            {
                "path": [
                    "novidades"
                ],
                "slug": "my-eitri-app-home",
                "params": {
                    "route": "ProductCatalog",
                    "facets": [
                        {
                            "productClusterIds": 139
                        }
                    ]
                }
            },
            {
                "path": [
                    "outlet"
                ],
                "slug": "my-eitri-app-home",
                "params": {
                    "route": "ProductCatalog",
                    "facets": [
                        {
                            "productClusterIds": 165
                        }
                    ]
                }
            }
        ]
    }
}
```

Onde:

`path`: é o termo que deseja identificar no caminho do deeplink
`slug`: é o slug do Eitri-app de seu app para qual deseja direcionar o usuário
`params`: são os [parâmetros de inicialização](https://cdn.83io.com.br/library/eitri-bifrost/doc/latest/classes/Bifrost.html#getInitializationInfos) que deseja enviar ao Eitri-app quando ele for chamado 

#### Exemplo de configuração de ambiente

```json
{
    "deeplink": {
        "deeplinkMap": [
            {
                "path": [
                    "novidades"
                ],
                "slug": "my-eitri-app-home",
                "params": {
                    "route": "ProductCatalog",
                    "facets": [
                        {
                            "productClusterIds": 139
                        }
                    ]
                }
            },
            {
                "path": [
                    "outlet"
                ],
                "slug": "my-eitri-app-home",
                "params": {
                    "route": "ProductCatalog",
                    "facets": [
                        {
                            "productClusterIds": 165
                        }
                    ]
                }
            },
            {
                "path": [
                    "wishilist"
                ],
                "slug": "my-eitri-app-account",
                "params": {
                    "route": "whishlist"
                }
            },
            {
                "path": [
                    "login"
                ],
                "slug": "my-eitri-app-account"
            },
            {
                "path": [
                    "_secure/account#/orders"
                ],
                "slug": "my-eitri-app-account",
                "params": {
                    "route": "orders"
                }
            }
        ]
    },
    "deeplinkResolver": {
        "slug": "eitri-shopping-addons-deeplink-resolver"
    }
}
```


### Criando seu próprio Deeplink Resolver

Caso as personalizações via configuração remota não atendam suas necessidades, é possível tambem criar seu próprio Eitri-app de tratamento de deeplinks.

Para isso, utilize o [`eitri create` com o parâmetro `--template`](https://docs.eitri.tech/pt/eitri-cli/#opcoes-disponiveis_1) e selecione o template `eitri-shopping-addons-deeplink-resolver`.

Desta forma, ao invés de utilizar nosso Eitri-app de tratamento de deeplinks você poderá personalizar completamente os comportamentos e código de seu Eitri-app para atender as mais variadas necessidades.

> [!WARNING]
> Após a criação, você deve incluir o **slug do seu Eitri-app** recém criado na entrada `deeplinkResolver` em sua configuração de ambiente [conforme descrito anteriormente](#deeplinkresolver).

Usando esta estratégia, sempre que seu app for aberto a partir de um deeplink, o acesso será direcionado para este Eitri-app passando como [parâmetros de inicialização]((https://cdn.83io.com.br/library/eitri-bifrost/doc/latest/classes/Bifrost.html#getInitializationInfos)) as informações recebidas no deeplink para que você trate da maneira mais adequada.