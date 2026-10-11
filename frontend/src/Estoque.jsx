
import { useCallback, useEffect, useState } from "react";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000";

function Estoque() {
  const [produtos, setProdutos] = useState([]);
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);

  const carregarDados = useCallback(async () => {
    try {
      setErro("");

      const [resProdutos, resMovimentacoes] = await Promise.all([
        fetch(`${API_URL}/produtos`),
        fetch(`${API_URL}/movimentacoes`)
      ]);

      if (!resProdutos.ok || !resMovimentacoes.ok) {
        throw new Error("Erro ao buscar dados do servidor.");
      }

      const [dadosProdutos, dadosMovimentacoes] =
        await Promise.all([
          resProdutos.json(),
          resMovimentacoes.json()
        ]);

      setProdutos(dadosProdutos);
      setMovimentacoes(dadosMovimentacoes);
    } catch (erroConsulta) {
      console.error(erroConsulta);
      setErro("Não foi possível carregar os dados do estoque.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const produtoSelecionado = produtos.find(
    (produto) => produto.id === Number(produtoId)
  );

  const registrarEntrada = async (evento) => {
    evento.preventDefault();
    setMensagem("");

    const quantidadeNumero = Number(quantidade);

    if (
      !produtoId ||
      !Number.isInteger(quantidadeNumero) ||
      quantidadeNumero <= 0
    ) {
      setMensagem("Informe um produto e uma quantidade inteira maior que zero.");
      return;
    }

    setEnviando(true);

    try {
      const resposta = await fetch(`${API_URL}/movimentacoes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          produto_id: Number(produtoId),
          quantidade: quantidadeNumero
        })
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        setMensagem(dados.mensagem || "Erro ao registrar entrada.");
        return;
      }

      setMensagem("Entrada de estoque registrada com sucesso!");
      setQuantidade("");

      await carregarDados();
    } catch (erroEnvio) {
      console.error(erroEnvio);
      setMensagem("Não foi possível conectar ao servidor.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="estoque-area">
      <h2>Controle de Estoque — AC2</h2>

      <p>
        Registre a chegada de mercadorias e consulte
        o histórico de movimentações.
      </p>

      <div className="estoque-painel">
        <h3>Nova entrada de estoque</h3>

        <form onSubmit={registrarEntrada}>
          <label htmlFor="produto_entrada">Produto</label>

          <select
            id="produto_entrada"
            value={produtoId}
            onChange={(evento) => setProdutoId(evento.target.value)}
            required
          >
            <option value="">Selecione um produto</option>

            {produtos.map((produto) => (
              <option key={produto.id} value={produto.id}>
                {produto.nome} — {produto.sku}
              </option>
            ))}
          </select>

          {produtoSelecionado && (
            <p className="estoque-saldo">
              Estoque atual:{" "}
              <strong>{produtoSelecionado.estoque_atual}</strong>{" "}
              unidades
            </p>
          )}

          <label htmlFor="quantidade_entrada">
            Quantidade recebida
          </label>

          <input
            id="quantidade_entrada"
            type="number"
            min="1"
            step="1"
            value={quantidade}
            onChange={(evento) => setQuantidade(evento.target.value)}
            placeholder="Ex.: 15"
            required
          />

          <button type="submit" disabled={enviando || carregando}>
            {enviando ? "Registrando..." : "Registrar entrada"}
          </button>
        </form>

        {mensagem && <p className="mensagem">{mensagem}</p>}
      </div>

      <div className="estoque-painel">
        <h3>Histórico de movimentações</h3>

        {carregando ? (
          <p>Carregando movimentações...</p>
        ) : erro ? (
          <p>{erro}</p>
        ) : movimentacoes.length === 0 ? (
          <p>Nenhuma movimentação registrada.</p>
        ) : (
          <div className="tabela-container">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Produto</th>
                  <th>SKU</th>
                  <th>Tipo</th>
                  <th>Quantidade</th>
                  <th>Data</th>
                </tr>
              </thead>

              <tbody>
                {movimentacoes.map((movimentacao) => (
                  <tr key={movimentacao.id}>
                    <td>{movimentacao.id}</td>
                    <td>{movimentacao.produto_nome}</td>
                    <td>{movimentacao.produto_sku}</td>
                    <td>{movimentacao.tipo}</td>
                    <td>
                      {movimentacao.tipo === "ENTRADA" ? "+" : "-"}
                      {movimentacao.quantidade}
                    </td>
                    <td>
                      {new Date(
                        movimentacao.data_movimentacao
                      ).toLocaleString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button
          type="button"
          className="botao-secundario"
          onClick={carregarDados}
        >
          Atualizar histórico
        </button>
      </div>
    </section>
  );
}

export default Estoque;
