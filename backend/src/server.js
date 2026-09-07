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

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});