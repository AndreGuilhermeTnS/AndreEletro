import { useCallback, useEffect, useState } from "react";
import "./App.css";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000";

function App() {
  // Dados do formulário
  const [formulario, setFormulario] = useState({
    nome: "",
    sku: "",
    categoria: "",
    preco: "",
    estoque_inicial: "",
    estoque_minimo: ""
  });

  // Mensagem de sucesso ou erro
  const [mensagem, setMensagem] = useState("");

  // Lista de produtos cadastrados
  const [produtos, setProdutos] = useState([]);

  // Busca os produtos cadastrados no backend
  const carregarProdutos = useCallback(async () => {
    try {
      const resposta = await fetch(`${API_URL}/produtos`);

      if (!resposta.ok) {
        throw new Error("Erro ao buscar produtos.");
      }

      const dados = await resposta.json();

      setProdutos(dados);
    } catch (erro) {
      console.error("Erro ao carregar produtos:", erro);
    }
  }, []);

  // Carrega os produtos quando a página abre
  useEffect(() => {
    carregarProdutos();
  }, [carregarProdutos]);

  // Atualiza os campos enquanto o usuário digita
  const atualizarCampo = (evento) => {
    const { name, value } = evento.target;

    setFormulario({
      ...formulario,
      [name]: value
    });
  };

  // Envia o produto para o backend
  const cadastrarProduto = async (evento) => {
    evento.preventDefault();

    setMensagem("");

    try {
      const resposta = await fetch(`${API_URL}/produtos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...formulario,
          preco: Number(formulario.preco),
          estoque_inicial: Number(formulario.estoque_inicial),
          estoque_minimo: Number(formulario.estoque_minimo)
        })
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        setMensagem(
          dados.mensagem || "Erro ao cadastrar produto."
        );
        return;
      }

      setMensagem("Produto cadastrado com sucesso!");

      // Limpa o formulário
      setFormulario({
        nome: "",
        sku: "",
        categoria: "",
        preco: "",
        estoque_inicial: "",
        estoque_minimo: ""
      });

      // Atualiza a tabela de produtos
      await carregarProdutos();

    } catch (erro) {
      setMensagem("Não foi possível conectar ao servidor.");
      console.error(erro);
    }
  };

  return (
    <div className="container">
      <div className="card">

        <h1>MercadoLog</h1>
        <h2>Cadastro de Produto</h2>

        <form onSubmit={cadastrarProduto}>

          <label htmlFor="nome">Nome do produto</label>
          <input
            id="nome"
            name="nome"
            value={formulario.nome}
            onChange={atualizarCampo}
            placeholder="Ex.: Arroz 5kg"
            required
          />

          <label htmlFor="sku">SKU</label>
          <input
            id="sku"
            name="sku"
            value={formulario.sku}
            onChange={atualizarCampo}
            placeholder="Ex.: ARR001"
            required
          />

          <label htmlFor="categoria">Categoria</label>
          <input
            id="categoria"
            name="categoria"
            value={formulario.categoria}
            onChange={atualizarCampo}
            placeholder="Ex.: Alimentos"
            required
          />

          <label htmlFor="preco">Preço</label>
          <input
            id="preco"
            type="number"
            step="0.01"
            min="0.01"
            name="preco"
            value={formulario.preco}
            onChange={atualizarCampo}
            placeholder="Ex.: 25.90"
            required
          />

          <label htmlFor="estoque_inicial">
            Estoque inicial
          </label>
          <input
            id="estoque_inicial"
            type="number"
            min="0"
            name="estoque_inicial"
            value={formulario.estoque_inicial}
            onChange={atualizarCampo}
            placeholder="Ex.: 20"
            required
          />

          <label htmlFor="estoque_minimo">
            Estoque mínimo
          </label>
          <input
            id="estoque_minimo"
            type="number"
            min="0"
            name="estoque_minimo"
            value={formulario.estoque_minimo}
            onChange={atualizarCampo}
            placeholder="Ex.: 5"
            required
          />

          <button type="submit">
            Cadastrar produto
          </button>

        </form>

        {mensagem && (
          <p className="mensagem">
            {mensagem}
          </p>
        )}

        <div className="lista-produtos">
          <h2>Produtos cadastrados</h2>

          {produtos.length === 0 ? (
            <p>Nenhum produto cadastrado.</p>
          ) : (
            <div className="tabela-container">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Produto</th>
                    <th>SKU</th>
                    <th>Categoria</th>
                    <th>Preço</th>
                    <th>Estoque</th>
                    <th>Estoque mínimo</th>
                  </tr>
                </thead>

                <tbody>
                  {produtos.map((produto) => (
                    <tr key={produto.id}>
                      <td>{produto.id}</td>
                      <td>{produto.nome}</td>
                      <td>{produto.sku}</td>
                      <td>{produto.categoria}</td>
                      <td>
                        R$ {Number(produto.preco).toFixed(2)}
                      </td>
                      <td>{produto.estoque_inicial}</td>
                      <td>{produto.estoque_minimo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default App;