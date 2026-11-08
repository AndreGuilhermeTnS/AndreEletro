# MercadoLog — Sistema de Gestão Comercial e Controle de Estoque

## 1. Sobre o projeto

O **MercadoLog** é um sistema web desenvolvido para auxiliar pequenos estabelecimentos comerciais no cadastro de produtos, controle de estoque, gerenciamento de compras e reposições, registro de pedidos de clientes e acompanhamento financeiro.

O projeto foi desenvolvido de maneira incremental, com organização das atividades por meio de um quadro Kanban no Trello, utilizando React no frontend, Node.js com Express no backend e PostgreSQL como banco de dados relacional.

O objetivo é integrar diferentes processos de gestão comercial em um único sistema, reduzindo a dependência de controles manuais e melhorando a organização das informações.

## 2. Tecnologias utilizadas

**Frontend**
- React
- JavaScript
- HTML e CSS
- Vite

**Backend**
- Node.js
- Express
- API REST
- Biblioteca `pg` para comunicação com PostgreSQL

**Banco de dados**
- PostgreSQL
- pgAdmin 4

**Desenvolvimento e gerenciamento**
- Visual Studio Code
- Git
- GitHub
- Trello (Kanban)

## 3. Funcionalidades implementadas

### AC1 — Cadastro de Produtos

A primeira etapa implementou o cadastro e a consulta de produtos.

Funcionalidades:
- Cadastro de nome, SKU, categoria e preço de venda
- Registro de estoque inicial e estoque mínimo
- Validação de campos e valores obrigatórios
- Prevenção de SKUs duplicados
- Listagem de produtos cadastrados
- Armazenamento das informações no PostgreSQL
- Registro opcional do custo inicial de aquisição
- Sugestão de preço de venda com margem bruta configurável
- Consulta ao custo médio de aquisição e à margem bruta estimada

### AC2 — Controle de Estoque

A segunda etapa implementou o registro e o acompanhamento das movimentações de estoque.

Funcionalidades:
- Registro de entradas de mercadorias
- Atualização do estoque atual dos produtos
- Histórico de movimentações
- Exibição de produto, SKU, tipo, quantidade e data
- Validação de quantidades
- Persistência das informações
- Integração com as entradas recebidas da AC3 e as saídas confirmadas no módulo Extra

### AC3 — Pedidos de Reposição e Controle Financeiro

A terceira etapa implementou o gerenciamento de pedidos de compra e reposição.

Funcionalidades:
- Cadastro de pedidos vinculados aos produtos existentes
- Registro de quantidade, custo unitário e forma de pagamento prevista
- Cálculo do valor total do pedido
- Histórico de pedidos
- Fluxo de status: PENDENTE → APROVADO → RECEBIDO
- Atualização automática do estoque após o recebimento
- Registro da entrada no histórico de movimentações
- Proteção contra recebimento duplicado
- Cálculo do custo médio ponderado de aquisição
- Resumo financeiro de pedidos pendentes, aprovados e recebidos

### Extra — Pedidos de Clientes e Vendas

A quarta etapa ampliou o sistema para o registro de pedidos de clientes.

Funcionalidades:
- Identificação do cliente pelo nome
- Seleção de vários produtos no mesmo pedido
- Preenchimento dos preços de venda a partir do cadastro da AC1
- Carrinho de compras com quantidades, subtotais e total estimado
- Registro de pedidos com status PENDENTE
- Confirmação de vendas com baixa automática no estoque
- Registro de movimentações do tipo SAIDA
- Cancelamento de pedidos pendentes
- Verificação de disponibilidade de todos os produtos antes da confirmação
- Proteção contra baixa duplicada e estoque negativo
- Histórico de pedidos e vendas
- Resumo de faturamento confirmado
- Estimativa de margem bruta a partir dos custos médios conhecidos

## 4. Regras de negócio

**Cadastro:** cada produto possui um SKU único. O estoque atual é inicializado de acordo com a quantidade informada no cadastro.

**Reposição:** o estoque somente é atualizado quando o pedido de reposição é marcado como RECEBIDO. A aprovação, isoladamente, não altera a quantidade disponível.

**Custo médio:** o custo médio de aquisição é calculado por média ponderada das quantidades e custos conhecidos. Produtos com estoque histórico sem custo precisam receber uma referência inicial.

**Vendas:** o cadastro de um pedido de cliente não movimenta o estoque. As unidades são descontadas somente quando a venda é confirmada.

**Integridade:** as operações críticas de recebimento e confirmação de vendas utilizam transações PostgreSQL para evitar atualizações parciais.

**Financeiro:** os indicadores de compras representam valores de pedidos, não necessariamente pagamentos realizados. Os indicadores de vendas representam faturamento confirmado, não necessariamente valores recebidos em caixa.

## 5. Estrutura do projeto

```text
AndreEletro/
├── backend/
│   ├── src/
│   │   ├── server.js
│   │   └── database.js
│   ├── package.json
│   └── package-lock.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── Estoque.jsx
│   │   ├── Pedidos.jsx
│   │   ├── Vendas.jsx
│   │   └── Vendas.css
│   └── package.json
├── database/
├── docs/
└── README.md
```

A organização acima apresenta os arquivos principais. Outros arquivos de configuração do React, do Vite e do Git também fazem parte do projeto.

## 6. Banco de dados

Banco utilizado: `mercadolog`.

Principais tabelas:

| Tabela | Finalidade |
|---|---|
| `produtos` | Cadastro, preços, estoque e custo médio |
| `movimentacoes_estoque` | Histórico de entradas e saídas |
| `pedidos_reposicao` | Pedidos de compra e reposição |
| `pedidos_clientes` | Informações gerais dos pedidos de clientes |
| `itens_pedidos_clientes` | Produtos e quantidades de cada pedido |

As tabelas utilizam chaves primárias, relacionamentos e restrições para preservar a integridade dos dados.

## 7. Endpoints da API

| Método | Endpoint | Finalidade |
|---|---|---|
| GET | `/` | Verificar se a API está funcionando |
| GET | `/produtos` | Listar produtos |
| POST | `/produtos` | Cadastrar produto |
| PATCH | `/produtos/:id/custo-inicial` | Registrar custo inicial de aquisição |
| POST | `/movimentacoes` | Registrar entrada manual de estoque |
| GET | `/movimentacoes` | Consultar movimentações |
| POST | `/pedidos` | Cadastrar pedido de reposição |
| GET | `/pedidos` | Listar pedidos de reposição |
| PATCH | `/pedidos/:id/status` | Aprovar ou receber reposição |
| GET | `/financeiro/resumo` | Consultar resumo financeiro de compras |
| POST | `/pedidos-clientes` | Cadastrar pedido de cliente |
| GET | `/pedidos-clientes` | Consultar pedidos de clientes |
| PATCH | `/pedidos-clientes/:id/confirmar` | Confirmar venda |
| PATCH | `/pedidos-clientes/:id/cancelar` | Cancelar pedido pendente |
| GET | `/vendas/resumo` | Consultar resumo financeiro de vendas |

## 8. Como executar localmente

### Pré-requisitos

- Node.js e npm instalados
- PostgreSQL em execução
- Banco `mercadolog` criado
- Tabelas e relacionamentos configurados

### Backend

No terminal, entrar na pasta:

```bash
cd backend
```

Instalar dependências:

```bash
npm install
```

Configurar o arquivo local `backend/.env`, utilizando os valores de conexão do PostgreSQL:

```dotenv
DB_USER=postgres
DB_HOST=localhost
DB_NAME=mercadolog
DB_PASSWORD=SUA_SENHA_LOCAL
DB_PORT=5432
```

Iniciar o servidor:

```bash
npm start
```

A API utiliza:

`http://localhost:3000`

### Frontend

Em outro terminal, entrar na pasta:

```bash
cd frontend
```

Instalar dependências:

```bash
npm install
```

Iniciar a aplicação:

```bash
npm run dev
```

Abrir o endereço informado pelo Vite, normalmente:

`http://localhost:5173`

### Preparação do banco

O banco PostgreSQL precisa conter o esquema das cinco tabelas utilizadas pelo projeto. O esquema pode ser preparado por meio de um script SQL de criação ou restaurado de um backup compatível.

As credenciais de conexão devem permanecer apenas no ambiente local e não devem ser enviadas ao repositório.

## 9. Testes realizados

Foram executados testes funcionais e de integração contemplando:

- Cadastro e consulta de produtos
- Validação de campos e SKUs duplicados
- Registro e persistência de movimentações de estoque
- Cadastro, aprovação e recebimento de reposições
- Atualização do custo médio ponderado
- Sugestão de preço de venda com margem configurável
- Cadastro de pedidos com múltiplos itens
- Cálculo dos totais a partir dos preços cadastrados
- Confirmação de vendas e baixa de estoque
- Cancelamento de pedidos pendentes
- Proteção contra confirmação e recebimento duplicados
- Rejeição de vendas com estoque insuficiente
- Desfazimento das operações de uma venda quando algum item não pode ser atendido
- Resumos financeiros
- Persistência dos dados após atualização do navegador
- Continuidade das funcionalidades anteriores

As quatro etapas passaram nos testes locais executados durante o desenvolvimento.

## 10. Limitações e melhorias futuras

O sistema foi desenvolvido como projeto acadêmico e atualmente opera em ambiente local.

Limitações conhecidas:
- Não há autenticação nem gerenciamento de usuários.
- A interface de pedidos de clientes é administrativa, não uma loja pública.
- Não há integração com plataformas de pagamento.
- O faturamento confirmado não representa necessariamente recebimento financeiro.
- A margem estimada não considera todos os impostos e despesas operacionais.
- Entradas manuais pela tela da AC2 não registram custo de aquisição.
- A média histórica dos produtos antigos depende de uma referência de custo inicial.

Possíveis melhorias:
- Login e controle de permissões
- Catálogo público de produtos
- Pedidos online com área do cliente
- Dashboard com gráficos e indicadores
- Alertas de estoque mínimo
- Gestão de fornecedores
- Relatórios de vendas e rentabilidade
- Controle de pagamentos e recebimentos

## 11. Metodologia ágil

O projeto foi organizado em um quadro Kanban no Trello, utilizando as etapas:

Backlog → A Fazer → Em Desenvolvimento → Em Teste → Concluído

As funcionalidades foram implementadas progressivamente, com validação de frontend, backend e banco de dados em cada entrega.

## 12. Repositório e documentação

**GitHub:** https://github.com/AndreGuilhermeTnS/AndreEletro

**Trello:** https://trello.com/invite/b/6aa72755e5729b76333578b9/ATTI29c1888450f353aa471d511432fdb864EFAF7D71/projeto-de-logistica-andreeletro


## 13. Autor

André Correia Guilherme

Projeto acadêmico de desenvolvimento de sistemas.