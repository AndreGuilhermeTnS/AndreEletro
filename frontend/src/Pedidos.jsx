
import { useCallback, useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const moeda = (valor) =>
  Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

const dataLocal = (valor) => new Date(valor).toLocaleString("pt-BR");

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
  const [pedidoAtualizando, setPedidoAtualizando] = useState(null);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const respostas = await Promise.all([
        fetch(`${API_URL}/produtos`),
        fetch(`${API_URL}/pedidos`),
        fetch(`${API_URL}/financeiro/resumo`)
      ]);
      if (respostas.some((r) => !r.ok)) {
        throw new Error("Falha na consulta de produtos, pedidos ou financeiro.");
      }
      const [dadosProdutos, dadosPedidos, dadosResumo] = await Promise.all(
        respostas.map((resposta) => resposta.json())
      );
      setProdutos(dadosProdutos);
      setPedidos(dadosPedidos);
      setResumo(dadosResumo);
      setErro("");
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

  const produtoSelecionado = produtos.find(
    (produto) => produto.id === Number(formulario.produto_id)
  );

  const selecionarProduto = (evento) => {
    const id = evento.target.value;
    const produto = produtos.find((item) => item.id === Number(id));
    const custo = produto?.custo_medio_aquisicao;

    // Preenche apenas ao selecionar. Depois, pode ser alterado livremente.
    // O pedido aceita custo com 2 casas; a média guarda 4 casas.
    const custoSugerido = custo !== null && custo !== undefined &&
      Number(custo) > 0
      ? Number(custo).toFixed(2)
      : "";

    setFormulario((anterior) => ({
      ...anterior,
      produto_id: id,
      custo_unitario: custoSugerido
    }));
  };

  const atualizarCampo = (evento) => {
    const { name, value } = evento.target;
    setFormulario((anterior) => ({ ...anterior, [name]: value }));
  };

  const quantidade = Number(formulario.quantidade);
  const custoUnitario = Number(formulario.custo_unitario);
  const totalPrevisto = formulario.quantidade !== "" &&
    formulario.custo_unitario !== "" &&
    Number.isSafeInteger(quantidade) && quantidade > 0 &&
    Number.isFinite(custoUnitario) && custoUnitario > 0
    ? quantidade * custoUnitario
    : 0;

  const cadastrarPedido = async (evento) => {
    evento.preventDefault();
    setMensagem("");
    setErro("");

    if (!produtoSelecionado || !Number.isSafeInteger(quantidade) ||
        quantidade <= 0 ||
        !/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(formulario.custo_unitario) ||
        custoUnitario <= 0 || totalPrevisto > 9999999999.99) {
      setMensagem("Confira o produto, a quantidade e o custo unitário (até 2 casas decimais).");
      return;
    }

    setSalvando(true);
    try {
      const resposta = await fetch(`${API_URL}/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produto_id: Number(formulario.produto_id),
          quantidade,
          custo_unitario: formulario.custo_unitario,
          forma_pagamento: formulario.forma_pagamento
        })
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setMensagem(dados.mensagem || "Não foi possível cadastrar o pedido.");
        return;
      }
      setFormulario({
        produto_id: "", quantidade: "", custo_unitario: "", forma_pagamento: "PIX"
      });
      setMensagem("Pedido cadastrado com sucesso!");
      await carregarDados();
    } catch (erroEnvio) {
      console.error(erroEnvio);
      setMensagem("Não foi possível conectar ao servidor.");
    } finally {
      setSalvando(false);
    }
  };

  const atualizarStatus = async (pedido, novoStatus) => {
    const texto = novoStatus === "RECEBIDO"
      ? "Confirmar recebimento? O estoque será aumentado e o custo médio recalculado."
      : "Deseja aprovar este pedido?";

    if (!window.confirm(texto)) return;

    setPedidoAtualizando(pedido.id);
    setMensagem("");
    setErro("");
    try {
      const resposta = await fetch(
        `${API_URL}/pedidos/${pedido.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: novoStatus })
        }
      );
      const dados = await resposta.json();
      if (!resposta.ok) {
        setMensagem(dados.mensagem || "Não foi possível atualizar o status.");
        return;
      }
      setMensagem(dados.mensagem || "Status atualizado!");
      await carregarDados();
    } catch (erroAtualizacao) {
      console.error(erroAtualizacao);
      setMensagem("Não foi possível conectar ao servidor.");
    } finally {
      setPedidoAtualizando(null);
    }
  };

  return (
    <section className="pedidos-area">
      <h2>Pedidos e Controle Financeiro — AC3</h2>
      <p>Registre compras de reposição e acompanhe os custos de aquisição.</p>
      {erro && <p className="mensagem mensagem-erro" role="alert">{erro}</p>}
      {mensagem && <p className="mensagem" role="status">{mensagem}</p>}

      <div className="resumo-financeiro">
        <h3>Resumo financeiro de compras</h3>
        {carregando && !resumo ? (
          <p>Carregando resumo...</p>
        ) : resumo ? (
          <div className="resumo-grid">
            <div className="resumo-item">
              <span>Total dos pedidos</span>
              <strong>{moeda(resumo.valor_total_pedidos)}</strong>
              <small>{resumo.total_pedidos} pedido(s)</small>
            </div>
            <div className="resumo-item">
              <span>Pendentes</span>
              <strong>{resumo.pedidos_pendentes}</strong>
              <small>{moeda(resumo.valor_pendente)}</small>
            </div>
            <div className="resumo-item">
              <span>Aprovados</span>
              <strong>{resumo.pedidos_aprovados}</strong>
              <small>{moeda(resumo.valor_aprovado)}</small>
            </div>
            <div className="resumo-item">
              <span>Recebidos</span>
              <strong>{resumo.pedidos_recebidos}</strong>
              <small>{moeda(resumo.valor_recebido)}</small>
            </div>
          </div>
        ) : (
          <p>Resumo indisponível.</p>
        )}
        <p className="observacao-financeira">
          Estes valores representam pedidos de compra, não pagamentos confirmados.
        </p>
      </div>

      <div className="pedidos-painel">
        <h3>Novo pedido de reposição</h3>
        <form onSubmit={cadastrarPedido}>
          <label htmlFor="pedido_produto">Produto</label>
          <select id="pedido_produto" name="produto_id"
            value={formulario.produto_id} onChange={selecionarProduto} required>
            <option value="">Selecione um produto</option>
            {produtos.map((produto) => (
              <option key={produto.id} value={produto.id}>
                {produto.nome} — {produto.sku}
              </option>
            ))}
          </select>

          {produtoSelecionado && (
            <div className="estoque-saldo">
              <p>Estoque atual: <strong>{produtoSelecionado.estoque_atual} unidades</strong></p>
              <p>Preço de venda na AC1: <strong>{moeda(produtoSelecionado.preco)}</strong></p>
              <p>Custo médio de aquisição: <strong>
                {produtoSelecionado.custo_medio_aquisicao === null ||
                 produtoSelecionado.custo_medio_aquisicao === undefined
                  ? "Não informado"
                  : moeda(produtoSelecionado.custo_medio_aquisicao)}
              </strong></p>
              {produtoSelecionado.custo_medio_aquisicao === null &&
               Number(produtoSelecionado.estoque_atual) > 0 && (
                <small>Antes de receber esta reposição, defina o custo inicial do produto na AC1.</small>
              )}
            </div>
          )}

          <label htmlFor="pedido_quantidade">Quantidade solicitada</label>
          <input id="pedido_quantidade" name="quantidade" type="number"
            min="1" step="1" value={formulario.quantidade}
            onChange={atualizarCampo} placeholder="Ex.: 10" required />

          <label htmlFor="pedido_custo">Custo unitário desta compra (R$)</label>
          <input id="pedido_custo" name="custo_unitario" type="number"
            min="0.01" step="0.01" value={formulario.custo_unitario}
            onChange={atualizarCampo} placeholder="Ex.: 7.50" required />
          <small>
            Sugestão preenchida a partir do custo médio da AC1, quando disponível.
            Ajuste para o valor real negociado com o fornecedor.
          </small>

          <label htmlFor="pedido_pagamento">Forma de pagamento prevista</label>
          <select id="pedido_pagamento" name="forma_pagamento"
            value={formulario.forma_pagamento} onChange={atualizarCampo}>
            <option value="PIX">Pix</option>
            <option value="DINHEIRO">Dinheiro</option>
            <option value="CARTAO">Cartão</option>
            <option value="BOLETO">Boleto</option>
          </select>

          <div className="pedido-total">
            <span>Valor total previsto</span>
            <strong>{moeda(totalPrevisto)}</strong>
          </div>
          <button type="submit" disabled={salvando || carregando || pedidoAtualizando !== null}>
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
                  <th>ID</th><th>Produto</th><th>SKU</th>
                  <th>Quantidade</th><th>Custo unitário</th>
                  <th>Total</th><th>Pagamento</th>
                  <th>Status</th><th>Data</th><th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((pedido) => (
                  <tr key={pedido.id}>
                    <td>{pedido.id}</td>
                    <td>{pedido.produto_nome}</td>
                    <td>{pedido.produto_sku}</td>
                    <td>{pedido.quantidade}</td>
                    <td>{moeda(pedido.custo_unitario)}</td>
                    <td>{moeda(pedido.valor_total)}</td>
                    <td>{pedido.forma_pagamento}</td>
                    <td>{pedido.status}</td>
                    <td>{dataLocal(pedido.data_pedido)}</td>
                    <td>
                      {pedido.status === "PENDENTE" && (
                        <button type="button" className="acao-pedido"
                          disabled={pedidoAtualizando !== null || salvando}
                          onClick={() => atualizarStatus(pedido, "APROVADO")}>
                          Aprovar
                        </button>
                      )}
                      {pedido.status === "APROVADO" && (
                        <button type="button" className="acao-pedido"
                          disabled={pedidoAtualizando !== null || salvando}
                          onClick={() => atualizarStatus(pedido, "RECEBIDO")}>
                          Receber
                        </button>
                      )}
                      {pedido.status === "RECEBIDO" && <span>Concluído</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button type="button" className="botao-secundario"
          onClick={carregarDados} disabled={carregando || salvando || pedidoAtualizando !== null}>
          Atualizar dados
        </button>
      </div>
    </section>
  );
}

export default Pedidos;
