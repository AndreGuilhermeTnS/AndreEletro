const express = require("express");
const cors = require("cors");
const pool = require("./database");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = 3000;

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
            estoque_minimo
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

        const resultado = await pool.query(
            `
            INSERT INTO produtos
            (nome, sku, categoria, preco, estoque_inicial, estoque_minimo)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
            `,
            [
                nome,
                sku,
                categoria,
                preco,
                estoque_inicial,
                estoque_minimo
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
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});