# Authelia isolada: desenho, não implantação

## Caminho proposto
Nova instância dedicada e único proprietário, separada de LinkedIn em processo/container, usuário, rede, volumes, banco, cookies, sessão, signing keys, HMAC, criptografia e cliente OAuth. Não herdar configuração ou segredos existentes. Proposta de hostname ainda NÃO aprovada: `auth-mcpml.bonorasw.com.br`; não é issuer verificado. MCP continua `https://mcpml.bonorasw.com.br/mcp`. Servidores só loopback/rede privada; TLS/proxy expõem apenas rotas revisadas. Authelia não recebe tokens Mercado Livre; MCP não recebe senhas do proprietário.

Cliente pré-registrado confidencial com segredo exclusivo e PKCE. Cadastro administrativo e aprovação do proprietário são passos futuros. Não implementar DCR caseiro. O fragmento tem placeholders inválidos deliberadamente e NÃO constitui configuração completa. Falta selecionar versão oficial suportada por digest, validar sintaxe com essa versão e configurar autenticação, armazenamento, sessão, notificador e chaves sem tocar LinkedIn.

## Evidência e compatibilidade
Authelia documenta discovery OIDC/RFC8414 e JWT access tokens RFC9068; DCR não está disponível. Logo usamos cliente previamente cadastrado, não um falso endpoint de registro. [Protocolos Authelia](https://www.authelia.com/integration/openid-connect/introduction/).

Configuração de cliente admite PKCE S256, audiência explícita, consentimento e access tokens assinados. Um ID token tem audiência do cliente e não substitui access token. [Cliente Authelia](https://www.authelia.com/configuration/identity-providers/openid-connect/clients/).

Authelia permite lifespans e definição de scopes; propomos cinco minutos de access token, escopo próprio sem dados adicionais e autorização restrita ao proprietário com2FA. [Provider Authelia](https://www.authelia.com/configuration/identity-providers/openid-connect/provider/).

OpenAI documenta cliente pré-definido como alternativa a CIMD/DCR. Discovery precisa anunciar S256; copiar callback EXATO da gestão real do MCP. Dependendo do issuer, pode ser `https://chatgpt.com/connector/oauth/{callback_id}` em vez do callback estável. Não usar wildcard ou cadastrar ambos por conveniência. [Autenticação OpenAI](https://developers.openai.com/plugins/build/auth).

## Contrato a verificar com instância real
- Ler discovery real, não criar um JSON de discovery fingindo ser Authelia. issuer exato, endpoints HTTPS, JWKS, métodos token e S256. Metadados MCP apontam para esse issuer somente após validação.
- Fluxo real authorization-code + S256 e `resource=https://mcpml.bonorasw.com.br/mcp`, retorno state exato, código uso único, callback autorizado e troca pelo mesmo cliente.
- JWT: assinatura RS256 em chave exclusiva, typ at+jwt, iss exato, aud contendo recurso MCP, client_id aprovado, sub estável do proprietário, scope mcp:read, exp/iat válidos. Obter sub por login verificado; não usar nome/email inferido. Rejeitar tokens LinkedIn mesmo se a mesma pessoa.
- Discovery/JWT descritos aqui são EXPECTATIVAS da documentação, não leituras de servidor instalado. Não testamos a versão existente ou uma nova instância Authelia.
- O transporte atual anuncia só mcp:read. Confirmar se ChatGPT solicita offline_access/openid automaticamente ou ajustar negociação de scopes para obter refresh. Não assumir refresh funcional só pelo fragmento.

## Riscos e decisões de segurança
JWT local não consulta revogação a cada chamada: um access token revogado pode continuar aceito até expirar. TTL proposto5min limita, não elimina, janela. Não prometer revogação instantânea. Se isso for inaceitável, exigir introspection autenticada com armazenamento/rotação adicional de segredo antes de produção.

Novo issuer introduz superfície de login, recovery,2FA e manutenção. Precisa aprovação específica antes de expor hostname/rotas, criar credenciais de acesso e configurar permissões; enrollment de2FA e consentimento da conta pelo proprietário. Segredo do cliente novo deve ser enviado apenas ao cadastro OAuth autorizado por fluxo seguro, nunca chat, Git ou logs. Não automatizar concessões além do escopo aprovado.

Futuros passos de segurança: validar usuário isolado,2FA e recuperação; segredo criptografia/storage/HMAC/signing distintos; proteger arquivos; rate limits; cookies restritos ao hostname novo; versões/digest; restart com limites; rollback que desativa somente mcpml. Nada disso foi aplicado.

## Testes antecipados sem rede/credenciais
O teste local `tests/authelia-plan.test.mjs` valida somente invariantes e bloqueios do desenho; os16 testes anteriores validam transporte/assinaturas com fixtures. Nenhum valida execução ou schema do Authelia. Depois de autorização e configuração segura, exigir testes negativos: issuer/sub/client/aud errados, PKCE ausente/incorreto, callback estranho, scope write, token vencido/ID token, proprietário não autorizado, refresh/revogação, rotação JWKS e restart. Não enfraquecer verifier para acomodar token inesperado.
