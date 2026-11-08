
import { useCallback, useEffect, useState } from "react";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3000";

const formatarMoeda = (valor) =>
  Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

const formatarData = (valor) =>
  new Date(valor).toLocaleString("pt-BR");

function Pedidos() {
  const [produtos, setProdutos] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [resumo, setResumo] = useState(null);

  const [formulario, setFormulario] = useState({
    produto_id: "",
    quantidade: "",
    custo_unitario: "",
    forma_pagamento: "PIX"
  });

  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [pedidoAtualizando, setPedidoAtualizando] =
    useState(null);

  // Busca produtos, pedidos e resumo financeiro
  const carregarDados = useCallback(async () => {
    try {
      setErro("");

      const respostas = await Promise.all([
        fetch(`${API_URL}/produtos`),
        fetch(`${API_URL}/pedidos`),
        fetch(`${API_URL}/financeiro/resumo`)
      ]);

      if (respostas.some((resposta) => !resposta.ok)) {
        throw new Error("Erro ao consultar o servidor.");
      }

      const [listaProdutos, listaPedidos, dadosFinanceiros] =
        await Promise.all(
          respostas.map((resposta) => resposta.json())
        );

      setProdutos(listaProdutos);
      setPedidos(listaPedidos);
      setResumo(dadosFinanceiros);

    } catch (erroConsulta) {
      console.error(erroConsulta);
      setErro("Não foi possível carregar os dados da AC3.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const atualizarCampo = (evento) => {
    const { name, value } = evento.target;

    setFormulario((anterior) => ({
      ...anterior,
      [name]: value
    }));
  };

  // Calcula somente a prévia visual do pedido
  const quantidadeNumero = Number(formulario.quantidade);
  const custoNumero = Number(formulario.custo_unitario);

  const totalPrevisto =
    formulario.quantidade !== "" &&
    formulario.custo_unitario !== "" &&
    Number.isInteger(quantidadeNumero) &&
    quantidadeNumero > 0 &&
    Number.isFinite(custoNumero) &&
    custoNumero > 0
      ? quantidadeNumero * custoNumero
      : 0;

  const cadastrarPedido = async (evento) => {
    evento.preventDefault();
    setMensagem("");
    setErro("");

    if (
      !formulario.produto_id ||
      !Number.isSafeInteger(Number(formulario.produto_id)) ||
      !Number.isSafeInteger(quantidadeNumero) ||
      quantidadeNumero <= 0 ||
      !Number.isFinite(custoNumero) ||
      custoNumero <= 0 ||
      !/^\d+(\.\d{1,2})?$/.test(
        formulario.custo_unitario
      )
    ) {
      setMensagem("Confira o produto, a quantidade e o custo.");
      return;
    }

    setSalvando(true);

    try {
      const resposta = await fetch(`${API_URL}/pedidos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          produto_id: Number(formulario.produto_id),
          quantidade: quantidadeNumero,
          custo_unitario: formulario.custo_unitario,
          forma_pagamento: formulario.forma_pagamento
        })
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        setMensagem(
          dados.mensagem || "Erro ao cadastrar pedido."
        );
        return;
      }

      setMensagem("Pedido de reposição cadastrado com sucesso!");

      setFormulario({
        produto_id: "",
        quantidade: "",
        custo_unitario: "",
        forma_pagamento: "PIX"
      });

      await carregarDados();

    } catch (erroEnvio) {
      console.error(erroEnvio);
      setMensagem("Não foi possível conectar ao servidor.");
    } finally {
      setSalvando(false);
    }
  };

  const atualizarStatus = async (pedido, novoStatus) => {
    const acao =
      novoStatus === "RECEBIDO"
        ? "confirmar o recebimento e adicionar as unidades ao estoque"
        : "aprovar este pedido";

    if (!window.confirm(`Deseja ${acao}?`)) {
      return;
    }

    setMensagem("");
    setErro("");
    setPedidoAtualizando(pedido.id);

    try {
      const resposta = await fetch(
        `${API_URL}/pedidos/${pedido.id}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            status: novoStatus
          })
        }
      );

      const dados = await resposta.json();

      if (!resposta.ok) {
        setMensagem(
          dados.mensagem || "Não foi possível atualizar o pedido."
        );
        return;
      }

      setMensagem(dados.mensagem);
      await carregarDados();

    } catch (erroAtualizacao) {
      console.error(erroAtualizacao);
      setMensagem("Erro de comunicação com o servidor.");
    } finally {
      setPedidoAtualizando(null);
    }
  };

  return (
    <section className="pedidos-area">
      <h2>Pedidos e Controle Financeiro — AC3</h2>

      <p>
        Registre pedidos de reposição e acompanhe seus custos.
      </p>

      {erro && (
        <p className="mensagem mensagem-erro">{erro}</p>
      )}

      {mensagem && (
        <p className="mensagem" role="status">
          {mensagem}
        </p>
      )}

      <div className="resumo-financeiro">
        <h3>Resumo financeiro</h3>

        {carregando && !resumo ? (
          <p>Carregando resumo...</p>
        ) : resumo ? (
          <div className="resumo-grid">
            <div className="resumo-item">
              <span>Total dos pedidos</span>
              <strong>
                {formatarMoeda(resumo.valor_total_pedidos)}
              </strong>
            </div>

            <div className="resumo-item">
              <span>Pedidos pendentes</span>
              <strong>
                {resumo.pedidos_pendentes}
              </strong>
              <small>
                {formatarMoeda(resumo.valor_pendente)}
              </small>
            </div>

            <div className="resumo-item">
              <span>Pedidos aprovados</span>
              <strong>
                {resumo.pedidos_aprovados}
              </strong>
              <small>
                {formatarMoeda(resumo.valor_aprovado)}
              </small>
            </div>

            <div className="resumo-item">
              <span>Pedidos recebidos</span>
              <strong>
                {resumo.pedidos_recebidos}
              </strong>
              <small>
                {formatarMoeda(resumo.valor_recebido)}
              </small>
            </div>
          </div>
        ) : (
          <p>Resumo indisponível.</p>
        )}

        <p className="observacao-financeira">
          Valores de pedidos de compra, não pagamentos confirmados.
        </p>
      </div>

      <div className="pedidos-painel">
        <h3>Novo pedido de reposição</h3>

        <form onSubmit={cadastrarPedido}>
          <label htmlFor="pedido_produto">Produto</label>

          <select
            id="pedido_produto"
            name="produto_id"
            value={formulario.produto_id}
            onChange={atualizarCampo}
            required
          >
            <option value="">Selecione um produto</option>

            {produtos.map((produto) => (
              <option key={produto.id} value={produto.id}>
                {produto.nome} — {produto.sku}
              </option>
            ))}
          </select>

          <label htmlFor="pedido_quantidade">Quantidade</label>
          <input
            id="pedido_quantidade"
            name="quantidade"
            type="number"
            min="1"
            step="1"
            value={formulario.quantidade}
            onChange={atualizarCampo}
            placeholder="Ex.: 10"
            required
          />

          <label htmlFor="pedido_custo">Custo unitário (R$)</label>
          <input
            id="pedido_custo"
            name="custo_unitario"
            type="number"
            min="0.01"
            step="0.01"
            value={formulario.custo_unitario}
            onChange={atualizarCampo}
            placeholder="Ex.: 20.00"
            required
          />

          <label htmlFor="pedido_pagamento">
            Forma de pagamento prevista
          </label>
          <select
            id="pedido_pagamento"
            name="forma_pagamento"
            value={formulario.forma_pagamento}
            onChange={atualizarCampo}
          >
            <option value="PIX">Pix</option>
            <option value="DINHEIRO">Dinheiro</option>
            <option value="CARTAO">Cartão</option>
            <option value="BOLETO">Boleto</option>
          </select>

          <div className="pedido-total">
            <span>Valor total previsto</span>
            <strong>{formatarMoeda(totalPrevisto)}</strong>
          </div>

          <button
            type="submit"
            disabled={salvando || carregando}
          >
            {salvando ? "Registrando..." : "Cadastrar pedido"}
          </button>
        </form>
      </div>

      <div className="pedidos-painel">
        <h3>Histórico de pedidos</h3>

        {carregando ? (
          <p>Carregando pedidos...</p>
        ) : pedidos.length === 0 ? (
          <p>Nenhum pedido cadastrado.</p>
        ) : (
          <div className="tabela-container">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Produto</th>
                  <th>Quantidade</th>
                  <th>Custo unitário</th>
                  <th>Total</th>
                  <th>Pagamento</th>
                  <th>Status</th>
                  <th>Data</th>
                  <th>Ação</th>
                </tr>
              </thead>

              <tbody>
                {pedidos.map((pedido) => (
                  <tr key={pedido.id}>
                    <td>{pedido.id}</td>
                    <td>{pedido.produto_nome}</td>
                    <td>{pedido.quantidade}</td>
                    <td>
                      {formatarMoeda(pedido.custo_unitario)}
                    </td>
                    <td>
                      {formatarMoeda(pedido.valor_total)}
                    </td>
                    <td>{pedido.forma_pagamento}</td>
                    <td>{pedido.status}</td>
                    <td>{formatarData(pedido.data_pedido)}</td>
                    <td>
                      {pedido.status === "PENDENTE" && (
                        <button
                          type="button"
                          className="acao-pedido"
                          disabled={pedidoAtualizando !== null}
                          onClick={() =>
                            atualizarStatus(pedido, "APROVADO")
                          }
                        >
                          Aprovar
                        </button>
                      )}

                      {pedido.status === "APROVADO" && (
                        <button
                          type="button"
                          className="acao-pedido"
                          disabled={pedidoAtualizando !== null}
                          onClick={() =>
                            atualizarStatus(pedido, "RECEBIDO")
                          }
                        >
                          Receber
                        </button>
                      )}

                      {pedido.status === "RECEBIDO" && (
                        <span>Concluído</span>
                      )}
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
          Atualizar dados
        </button>
      </div>
    </section>
  );
}

export default Pedidos;
