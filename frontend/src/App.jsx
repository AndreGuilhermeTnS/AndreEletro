import { useState } from "react";
import "./App.css";

function App() {
  const [formulario, setFormulario] = useState({
    nome: "",
    sku: "",
    categoria: "",
    preco: "",
    estoque_inicial: "",
    estoque_minimo: ""
  });

  const [mensagem, setMensagem] = useState("");

  const atualizarCampo = (evento) => {
    const { name, value } = evento.target;

    setFormulario({
      ...formulario,
      [name]: value
    });
  };

  const cadastrarProduto = async (evento) => {
    evento.preventDefault();

    setMensagem("");

    try {
      const resposta = await fetch("http://localhost:3000/produtos", {
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
        setMensagem(dados.mensagem || "Erro ao cadastrar produto.");
        return;
      }

      setMensagem("Produto cadastrado com sucesso!");

      setFormulario({
        nome: "",
        sku: "",
        categoria: "",
        preco: "",
        estoque_inicial: "",
        estoque_minimo: ""
      });

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

          <label>Nome do produto</label>
          <input
            name="nome"
            value={formulario.nome}
            onChange={atualizarCampo}
            placeholder="Ex.: Arroz 5kg"
          />

          <label>SKU</label>
          <input
            name="sku"
            value={formulario.sku}
            onChange={atualizarCampo}
            placeholder="Ex.: ARR001"
          />

          <label>Categoria</label>
          <input
            name="categoria"
            value={formulario.categoria}
            onChange={atualizarCampo}
            placeholder="Ex.: Alimentos"
          />

          <label>Preço</label>
          <input
            type="number"
            step="0.01"
            name="preco"
            value={formulario.preco}
            onChange={atualizarCampo}
            placeholder="Ex.: 25.90"
          />

          <label>Estoque inicial</label>
          <input
            type="number"
            name="estoque_inicial"
            value={formulario.estoque_inicial}
            onChange={atualizarCampo}
            placeholder="Ex.: 20"
          />

          <label>Estoque mínimo</label>
          <input
            type="number"
            name="estoque_minimo"
            value={formulario.estoque_minimo}
            onChange={atualizarCampo}
            placeholder="Ex.: 5"
          />

          <button type="submit">
            Cadastrar produto
          </button>

        </form>

        {mensagem && (
          <p className="mensagem">{mensagem}</p>
        )}

      </div>
    </div>
  );
}

export default App;
