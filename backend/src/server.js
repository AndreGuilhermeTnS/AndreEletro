const express = require("express");
const cors = require("cors");
const pool = require("./database");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = 3000;

function custoMedioValido(valor) {
    if (typeof valor !== "string" && typeof valor !== "number") {
        return false;
    }

    return /^(?:0|[1-9]\d{0,7})(?:\.\d{1,4})?$/.test(String(valor))
        && Number(valor) > 0;
}

// Permite que o Express receba JSON
app.use(express.json());

app.get("/", (req, res) => {
    res.send("MercadoLog API funcionando!");
});

// Lista todos os produtos
app.get("/produtos", async (req, res) => {
    try {
        const resultado = await pool.query("SELECT * FROM produtos");

        res.json(resultado.rows);
    } catch (erro) {
        console.error(erro);

        res.status(500).json({
            mensagem: "Erro ao buscar produtos"
        });
    }
});

// Cadastra um novo produto
app.post("/produtos", async (req, res) => {
    try {
        const {
            nome,
            sku,
            categoria,
            preco,
            estoque_inicial,
            estoque_minimo,
            custo_medio_aquisicao
        } = req.body;

        // Validação dos campos obrigatórios
        if (!nome || !sku || !categoria) {
            return res.status(400).json({
                mensagem: "Nome, SKU e categoria são obrigatórios."
            });
        }

        // Validação do preço
        if (preco === undefined || preco === null || preco <= 0) {
            return res.status(400).json({
                mensagem: "O preço deve ser maior que zero."
            });
        }

        // Validação do estoque inicial
        if (
            estoque_inicial === undefined ||
            estoque_inicial === null ||
            estoque_inicial < 0
        ) {
            return res.status(400).json({
                mensagem: "O estoque inicial não pode ser negativo."
            });
        }

        // Validação do estoque mínimo
        if (
            estoque_minimo === undefined ||
            estoque_minimo === null ||
            estoque_minimo < 0
        ) {
            return res.status(400).json({
                mensagem: "O estoque mínimo não pode ser negativo."
            });
        }

        const custoInformado =
            custo_medio_aquisicao !== undefined &&
            custo_medio_aquisicao !== null &&
            custo_medio_aquisicao !== "";

    if (custoInformado && !custoMedioValido(custo_medio_aquisicao)) {
        return res.status(400).json({
            mensagem: "Custo médio de aquisição inválido. Deve ser um número positivo com até 4 casas decimais."
        });
    }
  const resultado = await pool.query(
    `
    INSERT INTO produtos
        (
            nome,
            sku,
            categoria,
            preco,
            estoque_inicial,
            estoque_minimo,
            estoque_atual,
            custo_medio_aquisicao
        )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
    `,
    [
        nome,
        sku,
        categoria,
        preco,
        estoque_inicial,
        estoque_minimo,
        estoque_inicial,
        custoInformado ? String(custo_medio_aquisicao) : null
    ]
);

        res.status(201).json({
            mensagem: "Produto cadastrado com sucesso!",
            produto: resultado.rows[0]
        });

    } catch (erro) {
        console.error(erro);

        // Código de erro do PostgreSQL para valor UNIQUE duplicado
        if (erro.code === "23505") {
            return res.status(400).json({
                mensagem: "Já existe um produto com esse SKU."
            });
        }

        res.status(500).json({
            mensagem: "Erro ao cadastrar produto."
        });
    }
});
// AC2 - Registrar entrada de estoque
app.post("/movimentacoes", async (req, res) => {
    const { produto_id, quantidade } = req.body;

    // Validar os dados recebidos
    if (
        !Number.isInteger(produto_id) ||
        produto_id <= 0 ||
        !Number.isInteger(quantidade) ||
        quantidade <= 0
    ) {
        return res.status(400).json({
            mensagem: "Informe um produto válido e uma quantidade inteira maior que zero."
        });
    }

    // Reservar uma conexão com o PostgreSQL
    const cliente = await pool.connect().catch((erro) => {
        console.error("Erro de conexão:", erro);
        return null;
    });

    if (!cliente) {
        return res.status(500).json({
            mensagem: "Não foi possível conectar ao banco de dados."
        });
    }

    try {
        // Iniciar a transação
        await cliente.query("BEGIN");

        // Atualizar o estoque do produto
        const produto = await cliente.query(
            `
            UPDATE produtos
            SET estoque_atual = estoque_atual + $1
            WHERE id = $2
            RETURNING id, nome, sku, estoque_atual
            `,
            [quantidade, produto_id]
        );

        if (produto.rows.length === 0) {
            await cliente.query("ROLLBACK");

            return res.status(404).json({
                mensagem: "Produto não encontrado."
            });
        }

        // Registrar o histórico da entrada
        const movimentacao = await cliente.query(
            `
            INSERT INTO movimentacoes_estoque
                (produto_id, tipo, quantidade)
            VALUES ($1, 'ENTRADA', $2)
            RETURNING *
            `,
            [produto_id, quantidade]
        );

        // Confirmar as duas operações
        await cliente.query("COMMIT");

        res.status(201).json({
            mensagem: "Entrada de estoque registrada com sucesso!",
            produto: produto.rows[0],
            movimentacao: movimentacao.rows[0]
        });

    } catch (erro) {
        await cliente.query("ROLLBACK");
        console.error("Erro ao registrar entrada:", erro);

        res.status(500).json({
            mensagem: "Erro ao registrar entrada de estoque."
        });

    } finally {
        // Liberar a conexão
        cliente.release();
    }
});
// AC2 - Consultar o histórico de movimentações
app.get("/movimentacoes", async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT
                m.id,
                m.produto_id,
                p.nome AS produto_nome,
                p.sku AS produto_sku,
                m.tipo,
                m.quantidade,
                m.data_movimentacao
            FROM movimentacoes_estoque m
            INNER JOIN produtos p
                ON m.produto_id = p.id
            ORDER BY m.data_movimentacao DESC, m.id DESC
        `);

        res.status(200).json(resultado.rows);

    } catch (erro) {
        console.error(
            "Erro ao consultar movimentações:",
            erro
        );

        res.status(500).json({
            mensagem: "Erro ao consultar movimentações."
        });
    }
});

//
// AC3 — Cadastrar pedido de reposição
//
app.post("/pedidos", async (req, res) => {
    try {
        const {
            produto_id,
            quantidade,
            custo_unitario,
            forma_pagamento
        } = req.body;

        // Validar o produto
        if (!Number.isInteger(produto_id) || produto_id <= 0) {
            return res.status(400).json({
                mensagem: "Informe um produto válido."
            });
        }

        // Validar a quantidade
        if (!Number.isInteger(quantidade) || quantidade <= 0) {
            return res.status(400).json({
                mensagem: "A quantidade deve ser um número inteiro maior que zero."
            });
        }

        // Validar o custo unitário
        const custo = Number(custo_unitario);

        if (
            custo_unitario === null ||
            custo_unitario === undefined ||
            custo_unitario === "" ||
            !Number.isFinite(custo) ||
            custo <= 0 ||
            !/^\d+(\.\d{1,2})?$/.test(String(custo_unitario)) ||
            custo > 99999999.99 ||
            quantidade * custo > 9999999999.99
        ) {
            return res.status(400).json({
                mensagem: "Informe um custo unitário válido, maior que zero, com até duas casas decimais."
            });
        }

        // Formas de pagamento permitidas
        const formasPermitidas = [
            "PIX",
            "DINHEIRO",
            "CARTAO",
            "BOLETO"
        ];

        if (!formasPermitidas.includes(forma_pagamento)) {
            return res.status(400).json({
                mensagem: "Selecione uma forma de pagamento válida."
            });
        }

        // Verificar se o produto existe
        const produto = await pool.query(
            "SELECT id, nome, sku FROM produtos WHERE id = $1",
            [produto_id]
        );

        if (produto.rows.length === 0) {
            return res.status(404).json({
                mensagem: "Produto não encontrado."
            });
        }

        // Inserir o pedido.
        // O PostgreSQL calcula automaticamente valor_total.
        const resultado = await pool.query(
            `
            INSERT INTO pedidos_reposicao
                (produto_id, quantidade, custo_unitario, forma_pagamento)
            VALUES ($1, $2, $3, $4)
            RETURNING *
            `,
            [
                produto_id,
                quantidade,
                custo_unitario,
                forma_pagamento
            ]
        );

        return res.status(201).json({
            mensagem: "Pedido de reposição cadastrado com sucesso!",
            pedido: resultado.rows[0]
        });

    } catch (erro) {
        console.error("Erro ao cadastrar pedido:", erro);

        return res.status(500).json({
            mensagem: "Erro ao cadastrar pedido de reposição."
        });
    }
});

//
// AC3 — Consultar pedidos de reposição
//
app.get("/pedidos", async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT
                r.id,
                r.produto_id,
                p.nome AS produto_nome,
                p.sku AS produto_sku,
                r.quantidade,
                r.custo_unitario,
                r.valor_total,
                r.forma_pagamento,
                r.status,
                r.data_pedido
            FROM pedidos_reposicao r
            INNER JOIN produtos p
                ON r.produto_id = p.id
            ORDER BY r.data_pedido DESC, r.id DESC
        `);

        return res.status(200).json(resultado.rows);

    } catch (erro) {
        console.error("Erro ao consultar pedidos:", erro);

        return res.status(500).json({
            mensagem: "Erro ao consultar pedidos de reposição."
        });
    }
});

//
// AC3 — Atualizar status do pedido
//
app.patch("/pedidos/:id/status", async (req, res) => {
    const id = Number(req.params.id);
    const { status } = req.body || {};

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            mensagem: "ID do pedido inválido."
        });
    }

    const transicoes = {
        PENDENTE: "APROVADO",
        APROVADO: "RECEBIDO"
    };

    if (!["APROVADO", "RECEBIDO"].includes(status)) {
        return res.status(400).json({
            mensagem: "Status solicitado inválido."
        });
    }

    let cliente;

    try {
        cliente = await pool.connect();
        await cliente.query("BEGIN");

        // Bloqueia o pedido durante a atualização
        const consulta = await cliente.query(
            `
            SELECT id, produto_id, quantidade, custo_unitario, status
            FROM pedidos_reposicao
            WHERE id = $1
            FOR UPDATE
            `,
            [id]
        );

        if (consulta.rows.length === 0) {
            await cliente.query("ROLLBACK");

            return res.status(404).json({
                mensagem: "Pedido não encontrado."
            });
        }

        const pedido = consulta.rows[0];

        // Impede repetir ou pular etapas
        if (transicoes[pedido.status] !== status) {
            await cliente.query("ROLLBACK");

            return res.status(409).json({
                mensagem:
                    `Não é permitido alterar de ${pedido.status} para ${status}.`
            });
        }

        // Atualiza o status
        const resultado = await cliente.query(
            `
            UPDATE pedidos_reposicao
            SET status = $1
            WHERE id = $2
            RETURNING *
            `,
            [status, id]
        );

        // Quando recebido, atualiza estoque e histórico da AC2
        
if (status === "RECEBIDO") {

    // Bloquear o produto para calcular sobre o saldo correto
    const consultaProduto = await cliente.query(
        `
        SELECT id, estoque_atual, custo_medio_aquisicao
        FROM produtos
        WHERE id = $1
        FOR UPDATE
        `,
        [pedido.produto_id]
    );

    if (consultaProduto.rows.length === 0) {
        throw new Error("Produto associado ao pedido não encontrado.");
    }

    const produtoAtual = consultaProduto.rows[0];

    // Não presumir custo para mercadorias antigas
    if (
        Number(produtoAtual.estoque_atual) > 0 &&
        produtoAtual.custo_medio_aquisicao === null
    ) {
        await cliente.query("ROLLBACK");

        return res.status(409).json({
            mensagem:
                "Informe primeiro o custo inicial do estoque deste produto na AC1."
        });
    }

    // Calcular a média ponderada e atualizar o estoque
    await cliente.query(
        `
        UPDATE produtos
        SET
            custo_medio_aquisicao = ROUND(
                (
                    estoque_atual::numeric
                    * COALESCE(custo_medio_aquisicao, 0)
                    + $1::numeric * $2::numeric
                )
                / (estoque_atual::numeric + $1::numeric),
                4
            ),
            estoque_atual = estoque_atual + $1
        WHERE id = $3
        `,
        [
            pedido.quantidade,
            pedido.custo_unitario,
            pedido.produto_id
        ]
    );

    // Registrar a entrada no histórico da AC2
    await cliente.query(
        `
        INSERT INTO movimentacoes_estoque
            (produto_id, tipo, quantidade)
        VALUES ($1, 'ENTRADA', $2)
        `,
        [pedido.produto_id, pedido.quantidade]
    );
}

//
// AC3 — Resumo financeiro das reposições
//
app.get("/financeiro/resumo", async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT
                COUNT(*)::INTEGER AS total_pedidos,

                COUNT(*) FILTER (
                    WHERE status = 'PENDENTE'
                )::INTEGER AS pedidos_pendentes,

                COUNT(*) FILTER (
                    WHERE status = 'APROVADO'
                )::INTEGER AS pedidos_aprovados,

                COUNT(*) FILTER (
                    WHERE status = 'RECEBIDO'
                )::INTEGER AS pedidos_recebidos,

                COALESCE(SUM(valor_total), 0)
                    AS valor_total_pedidos,

                COALESCE(SUM(valor_total) FILTER (
                    WHERE status = 'PENDENTE'
                ), 0) AS valor_pendente,

                COALESCE(SUM(valor_total) FILTER (
                    WHERE status = 'APROVADO'
                ), 0) AS valor_aprovado,

                COALESCE(SUM(valor_total) FILTER (
                    WHERE status = 'RECEBIDO'
                ), 0) AS valor_recebido

            FROM pedidos_reposicao
        `);

        return res.status(200).json(resultado.rows[0]);

    } catch (erro) {
        console.error("Erro ao consultar financeiro:", erro);

        return res.status(500).json({
            mensagem: "Erro ao consultar resumo financeiro."
        });
    }
});


//
// Integração financeira — Definir custo inicial do produto
//
app.patch("/produtos/:id/custo-inicial", async (req, res) => {
    const id = Number(req.params.id);
    const custo = req.body?.custo_medio_aquisicao;

    if (
        !Number.isSafeInteger(id) ||
        id <= 0 ||
        !custoMedioValido(custo)
    ) {
        return res.status(400).json({
            mensagem: "Informe um ID e custo de aquisição válidos (até 4 casas decimais)."
        });
    }

    try {
        const resultado = await pool.query(
            `
            UPDATE produtos
            SET custo_medio_aquisicao = $1
            WHERE id = $2
              AND custo_medio_aquisicao IS NULL
            RETURNING id, nome, sku, preco,
                      estoque_atual, custo_medio_aquisicao
            `,
            [String(custo), id]
        );

        if (resultado.rows.length === 0) {
            const existente = await pool.query(
                "SELECT id FROM produtos WHERE id = $1",
                [id]
            );

            return res.status(
                existente.rows.length === 0 ? 404 : 409
            ).json({
                mensagem: existente.rows.length === 0
                    ? "Produto não encontrado."
                    : "Este produto já possui um custo inicial registrado."
            });
        }

        return res.status(200).json({
            mensagem: "Custo inicial registrado com sucesso!",
            produto: resultado.rows[0]
        });

    } catch (erro) {
        console.error("Erro ao registrar custo inicial:", erro);

        return res.status(500).json({
            mensagem: "Erro ao registrar custo inicial."
        });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});