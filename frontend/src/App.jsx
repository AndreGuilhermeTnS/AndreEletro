import { useCallback, useEffect, useState } from "react";
import Estoque from "./Estoque";
import Pedidos from "./Pedidos";
import Vendas from "./Vendas";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const formularioVazio = {
  nome: "",
  sku: "",
  categoria: "",
  preco: "",
  estoque_inicial: "",
  estoque_minimo: "",
  custo_medio_aquisicao: ""
};

const moeda = (valor) =>
  Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

const custoValido = (valor) =>
  valor !== "" && valor !== null && valor !== undefined &&
  Number.isFinite(Number(valor)) && Number(valor) > 0;

function sugerirPreco(custo, margem) {
  const valor = Number(custo);
  const percentual = Number(margem);

  if (!custoValido(custo) || !Number.isFinite(percentual) ||
      percentual < 0 || percentual >= 100) {
    return null;
  }

  // Margem sobre a venda, arredondada para cima ao centavo.
  const sugerido = Math.ceil((valor / (1 - percentual / 100) - 1e-9) * 100) / 100;
  return sugerido > 0 && sugerido <= 99999999.99 ? sugerido : null;
}

function App() {
  const [telaAtual, setTelaAtual] = useState("produtos");
  const [formulario, setFormulario] = useState({ ...formularioVazio });
  const [produtos, setProdutos] = useState([]);
  const [mensagem, setMensagem] = useState("");
  const [erroConsulta, setErroConsulta] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [margemDesejada, setMargemDesejada] = useState("30");
  const [precoEditadoManualmente, setPrecoEditadoManualmente] = useState(false);

  // Permite atribuir custo inicial aos produtos antigos, uma única vez.
  const [produtoCustoId, setProdutoCustoId] = useState("");
  const [custoReferencia, setCustoReferencia] = useState("");
  const [mensagemCusto, setMensagemCusto] = useState("");
  const [salvandoCusto, setSalvandoCusto] = useState(false);

  const carregarProdutos = useCallback(async () => {
    try {
      const resposta = await fetch(`${API_URL}/produtos`);
      if (!resposta.ok) throw new Error("Erro ao consultar produtos.");
      setProdutos(await resposta.json());
      setErroConsulta("");
    } catch (erro) {
      console.error(erro);
      setErroConsulta("Não foi possível carregar os produtos.");
    }
  }, []);

  useEffect(() => {
    carregarProdutos();
  }, [carregarProdutos]);

  const precoSugerido = sugerirPreco(formulario.custo_medio_aquisicao, margemDesejada);
  const semCustoInicial = produtos.filter((produto) =>
    produto.custo_medio_aquisicao === null ||
    produto.custo_medio_aquisicao === undefined
  );

  const atualizarCampo = (evento) => {
    const { name, value } = evento.target;

    if (name === "preco") {
      setPrecoEditadoManualmente(true);
      setFormulario((anterior) => ({ ...anterior, preco: value }));
      return;
    }

    setFormulario((anterior) => {
      const atualizado = { ...anterior, [name]: value };
      if (name === "custo_medio_aquisicao" && !precoEditadoManualmente) {
        const sugestao = sugerirPreco(value, margemDesejada);
        atualizado.preco = sugestao === null ? "" : sugestao.toFixed(2);
      }
      return atualizado;
    });
  };

  const mudarMargem = (evento) => {
    const novaMargem = evento.target.value;
    setMargemDesejada(novaMargem);
    if (!precoEditadoManualmente) {
      const sugestao = sugerirPreco(formulario.custo_medio_aquisicao, novaMargem);
      setFormulario((anterior) => ({
        ...anterior,
        preco: sugestao === null ? "" : sugestao.toFixed(2)
      }));
    }
  };

  const aplicarPrecoSugerido = () => {
    if (precoSugerido === null) return;
    setFormulario((anterior) => ({
      ...anterior,
      preco: precoSugerido.toFixed(2)
    }));
    setPrecoEditadoManualmente(false);
  };

  const cadastrarProduto = async (evento) => {
    evento.preventDefault();
    setMensagem("");
    setSalvando(true);

    try {
      const resposta = await fetch(`${API_URL}/produtos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: formulario.nome,
          sku: formulario.sku,
          categoria: formulario.categoria,
          preco: Number(formulario.preco),
          estoque_inicial: Number(formulario.estoque_inicial),
          estoque_minimo: Number(formulario.estoque_minimo),
          custo_medio_aquisicao: formulario.custo_medio_aquisicao === ""
            ? null
            : formulario.custo_medio_aquisicao
        })
      });

      const dados = await resposta.json();
      if (!resposta.ok) {
        setMensagem(dados.mensagem || "Não foi possível cadastrar o produto.");
        return;
      }

      setFormulario({ ...formularioVazio });
      setPrecoEditadoManualmente(false);
      setMensagem("Produto cadastrado com sucesso!");
      await carregarProdutos();
    } catch (erro) {
      console.error(erro);
      setMensagem("Não foi possível conectar ao servidor.");
    } finally {
      setSalvando(false);
    }
  };

  const registrarCustoInicial = async (evento) => {
    evento.preventDefault();
    setMensagemCusto("");

    if (!produtoCustoId ||
        !/^(?:0|[1-9]\d{0,7})(?:\.\d{1,4})?$/.test(custoReferencia) ||
        Number(custoReferencia) <= 0) {
      setMensagemCusto("Selecione um produto e informe custo positivo com até 4 casas decimais.");
      return;
    }

    setSalvandoCusto(true);
    try {
      const resposta = await fetch(
        `${API_URL}/produtos/${produtoCustoId}/custo-inicial`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ custo_medio_aquisicao: custoReferencia })
        }
      );
      const dados = await resposta.json();
      if (!resposta.ok) {
        setMensagemCusto(dados.mensagem || "Não foi possível registrar o custo.");
        return;
      }
      setMensagemCusto("Custo de referência registrado com sucesso!");
      setProdutoCustoId("");
      setCustoReferencia("");
      await carregarProdutos();
    } catch (erro) {
      console.error(erro);
      setMensagemCusto("Não foi possível conectar ao servidor.");
    } finally {
      setSalvandoCusto(false);
    }
  };

  const mudarTela = (novaTela) => {
    setTelaAtual(novaTela);
    setMensagem("");
    if (novaTela === "produtos") carregarProdutos();
  };

  return (
    <div className="container">
      <div className="card">
        <h1>MercadoLog</h1>
        <p className="subtitulo">Sistema de Gestão de Produtos e Estoque</p>

        <nav className="menu-principal">
          <button type="button"
            className={telaAtual === "produtos" ? "ativo" : ""}
            onClick={() => mudarTela("produtos")}>
            Cadastro de Produtos
          </button>
          <button type="button"
            className={telaAtual === "estoque" ? "ativo" : ""}
            onClick={() => mudarTela("estoque")}>
            Controle de Estoque
          </button>
          <button type="button"
            className={telaAtual === "pedidos" ? "ativo" : ""}
            onClick={() => mudarTela("pedidos")}>
            Pedidos e Financeiro
          </button>
          <button type="button"
            className={telaAtual === "vendas" ? "ativo" : ""}
            onClick={() => mudarTela("vendas")}>
            Pedidos de Clientes
          </button>
        </nav>

        {telaAtual === "produtos" ? (
          <section className="area-produtos">
            <h2>Cadastro de Produto — AC1</h2>
            <p>Informe o custo de aquisição para receber uma sugestão de preço de venda.</p>

            <form onSubmit={cadastrarProduto}>
              <label htmlFor="nome">Nome do produto</label>
              <input id="nome" name="nome" value={formulario.nome}
                onChange={atualizarCampo} placeholder="Ex.: Arroz 5kg" required />

              <label htmlFor="sku">SKU</label>
              <input id="sku" name="sku" value={formulario.sku}
                onChange={atualizarCampo} placeholder="Ex.: ARR001" required />

              <label htmlFor="categoria">Categoria</label>
              <input id="categoria" name="categoria" value={formulario.categoria}
                onChange={atualizarCampo} placeholder="Ex.: Alimentos" required />

              <label htmlFor="estoque_inicial">Estoque inicial</label>
              <input id="estoque_inicial" name="estoque_inicial" type="number"
                min="0" step="1" value={formulario.estoque_inicial}
                onChange={atualizarCampo} placeholder="Ex.: 20" required />

              <label htmlFor="estoque_minimo">Estoque mínimo</label>
              <input id="estoque_minimo" name="estoque_minimo" type="number"
                min="0" step="1" value={formulario.estoque_minimo}
                onChange={atualizarCampo} placeholder="Ex.: 5" required />

              <label htmlFor="custo_medio_aquisicao">Custo inicial de aquisição por unidade (R$) — opcional</label>
              <input id="custo_medio_aquisicao" name="custo_medio_aquisicao"
                type="number" min="0.0001" step="0.0001"
                value={formulario.custo_medio_aquisicao}
                onChange={atualizarCampo} placeholder="Ex.: 7.20" />
              <small>Para estoque já existente, informe seu custo médio estimado de aquisição.</small>

              <label htmlFor="margem_desejada">Margem bruta desejada (%)</label>
              <input id="margem_desejada" type="number" min="0" max="90"
                step="1" value={margemDesejada} onChange={mudarMargem} />

              {precoSugerido !== null && (
                <div className="pedido-total">
                  <span>Preço de venda sugerido</span>
                  <strong>{moeda(precoSugerido)}</strong>
                  <button type="button" className="botao-secundario"
                    onClick={aplicarPrecoSugerido}>
                    Usar sugestão
                  </button>
                </div>
              )}

              <label htmlFor="preco">Preço de venda (R$)</label>
              <input id="preco" name="preco" type="number" min="0.01"
                step="0.01" value={formulario.preco}
                onChange={atualizarCampo} placeholder="Ex.: 12.00" required />
              <small>O preço é sugerido automaticamente quando você informa o custo, mas pode ser editado.</small>

              <button type="submit" disabled={salvando}>
                {salvando ? "Cadastrando..." : "Cadastrar produto"}
              </button>
            </form>
            {mensagem && <p className="mensagem" role="status">{mensagem}</p>}

            <div className="lista-produtos">
              <h2>Produtos cadastrados</h2>
              {erroConsulta && <p role="alert">{erroConsulta}</p>}
              {produtos.length === 0 ? (
                <p>Nenhum produto cadastrado.</p>
              ) : (
                <div className="tabela-container">
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th><th>Produto</th><th>SKU</th>
                        <th>Categoria</th><th>Preço de venda</th>
                        <th>Custo médio</th><th>Margem bruta estimada</th>
                        <th>Estoque atual</th><th>Estoque mínimo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {produtos.map((produto) => {
                        const custo = produto.custo_medio_aquisicao;
                        const venda = Number(produto.preco);
                        const margem = custoValido(custo) && venda > 0
                          ? ((venda - Number(custo)) / venda) * 100
                          : null;
                        return (
                          <tr key={produto.id}>
                            <td>{produto.id}</td>
                            <td>{produto.nome}</td>
                            <td>{produto.sku}</td>
                            <td>{produto.categoria}</td>
                            <td>{moeda(produto.preco)}</td>
                            <td>{custoValido(custo) ? moeda(custo) : "Não informado"}</td>
                            <td>{margem === null ? "—" : `${margem.toFixed(1)}%`}</td>
                            <td>{produto.estoque_atual}</td>
                            <td>{produto.estoque_minimo}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <small>Margem bruta estimada = (preço de venda − custo médio) ÷ preço de venda. Não inclui impostos nem despesas.</small>
            </div>

            <div className="estoque-painel">
              <h3>Definir custo inicial dos produtos antigos</h3>
              <p>Use esta opção para produtos cadastrados sem custo de aquisição. O valor só pode ser definido uma vez por esta tela.</p>
              {semCustoInicial.length === 0 ? (
                <p>Todos os produtos já possuem um custo inicial informado.</p>
              ) : (
                <form onSubmit={registrarCustoInicial}>
                  <label htmlFor="produto_custo">Produto sem custo</label>
                  <select id="produto_custo" value={produtoCustoId}
                    onChange={(e) => setProdutoCustoId(e.target.value)} required>
                    <option value="">Selecione um produto</option>
                    {semCustoInicial.map((produto) => (
                      <option key={produto.id} value={produto.id}>
                        {produto.nome} — {produto.sku} ({produto.estoque_atual} un.)
                      </option>
                    ))}
                  </select>
                  <label htmlFor="custo_referencia">Custo médio inicial estimado (R$)</label>
                  <input id="custo_referencia" type="number" min="0.0001"
                    step="0.0001" value={custoReferencia}
                    onChange={(e) => setCustoReferencia(e.target.value)}
                    placeholder="Ex.: 6.00" required />
                  <button type="submit" disabled={salvandoCusto}>
                    {salvandoCusto ? "Salvando..." : "Registrar custo inicial"}
                  </button>
                </form>
              )}
              {mensagemCusto && <p className="mensagem" role="status">{mensagemCusto}</p>}
            </div>
          </section>
        ) : telaAtual === "estoque" ? (
          <Estoque />
        ) : telaAtual === "pedidos" ? (
          <Pedidos />
        ) : (
          <Vendas />
        )}
      </div>
    </div>
  );
}

export default App;
