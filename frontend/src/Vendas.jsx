import { useCallback, useEffect, useMemo, useState } from "react";
import "./Vendas.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const moeda = (valor) =>
  Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

const dataLocal = (valor) =>
  valor ? new Date(valor).toLocaleString("pt-BR") : "—";

const quantidadeValida = (valor) =>
  Number.isSafeInteger(Number(valor)) &&
  Number(valor) > 0 &&
  Number(valor) <= 2147483647 &&
  String(valor).trim() !== "";

// Os preços da AC1 possuem duas casas decimais.
const centavos = (valor) => Math.round(Number(valor) * 100);

function Vendas() {
  const [produtos, setProdutos] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [clienteNome, setClienteNome] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [carrinho, setCarrinho] = useState([]);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [pedidoEmAcao, setPedidoEmAcao] = useState(null);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    try {
      const respostas = await Promise.all([
        fetch(`${API_URL}/produtos`),
        fetch(`${API_URL}/pedidos-clientes`),
        fetch(`${API_URL}/vendas/resumo`)
      ]);
      if (respostas.some((r) => !r.ok)) {
        throw new Error("Uma das consultas ao servidor falhou.");
      }
      const [listaProdutos, listaPedidos, dadosResumo] = await Promise.all(
        respostas.map((resposta) => resposta.json())
      );
      setProdutos(listaProdutos);
      setPedidos(listaPedidos);
      setResumo(dadosResumo);
      setErro("");
    } catch (falha) {
      console.error("Erro ao carregar vendas:", falha);
      setErro("Não foi possível carregar produtos, pedidos ou resumo de vendas.");
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

  const itensComDados = useMemo(() =>
    carrinho.map((item) => {
      const produto = produtos.find((p) => p.id === item.produto_id);
      const precoCentavos = produto ? centavos(produto.preco) : 0;
      return {
        ...item,
        produto,
        precoCentavos,
        subtotalCentavos: precoCentavos * Number(item.quantidade)
      };
    }), [carrinho, produtos]
  );

  const totalCentavos = itensComDados.reduce(
    (total, item) => total + item.subtotalCentavos, 0
  );

  const adicionarItem = () => {
    setMensagem("");
    if (!produtoSelecionado || !quantidadeValida(quantidade)) {
      setMensagem("Selecione um produto e uma quantidade inteira maior que zero.");
      return;
    }
    if (carrinho.length >= 50) {
      setMensagem("Cada pedido aceita no máximo 50 produtos diferentes.");
      return;
    }
    if (carrinho.some((item) => item.produto_id === produtoSelecionado.id)) {
      setMensagem("Este produto já está no carrinho. Altere a quantidade na tabela.");
      return;
    }
    if (!Number.isFinite(Number(produtoSelecionado.preco)) ||
        Number(produtoSelecionado.preco) <= 0) {
      setMensagem("Este produto não possui um preço de venda válido na AC1.");
      return;
    }

    setCarrinho((anterior) => [
      ...anterior,
      { produto_id: produtoSelecionado.id, quantidade: Number(quantidade) }
    ]);
    setProdutoId("");
    setQuantidade("1");
  };

  const alterarQuantidade = (id, novaQuantidade) => {
    setCarrinho((anterior) => anterior.map((item) =>
      item.produto_id === id ? { ...item, quantidade: novaQuantidade } : item
    ));
  };

  const removerItem = (id) => {
    setCarrinho((anterior) => anterior.filter((item) => item.produto_id !== id));
  };

  const cadastrarPedido = async (evento) => {
    evento.preventDefault();
    setMensagem("");
    setErro("");

    if (clienteNome.trim().length < 2 || clienteNome.trim().length > 120) {
      setMensagem("Informe um nome de cliente com 2 a 120 caracteres.");
      return;
    }
    if (itensComDados.length === 0 || itensComDados.some(
      (item) => !item.produto || !quantidadeValida(item.quantidade)
    )) {
      setMensagem("Adicione produtos válidos e confira suas quantidades.");
      return;
    }
    if (!Number.isSafeInteger(totalCentavos) ||
        totalCentavos <= 0 || totalCentavos > 999999999999999) {
      setMensagem("O valor estimado do pedido está fora do limite permitido.");
      return;
    }

    setSalvando(true);
    try {
      // O servidor lê os preços atuais da AC1; o frontend não define preços finais.
      const resposta = await fetch(`${API_URL}/pedidos-clientes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente_nome: clienteNome.trim(),
          itens: carrinho.map((item) => ({
            produto_id: item.produto_id,
            quantidade: Number(item.quantidade)
          }))
        })
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setMensagem(dados.mensagem || "Não foi possível cadastrar o pedido.");
        return;
      }
      setMensagem(`Pedido #${dados.pedido.id} cadastrado como PENDENTE. Nenhum estoque foi descontado.`);
      setClienteNome("");
      setCarrinho([]);
      await carregarDados();
    } catch (falha) {
      console.error("Erro ao cadastrar venda:", falha);
      setMensagem("Não foi possível conectar ao servidor.");
    } finally {
      setSalvando(false);
    }
  };

  const mudarStatus = async (pedido, acao) => {
    const confirmarVenda = acao === "confirmar";
    const aviso = confirmarVenda
      ? `Confirmar a venda #${pedido.id}? O estoque será reduzido para todos os itens.`
      : `Cancelar o pedido pendente #${pedido.id}?`;
    if (!window.confirm(aviso)) return;

    setMensagem("");
    setPedidoEmAcao(pedido.id);
    try {
      const resposta = await fetch(
        `${API_URL}/pedidos-clientes/${pedido.id}/${acao}`,
        { method: "PATCH" }
      );
      const dados = await resposta.json();
      if (!resposta.ok) {
        setMensagem(dados.mensagem || "Não foi possível atualizar o pedido.");
        return;
      }
      setMensagem(dados.mensagem || "Pedido atualizado com sucesso!");
      await carregarDados();
    } catch (falha) {
      console.error("Erro ao atualizar pedido:", falha);
      setMensagem("Não foi possível conectar ao servidor.");
    } finally {
      setPedidoEmAcao(null);
    }
  };

  const ocupando = salvando || pedidoEmAcao !== null;

  return (
    <section className="vendas-area">
      <h2>Pedidos de Clientes e Vendas — Extra</h2>
      <p>Monte pedidos com vários produtos, confirme vendas e acompanhe o estoque e os resultados.</p>

      {erro && <p className="mensagem mensagem-erro" role="alert">{erro}</p>}
      {mensagem && <p className="mensagem" role="status">{mensagem}</p>}

      <div className="vendas-painel">
        <h3>Resumo de vendas</h3>
        {resumo ? (
          <div className="vendas-resumo-grid">
            <div className="vendas-indicador">
              <span>Faturamento confirmado</span>
              <strong>{moeda(resumo.faturamento_confirmado)}</strong>
            </div>
            <div className="vendas-indicador">
              <span>Pedidos pendentes</span>
              <strong>{resumo.pedidos_pendentes}</strong>
            </div>
            <div className="vendas-indicador">
              <span>Vendas confirmadas</span>
              <strong>{resumo.pedidos_confirmados}</strong>
            </div>
            <div className="vendas-indicador">
              <span>Margem bruta estimada (parcial)</span>
              <strong>{moeda(resumo.margem_bruta_estimada_parcial)}</strong>
              <small>{resumo.itens_sem_custo} item(ns) sem custo conhecido</small>
            </div>
          </div>
        ) : (
          <p>{carregando ? "Carregando indicadores..." : "Indicadores indisponíveis."}</p>
        )}
        <p className="vendas-observacao">
          Faturamento não significa pagamento recebido. A margem bruta estimada considera
          apenas itens com custo de aquisição conhecido e não inclui impostos e despesas.
        </p>
      </div>

      <div className="vendas-painel">
        <h3>Novo pedido de cliente</h3>
        <form onSubmit={cadastrarPedido}>
          <label htmlFor="venda_cliente">Nome do cliente</label>
          <input id="venda_cliente" value={clienteNome}
            onChange={(e) => setClienteNome(e.target.value)}
            placeholder="Ex.: Cliente Teste" minLength={2} maxLength={120} required />

          <div className="vendas-seletor">
            <div>
              <label htmlFor="venda_produto">Produto</label>
              <select id="venda_produto" value={produtoId}
                onChange={(e) => setProdutoId(e.target.value)}>
                <option value="">Selecione um produto</option>
                {produtos.map((produto) => (
                  <option key={produto.id} value={produto.id}>
                    {produto.nome} — {produto.sku}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="venda_quantidade">Quantidade</label>
              <input id="venda_quantidade" type="number" min="1" step="1"
                value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
            </div>
          </div>

          {produtoSelecionado && (
            <p className="vendas-detalhe">
              Preço da AC1: <strong>{moeda(produtoSelecionado.preco)}</strong>
              {" · "}Em estoque: <strong>{produtoSelecionado.estoque_atual} un.</strong>
            </p>
          )}
          <button type="button" className="botao-secundario"
            onClick={adicionarItem} disabled={carregando || ocupando}>
            Adicionar ao carrinho
          </button>

          <h4>Carrinho</h4>
          {itensComDados.length === 0 ? (
            <p>Nenhum produto adicionado ao pedido.</p>
          ) : (
            <div className="tabela-container">
              <table>
                <thead><tr>
                  <th>Produto</th><th>Preço (AC1)</th><th>Quantidade</th>
                  <th>Subtotal</th><th>Ação</th>
                </tr></thead>
                <tbody>
                  {itensComDados.map((item) => (
                    <tr key={item.produto_id}>
                      <td>{item.produto?.nome || "Produto indisponível"}</td>
                      <td>{moeda(item.precoCentavos / 100)}</td>
                      <td>
                        <input className="vendas-quantidade-tabela"
                          aria-label={`Quantidade de ${item.produto?.nome || "produto"}`}
                          type="number" min="1" step="1"
                          value={item.quantidade}
                          onChange={(e) => alterarQuantidade(item.produto_id, e.target.value)}
                          disabled={ocupando} />
                      </td>
                      <td>{moeda(item.subtotalCentavos / 100)}</td>
                      <td>
                        <button type="button" className="vendas-remover"
                          onClick={() => removerItem(item.produto_id)} disabled={ocupando}>
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="vendas-total">
            <span>Total estimado do pedido</span>
            <strong>{moeda(totalCentavos / 100)}</strong>
          </div>
          <p className="vendas-observacao">
            O servidor confirma os preços atuais no momento do cadastro.
            Cadastrar não movimenta o estoque; isso ocorre somente ao confirmar a venda.
          </p>
          <button type="submit" disabled={carregando || ocupando || !carrinho.length}>
            {salvando ? "Cadastrando..." : "Cadastrar pedido pendente"}
          </button>
        </form>
      </div>

      <div className="vendas-painel">
        <h3>Histórico de pedidos de clientes</h3>
        {carregando ? (
          <p>Carregando pedidos...</p>
        ) : pedidos.length === 0 ? (
          <p>Nenhum pedido de cliente cadastrado.</p>
        ) : (
          <div className="tabela-container">
            <table>
              <thead><tr>
                <th>ID</th><th>Cliente</th><th>Itens</th><th>Total</th>
                <th>Status</th><th>Data</th><th>Ações</th>
              </tr></thead>
              <tbody>
                {pedidos.map((pedido) => (
                  <tr key={pedido.id}>
                    <td>{pedido.id}</td>
                    <td>{pedido.cliente_nome}</td>
                    <td>
                      {(pedido.itens || []).map((item) => (
                        <div key={item.id} className="vendas-item-historico">
                          {item.quantidade}× {item.produto_nome} — {moeda(item.preco_unitario)}
                        </div>
                      ))}
                    </td>
                    <td>{moeda(pedido.valor_total)}</td>
                    <td>{pedido.status}</td>
                    <td>{dataLocal(pedido.criado_em)}</td>
                    <td>
                      {pedido.status === "PENDENTE" ? (
                        <div className="vendas-acoes">
                          <button type="button" className="acao-pedido"
                            onClick={() => mudarStatus(pedido, "confirmar")}
                            disabled={ocupando || carregando}>
                            Confirmar venda
                          </button>
                          <button type="button" className="vendas-cancelar"
                            onClick={() => mudarStatus(pedido, "cancelar")}
                            disabled={ocupando || carregando}>
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <span>{pedido.status === "CONFIRMADO" ? "Concluído" : "Cancelado"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button type="button" className="botao-secundario"
          onClick={carregarDados} disabled={carregando || ocupando}>
          Atualizar pedidos e indicadores
        </button>
      </div>
    </section>
  );
}

export default Vendas;
