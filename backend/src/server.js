
const express = require("express");
const cors = require("cors");
const pool = require("./database");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ============================================
// FUNCOES DE VALIDACAO
// ============================================

const inteiroPositivo = (valor) =>
    Number.isSafeInteger(valor) &&
    valor > 0 &&
    valor <= 2147483647;

const inteiroNaoNegativo = (valor) =>
    Number.isSafeInteger(valor) &&
    valor >= 0 &&
    valor <= 2147483647;

function valorMonetarioValido(valor) {
    if (
        typeof valor !== "string" &&
        typeof valor !== "number"
    ) {
        return false;
    }

    return /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(
        String(valor)
    ) && Number(valor) > 0;
}

function custoMedioValido(valor) {
    if (
        typeof valor !== "string" &&
        typeof valor !== "number"
    ) {
        return false;
    }

    return /^(?:0|[1-9]\d{0,7})(?:\.\d{1,4})?$/.test(
        String(valor)
    ) && Number(valor) > 0;
}

// ============================================
// ROTA INICIAL
// ============================================

app.get("/", (req, res) => {
    res.send("MercadoLog API funcionando!");
});

// ============================================
// AC1 - CONSULTAR PRODUTOS
// ============================================

app.get("/produtos", async (req, res) => {
    try {
        const resultado = await pool.query(
            "SELECT * FROM produtos ORDER BY id"
        );

        return res.status(200).json(resultado.rows);

    } catch (erro) {
        console.error("Erro ao consultar produtos:", erro);

        return res.status(500).json({
            mensagem: "Erro ao buscar produtos."
        });
    }
});

// ============================================
// AC1 - CADASTRAR PRODUTO
// ============================================

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
        } = req.body || {};

        // Validar campos obrigatorios
        if (
            typeof nome !== "string" || !nome.trim() ||
            typeof sku !== "string" || !sku.trim() ||
            typeof categoria !== "string" || !categoria.trim()
        ) {
            return res.status(400).json({
                mensagem:
                    "Nome, SKU e categoria são obrigatórios."
            });
        }

        // Validar preco de venda
        if (!valorMonetarioValido(preco)) {
            return res.status(400).json({
                mensagem:
                    "O preço deve ser positivo e ter até 2 casas decimais."
            });
        }

        // Validar estoque
        if (
            !inteiroNaoNegativo(estoque_inicial) ||
            !inteiroNaoNegativo(estoque_minimo)
        ) {
            return res.status(400).json({
                mensagem:
                    "Os estoques devem ser números inteiros não negativos."
            });
        }

        // Custo inicial opcional
        const custoInformado =
            custo_medio_aquisicao !== undefined &&
            custo_medio_aquisicao !== null &&
            custo_medio_aquisicao !== "";

        if (
            custoInformado &&
            !custoMedioValido(custo_medio_aquisicao)
        ) {
            return res.status(400).json({
                mensagem:
                    "Custo de aquisição inválido: use valor positivo com até 4 casas decimais."
            });
        }

        // Inserir produto no PostgreSQL
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
                nome.trim(),
                sku.trim(),
                categoria.trim(),
                String(preco),
                estoque_inicial,
                estoque_minimo,
                estoque_inicial,
                custoInformado
                    ? String(custo_medio_aquisicao)
                    : null
            ]
        );

        return res.status(201).json({
            mensagem: "Produto cadastrado com sucesso!",
            produto: resultado.rows[0]
        });

    } catch (erro) {
        console.error("Erro ao cadastrar produto:", erro);

        if (erro.code === "23505") {
            return res.status(400).json({
                mensagem:
                    "Já existe um produto com esse SKU."
            });
        }

        return res.status(500).json({
            mensagem: "Erro ao cadastrar produto."
        });
    }
});

// ============================================
// INTEGRACAO FINANCEIRA
// DEFINIR CUSTO INICIAL DE PRODUTO ANTIGO
// ============================================

app.patch(
    "/produtos/:id/custo-inicial",
    async (req, res) => {

        const id = Number(req.params.id);
        const custo = req.body?.custo_medio_aquisicao;

        if (
            !inteiroPositivo(id) ||
            !custoMedioValido(custo)
        ) {
            return res.status(400).json({
                mensagem:
                    "Informe um produto válido e custo positivo com até 4 casas decimais."
            });
        }

        try {
            const resultado = await pool.query(
                `
                UPDATE produtos
                SET custo_medio_aquisicao = $1
                WHERE id = $2
                  AND custo_medio_aquisicao IS NULL
                RETURNING
                    id,
                    nome,
                    sku,
                    preco,
                    estoque_atual,
                    custo_medio_aquisicao
                `,
                [String(custo), id]
            );

            if (resultado.rows.length === 0) {
                const existe = await pool.query(
                    "SELECT id FROM produtos WHERE id = $1",
                    [id]
                );

                return res.status(
                    existe.rows.length === 0 ? 404 : 409
                ).json({
                    mensagem:
                        existe.rows.length === 0
                            ? "Produto não encontrado."
                            : "O custo inicial deste produto já foi registrado."
                });
            }

            return res.status(200).json({
                mensagem:
                    "Custo inicial registrado com sucesso!",
                produto: resultado.rows[0]
            });

        } catch (erro) {
            console.error(
                "Erro ao registrar custo inicial:",
                erro
            );

            return res.status(500).json({
                mensagem:
                    "Erro ao registrar custo inicial."
            });
        }
    }
);

// ============================================
// AC2 - REGISTRAR ENTRADA DE ESTOQUE
// ============================================

app.post("/movimentacoes", async (req, res) => {
    const {
        produto_id,
        quantidade
    } = req.body || {};

    if (
        !inteiroPositivo(produto_id) ||
        !inteiroPositivo(quantidade)
    ) {
        return res.status(400).json({
            mensagem:
                "Informe um produto válido e uma quantidade inteira maior que zero."
        });
    }

    let cliente;

    try {
        cliente = await pool.connect();

        await cliente.query("BEGIN");

        // Atualizar quantidade em estoque
        const produto = await cliente.query(
            `
            UPDATE produtos
            SET estoque_atual = estoque_atual + $1
            WHERE id = $2
            RETURNING
                id,
                nome,
                sku,
                estoque_atual
            `,
            [quantidade, produto_id]
        );

        if (produto.rows.length === 0) {
            await cliente.query("ROLLBACK");

            return res.status(404).json({
                mensagem: "Produto não encontrado."
            });
        }

        // Registrar entrada no historico
        const movimentacao = await cliente.query(
            `
            INSERT INTO movimentacoes_estoque
                (produto_id, tipo, quantidade)
            VALUES ($1, 'ENTRADA', $2)
            RETURNING *
            `,
            [produto_id, quantidade]
        );

        await cliente.query("COMMIT");

        return res.status(201).json({
            mensagem:
                "Entrada de estoque registrada com sucesso!",
            produto: produto.rows[0],
            movimentacao: movimentacao.rows[0]
        });

    } catch (erro) {
        if (cliente) {
            try {
                await cliente.query("ROLLBACK");
            } catch (erroRollback) {
                console.error(erroRollback);
            }
        }

        console.error(
            "Erro ao registrar entrada:",
            erro
        );

        return res.status(500).json({
            mensagem:
                "Erro ao registrar entrada de estoque."
        });

    } finally {
        if (cliente) {
            cliente.release();
        }
    }
});

// ============================================
// AC2 - HISTORICO DE MOVIMENTACOES
// ============================================

app.get("/movimentacoes", async (req, res) => {
    try {
        const resultado = await pool.query(
            `
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
                ON p.id = m.produto_id
            ORDER BY
                m.data_movimentacao DESC,
                m.id DESC
            `
        );

        return res.status(200).json(resultado.rows);

    } catch (erro) {
        console.error(
            "Erro ao consultar movimentações:",
            erro
        );

        return res.status(500).json({
            mensagem:
                "Erro ao consultar movimentações."
        });
    }
});

// ============================================
// AC3 - CADASTRAR PEDIDO DE REPOSICAO
// ============================================

app.post("/pedidos", async (req, res) => {
    const {
        produto_id,
        quantidade,
        custo_unitario,
        forma_pagamento
    } = req.body || {};

    if (!inteiroPositivo(produto_id)) {
        return res.status(400).json({
            mensagem: "Informe um produto válido."
        });
    }

    if (!inteiroPositivo(quantidade)) {
        return res.status(400).json({
            mensagem:
                "A quantidade deve ser inteira e maior que zero."
        });
    }

    if (
        !valorMonetarioValido(custo_unitario) ||
        Number(quantidade) * Number(custo_unitario) >
            9999999999.99
    ) {
        return res.status(400).json({
            mensagem:
                "Custo unitário inválido ou total acima do limite permitido."
        });
    }

    if (
        ![
            "PIX",
            "DINHEIRO",
            "CARTAO",
            "BOLETO"
        ].includes(forma_pagamento)
    ) {
        return res.status(400).json({
            mensagem:
                "Selecione uma forma de pagamento válida."
        });
    }

    try {
        // Verificar se produto existe
        const produto = await pool.query(
            "SELECT id FROM produtos WHERE id = $1",
            [produto_id]
        );

        if (produto.rows.length === 0) {
            return res.status(404).json({
                mensagem: "Produto não encontrado."
            });
        }

        // Criar pedido de reposicao
        const resultado = await pool.query(
            `
            INSERT INTO pedidos_reposicao
                (
                    produto_id,
                    quantidade,
                    custo_unitario,
                    forma_pagamento
                )
            VALUES ($1, $2, $3, $4)
            RETURNING *
            `,
            [
                produto_id,
                quantidade,
                String(custo_unitario),
                forma_pagamento
            ]
        );

        return res.status(201).json({
            mensagem:
                "Pedido de reposição cadastrado com sucesso!",
            pedido: resultado.rows[0]
        });

    } catch (erro) {
        console.error(
            "Erro ao cadastrar pedido:",
            erro
        );

        return res.status(500).json({
            mensagem:
                "Erro ao cadastrar pedido de reposição."
        });
    }
});

// ============================================
// AC3 - CONSULTAR PEDIDOS
// ============================================

app.get("/pedidos", async (req, res) => {
    try {
        const resultado = await pool.query(
            `
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
            ORDER BY
                r.data_pedido DESC,
                r.id DESC
            `
        );

        return res.status(200).json(resultado.rows);

    } catch (erro) {
        console.error(
            "Erro ao consultar pedidos:",
            erro
        );

        return res.status(500).json({
            mensagem:
                "Erro ao consultar pedidos de reposição."
        });
    }
});

// ============================================
// AC3 - ATUALIZAR STATUS DO PEDIDO
// E CALCULAR CUSTO MEDIO PONDERADO
// ============================================

app.patch(
    "/pedidos/:id/status",
    async (req, res) => {

        const id = Number(req.params.id);
        const status = req.body?.status;

        if (!inteiroPositivo(id)) {
            return res.status(400).json({
                mensagem: "ID do pedido inválido."
            });
        }

        if (
            !["APROVADO", "RECEBIDO"].includes(status)
        ) {
            return res.status(400).json({
                mensagem: "Status solicitado inválido."
            });
        }

        let cliente;

        try {
            cliente = await pool.connect();

            await cliente.query("BEGIN");

            // Bloquear pedido durante atualizacao
            const consultaPedido = await cliente.query(
                `
                SELECT
                    id,
                    produto_id,
                    quantidade,
                    custo_unitario,
                    status
                FROM pedidos_reposicao
                WHERE id = $1
                FOR UPDATE
                `,
                [id]
            );

            if (consultaPedido.rows.length === 0) {
                await cliente.query("ROLLBACK");

                return res.status(404).json({
                    mensagem: "Pedido não encontrado."
                });
            }

            const pedido = consultaPedido.rows[0];

            // Fluxo permitido:
            // PENDENTE -> APROVADO -> RECEBIDO
            const proximoStatus = {
                PENDENTE: "APROVADO",
                APROVADO: "RECEBIDO"
            }[pedido.status];

            if (proximoStatus !== status) {
                await cliente.query("ROLLBACK");

                return res.status(409).json({
                    mensagem:
                        `Não é permitido alterar de ${pedido.status} para ${status}.`
                });
            }

            // =================================
            // RECEBIMENTO DE MERCADORIA
            // =================================

            if (status === "RECEBIDO") {

                // Consultar e bloquear o produto
                const consultaProduto =
                    await cliente.query(
                        `
                        SELECT
                            id,
                            estoque_atual,
                            custo_medio_aquisicao
                        FROM produtos
                        WHERE id = $1
                        FOR UPDATE
                        `,
                        [pedido.produto_id]
                    );

                if (
                    consultaProduto.rows.length === 0
                ) {
                    await cliente.query("ROLLBACK");

                    return res.status(404).json({
                        mensagem:
                            "Produto vinculado ao pedido não encontrado."
                    });
                }

                const produto =
                    consultaProduto.rows[0];

                // Exigir custo inicial quando
                // existe estoque antigo sem custo
                if (
                    Number(produto.estoque_atual) > 0 &&
                    produto.custo_medio_aquisicao === null
                ) {
                    await cliente.query("ROLLBACK");

                    return res.status(409).json({
                        mensagem:
                            "Defina o custo inicial do estoque deste produto antes do recebimento."
                    });
                }

                // Calcular media ponderada
                // usando NUMERIC do PostgreSQL
                await cliente.query(
                    `
                    UPDATE produtos
                    SET
                        custo_medio_aquisicao = ROUND(
                            (
                                estoque_atual::numeric
                                * COALESCE(
                                    custo_medio_aquisicao,
                                    0
                                )
                                + $1::numeric
                                * $2::numeric
                            )
                            /
                            (
                                estoque_atual::numeric
                                + $1::numeric
                            ),
                            4
                        ),
                        estoque_atual =
                            estoque_atual + $1
                    WHERE id = $3
                    `,
                    [
                        pedido.quantidade,
                        pedido.custo_unitario,
                        pedido.produto_id
                    ]
                );

                // Registrar entrada na AC2
                await cliente.query(
                    `
                    INSERT INTO movimentacoes_estoque
                        (
                            produto_id,
                            tipo,
                            quantidade
                        )
                    VALUES ($1, 'ENTRADA', $2)
                    `,
                    [
                        pedido.produto_id,
                        pedido.quantidade
                    ]
                );
            }

            // Atualizar status do pedido
            const resultado = await cliente.query(
                `
                UPDATE pedidos_reposicao
                SET status = $1
                WHERE id = $2
                RETURNING *
                `,
                [status, id]
            );

            await cliente.query("COMMIT");

            return res.status(200).json({
                mensagem:
                    status === "RECEBIDO"
                        ? "Pedido recebido, estoque e custo médio atualizados!"
                        : "Pedido aprovado com sucesso!",
                pedido: resultado.rows[0]
            });

        } catch (erro) {
            if (cliente) {
                try {
                    await cliente.query("ROLLBACK");
                } catch (erroRollback) {
                    console.error(erroRollback);
                }
            }

            console.error(
                "Erro ao atualizar pedido:",
                erro
            );

            return res.status(500).json({
                mensagem:
                    "Erro ao atualizar status do pedido."
            });

        } finally {
            if (cliente) {
                cliente.release();
            }
        }
    }
);

// ============================================
// AC3 - RESUMO FINANCEIRO
// ============================================

app.get(
    "/financeiro/resumo",
    async (req, res) => {

        try {
            const resultado = await pool.query(
                `
                SELECT
                    COUNT(*)::integer
                        AS total_pedidos,

                    COUNT(*) FILTER (
                        WHERE status = 'PENDENTE'
                    )::integer
                        AS pedidos_pendentes,

                    COUNT(*) FILTER (
                        WHERE status = 'APROVADO'
                    )::integer
                        AS pedidos_aprovados,

                    COUNT(*) FILTER (
                        WHERE status = 'RECEBIDO'
                    )::integer
                        AS pedidos_recebidos,

                    COALESCE(
                        SUM(valor_total),
                        0
                    ) AS valor_total_pedidos,

                    COALESCE(
                        SUM(valor_total) FILTER (
                            WHERE status = 'PENDENTE'
                        ),
                        0
                    ) AS valor_pendente,

                    COALESCE(
                        SUM(valor_total) FILTER (
                            WHERE status = 'APROVADO'
                        ),
                        0
                    ) AS valor_aprovado,

                    COALESCE(
                        SUM(valor_total) FILTER (
                            WHERE status = 'RECEBIDO'
                        ),
                        0
                    ) AS valor_recebido

                FROM pedidos_reposicao
                `
            );

            return res.status(200).json(
                resultado.rows[0]
            );

        } catch (erro) {
            console.error(
                "Erro ao consultar financeiro:",
                erro
            );

            return res.status(500).json({
                mensagem:
                    "Erro ao consultar resumo financeiro."
            });
        }
    }
);

// ============================================
// INICIAR SERVIDOR
// ============================================

app.listen(PORT, () => {
    console.log(
        `Servidor rodando em http://localhost:${PORT}`
    );
});

//
// Extra — PEDIDOS DE CLIENTES E VENDAS
//

// Cadastrar um pedido com vários produtos
app.post("/pedidos-clientes", async (req, res) => {
    const { cliente_nome, itens } = req.body || {};

    if (
        typeof cliente_nome !== "string" ||
        cliente_nome.trim().length < 2 ||
        cliente_nome.trim().length > 120
    ) {
        return res.status(400).json({
            mensagem: "Informe um nome de cliente com 2 a 120 caracteres."
        });
    }

    if (!Array.isArray(itens) || itens.length < 1 || itens.length > 50) {
        return res.status(400).json({
            mensagem: "Informe de 1 a 50 produtos no pedido."
        });
    }

    const ids = new Set();

    for (const item of itens) {
        if (
            !item ||
            !inteiroPositivo(item.produto_id) ||
            !inteiroPositivo(item.quantidade)
        ) {
            return res.status(400).json({
                mensagem: "Cada item precisa de um produto e uma quantidade inteira positiva."
            });
        }

        if (ids.has(item.produto_id)) {
            return res.status(400).json({
                mensagem: "Não repita o mesmo produto; aumente a quantidade no item existente."
            });
        }

        ids.add(item.produto_id);
    }

    let cliente;

    try {
        cliente = await pool.connect();
        await cliente.query("BEGIN");

        // Conferir produtos e preservar seus preços durante o cadastro
        const encontrados = await cliente.query(
            `
            SELECT id, preco
            FROM produtos
            WHERE id = ANY($1::integer[])
            ORDER BY id
            FOR SHARE
            `,
            [[...ids].sort((a, b) => a - b)]
        );

        if (encontrados.rows.length !== ids.size) {
            await cliente.query("ROLLBACK");

            return res.status(404).json({
                mensagem: "Um ou mais produtos não foram encontrados."
            });
        }

        if (
            encontrados.rows.some(
                (produto) =>
                    !Number.isFinite(Number(produto.preco)) ||
                    Number(produto.preco) <= 0 ||
                    Number(produto.preco) > 99999999.99
            )
        ) {
            await cliente.query("ROLLBACK");

            return res.status(409).json({
                mensagem: "Um dos produtos não possui preço de venda válido."
            });
        }

        // Criar o cabeçalho do pedido
        const pedido = await cliente.query(
            `
            INSERT INTO pedidos_clientes (cliente_nome)
            VALUES ($1)
            RETURNING id
            `,
            [cliente_nome.trim()]
        );

        const pedidoId = pedido.rows[0].id;

        // Copiar o preço de venda da AC1 para cada item
        for (const item of itens) {
            await cliente.query(
                `
                INSERT INTO itens_pedidos_clientes
                    (pedido_id, produto_id, quantidade, preco_unitario)
                SELECT $1, p.id, $2, p.preco
                FROM produtos p
                WHERE p.id = $3
                `,
                [
                    pedidoId,
                    item.quantidade,
                    item.produto_id
                ]
            );
        }

        // Calcular total no PostgreSQL
        const resultado = await cliente.query(
            `
            UPDATE pedidos_clientes
            SET valor_total = (
                SELECT COALESCE(SUM(subtotal), 0)
                FROM itens_pedidos_clientes
                WHERE pedido_id = $1
            )
            WHERE id = $1
            RETURNING *
            `,
            [pedidoId]
        );

        await cliente.query("COMMIT");

        return res.status(201).json({
            mensagem: "Pedido do cliente cadastrado com sucesso! Estoque ainda não alterado.",
            pedido: resultado.rows[0]
        });

    } catch (erro) {
        if (cliente) {
            try {
                await cliente.query("ROLLBACK");
            } catch (erroRollback) {
                console.error("Erro no rollback:", erroRollback);
            }
        }

        console.error("Erro ao cadastrar pedido de cliente:", erro);

        if (erro.code === "22003") {
            return res.status(400).json({
                mensagem: "Valor do pedido excede o limite permitido."
            });
        }

        return res.status(500).json({
            mensagem: "Erro ao cadastrar pedido do cliente."
        });

    } finally {
        if (cliente) cliente.release();
    }
});

//
// Extra — Consultar histórico de pedidos de clientes
//
app.get("/pedidos-clientes", async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT
                pc.id,
                pc.cliente_nome,
                pc.status,
                pc.valor_total,
                pc.criado_em,
                pc.confirmado_em,

                COALESCE(
                    JSON_AGG(
                        JSON_BUILD_OBJECT(
                            'id', i.id,
                            'produto_id', i.produto_id,
                            'produto_nome', p.nome,
                            'produto_sku', p.sku,
                            'quantidade', i.quantidade,
                            'preco_unitario', i.preco_unitario,
                            'subtotal', i.subtotal,
                            'custo_medio_confirmacao',
                            i.custo_medio_confirmacao
                        )
                        ORDER BY i.id
                    ) FILTER (WHERE i.id IS NOT NULL),
                    '[]'::json
                ) AS itens

            FROM pedidos_clientes pc

            LEFT JOIN itens_pedidos_clientes i
                ON i.pedido_id = pc.id

            LEFT JOIN produtos p
                ON p.id = i.produto_id

            GROUP BY pc.id
            ORDER BY pc.id DESC
        `);

        return res.status(200).json(resultado.rows);

    } catch (erro) {
        console.error("Erro ao consultar pedidos de clientes:", erro);

        return res.status(500).json({
            mensagem: "Erro ao consultar pedidos de clientes."
        });
    }
});

//
// Extra — Confirmar venda e descontar estoque
//
app.patch("/pedidos-clientes/:id/confirmar", async (req, res) => {
    const id = Number(req.params.id);

    if (!inteiroPositivo(id)) {
        return res.status(400).json({
            mensagem: "ID do pedido inválido."
        });
    }

    let cliente;

    try {
        cliente = await pool.connect();
        await cliente.query("BEGIN");

        // Bloquear pedido para evitar confirmação duplicada
        const consulta = await cliente.query(
            `
            SELECT id, status
            FROM pedidos_clientes
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

        if (consulta.rows[0].status !== "PENDENTE") {
            await cliente.query("ROLLBACK");

            return res.status(409).json({
                mensagem: "Apenas pedidos pendentes podem ser confirmados."
            });
        }

        // Consultar os produtos do pedido
        const itens = await cliente.query(
            `
            SELECT
                i.id,
                i.produto_id,
                i.quantidade,
                p.nome AS produto_nome
            FROM itens_pedidos_clientes i
            INNER JOIN produtos p
                ON p.id = i.produto_id
            WHERE i.pedido_id = $1
            ORDER BY i.produto_id
            `,
            [id]
        );

        if (itens.rows.length === 0) {
            await cliente.query("ROLLBACK");

            return res.status(409).json({
                mensagem: "O pedido não possui produtos."
            });
        }

        // Processar cada produto na mesma transação
        for (const item of itens.rows) {
            const atualizado = await cliente.query(
                `
                UPDATE produtos
                SET estoque_atual = estoque_atual - $1
                WHERE id = $2
                  AND estoque_atual >= $1
                RETURNING custo_medio_aquisicao
                `,
                [item.quantidade, item.produto_id]
            );

            if (atualizado.rows.length === 0) {
                await cliente.query("ROLLBACK");

                return res.status(409).json({
                    mensagem:
                        `Estoque insuficiente para ${item.produto_nome}. Nenhum item foi descontado.`
                });
            }

            // Guardar custo médio conhecido na confirmação
            await cliente.query(
                `
                UPDATE itens_pedidos_clientes
                SET custo_medio_confirmacao = $1
                WHERE id = $2
                `,
                [
                    atualizado.rows[0].custo_medio_aquisicao,
                    item.id
                ]
            );

            // Registrar saída no histórico da AC2
            await cliente.query(
                `
                INSERT INTO movimentacoes_estoque
                    (produto_id, tipo, quantidade)
                VALUES ($1, 'SAIDA', $2)
                `,
                [item.produto_id, item.quantidade]
            );
        }

        // Marcar pedido como confirmado
        const confirmado = await cliente.query(
            `
            UPDATE pedidos_clientes
            SET
                status = 'CONFIRMADO',
                confirmado_em = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
            `,
            [id]
        );

        await cliente.query("COMMIT");

        return res.status(200).json({
            mensagem: "Venda confirmada e estoque atualizado com sucesso!",
            pedido: confirmado.rows[0]
        });

    } catch (erro) {
        if (cliente) {
            try {
                await cliente.query("ROLLBACK");
            } catch (erroRollback) {
                console.error("Erro no rollback:", erroRollback);
            }
        }

        console.error("Erro ao confirmar venda:", erro);

        return res.status(500).json({
            mensagem: "Erro ao confirmar venda."
        });

    } finally {
        if (cliente) cliente.release();
    }
});

//
// Extra — Cancelar pedido pendente
//
app.patch("/pedidos-clientes/:id/cancelar", async (req, res) => {
    const id = Number(req.params.id);

    if (!inteiroPositivo(id)) {
        return res.status(400).json({
            mensagem: "ID do pedido inválido."
        });
    }

    try {
        const resultado = await pool.query(
            `
            UPDATE pedidos_clientes
            SET status = 'CANCELADO'
            WHERE id = $1
              AND status = 'PENDENTE'
            RETURNING *
            `,
            [id]
        );

        if (resultado.rows.length === 0) {
            const existe = await pool.query(
                "SELECT status FROM pedidos_clientes WHERE id = $1",
                [id]
            );

            return res.status(
                existe.rows.length === 0 ? 404 : 409
            ).json({
                mensagem:
                    existe.rows.length === 0
                        ? "Pedido não encontrado."
                        : "Apenas pedidos pendentes podem ser cancelados."
            });
        }

        return res.status(200).json({
            mensagem: "Pedido cancelado sem alteração do estoque.",
            pedido: resultado.rows[0]
        });

    } catch (erro) {
        console.error("Erro ao cancelar pedido:", erro);

        return res.status(500).json({
            mensagem: "Erro ao cancelar pedido."
        });
    }
});

//
// Extra — Resumo financeiro de vendas
//
app.get("/vendas/resumo", async (req, res) => {
    try {
        const resultado = await pool.query(`
            WITH vendas AS (
                SELECT
                    COUNT(*)::integer AS total_pedidos,

                    COUNT(*) FILTER (
                        WHERE status = 'PENDENTE'
                    )::integer AS pedidos_pendentes,

                    COUNT(*) FILTER (
                        WHERE status = 'CONFIRMADO'
                    )::integer AS pedidos_confirmados,

                    COUNT(*) FILTER (
                        WHERE status = 'CANCELADO'
                    )::integer AS pedidos_cancelados,

                    COALESCE(
                        SUM(valor_total) FILTER (
                            WHERE status = 'CONFIRMADO'
                        ),
                        0
                    ) AS faturamento_confirmado

                FROM pedidos_clientes
            ),

            custos AS (
                SELECT
                    COUNT(*) FILTER (
                        WHERE pc.status = 'CONFIRMADO'
                          AND i.custo_medio_confirmacao IS NULL
                    )::integer AS itens_sem_custo,

                    COALESCE(
                        SUM(i.subtotal) FILTER (
                            WHERE pc.status = 'CONFIRMADO'
                              AND i.custo_medio_confirmacao IS NOT NULL
                        ),
                        0
                    ) AS receita_com_custo_conhecido,

                    COALESCE(
                        SUM(
                            i.quantidade * i.custo_medio_confirmacao
                        ) FILTER (
                            WHERE pc.status = 'CONFIRMADO'
                        ),
                        0
                    ) AS custo_estimado_conhecido

                FROM itens_pedidos_clientes i

                JOIN pedidos_clientes pc
                    ON pc.id = i.pedido_id
            )

            SELECT
                v.*,
                c.itens_sem_custo,
                c.receita_com_custo_conhecido,
                c.custo_estimado_conhecido,

                (
                    c.receita_com_custo_conhecido
                    - c.custo_estimado_conhecido
                ) AS margem_bruta_estimada_parcial

            FROM vendas v
            CROSS JOIN custos c
        `);

        return res.status(200).json(resultado.rows[0]);

    } catch (erro) {
        console.error("Erro ao consultar resumo de vendas:", erro);

        return res.status(500).json({
            mensagem: "Erro ao consultar resumo de vendas."
        });
    }
});
