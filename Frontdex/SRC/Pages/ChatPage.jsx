import { useState } from "react";
import { useApp } from "../context/AppContext";
import {
  FINANCIAL_PERIODS,
  getReferenceDate,
  summarizeAppointments,
  summarizeFinancial,
} from "../utils/businessMetrics";
import { formatCurrency } from "../utils/format";

function getReply(question, data, referenceDate) {
  if (/faturei|faturou|faturamento|receita/i.test(question)) {
    const period = /semana/i.test(question) ? "week" : /m[eê]s/i.test(question) ? "month" : "day";
    const financial = summarizeFinancial(data.financeiro, referenceDate, period);
    const appointments = summarizeAppointments(data.agenda, referenceDate, period);
    return `${FINANCIAL_PERIODS[period]}: ${formatCurrency(financial.entradas)} em entradas e ${appointments.completed.length} atendimentos concluídos. 💰`;
  }

  if (/estoque|falta|repor/i.test(question)) {
    const critical = data.estoque.filter((item) => item.quantidade <= item.minimo);
    return critical.length
      ? `⚠️ Produtos em falta: ${critical.map((item) => item.produto).join(", ")}.`
      : "Tudo certo, nenhum produto abaixo do mínimo. ✓";
  }

  if (/cliente|vip|recorrente/i.test(question)) {
    const customer = [...data.clientes].sort((a, b) => b.visitas - a.visitas)[0];
    if (!customer) {
      return "Ainda não há clientes cadastrados para calcular recorrência.";
    }
    return `${customer.nome} é o cliente mais recorrente, com ${customer.visitas} visitas e ${formatCurrency(customer.gasto)} em gasto total. ⭐`;
  }

  return "Posso ajudar com faturamento, estoque, tarefas, clientes e financeiro da barbearia. 🤖";
}

export function ChatPage() {
  const { data } = useApp();
  const referenceDate = getReferenceDate(data);
  const [messages, setMessages] = useState([
    {
      id: "m1",
      from: "ia",
      text: 'Olá! 👋 Sou a Dex IA. Pergunte sobre o negócio ou use frases como "quanto faturei hoje?".',
    },
  ]);
  const [value, setValue] = useState("");

  function send(text) {
    if (!text.trim()) return;
    const next = text.trim();
    setMessages((current) => [
      ...current,
      { id: `m_${Date.now()}`, from: "me", text: next },
      { id: `m_${Date.now() + 1}`, from: "ia", text: getReply(next, data, referenceDate) },
    ]);
    setValue("");
  }

  return (
    <div className="chat-shell">
      <div className="chat-thread">
        {messages.map((message) =>
          message.from === "ia" ? (
            <div key={message.id} className="chat-row ia">
              <div className="chat-ava">🤖</div>
              <div className="chat-bubble ia">{message.text}</div>
            </div>
          ) : (
            <div key={message.id} className="chat-row me">
              <div className="chat-bubble me">{message.text}</div>
            </div>
          ),
        )}
      </div>

      <div className="chat-quick">
        {["Quanto faturei hoje?", "Produtos em falta?", "Cliente mais recorrente?"].map((question) => (
          <button key={question} className="chat-chip" onClick={() => send(question)} type="button">
            {question}
          </button>
        ))}
      </div>

      <div className="chat-inputbar">
        <button className="chat-mic" type="button">
          🎤
        </button>
        <input
          className="chat-field"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => (event.key === "Enter" ? send(value) : null)}
          placeholder="Escreva sua mensagem..."
          value={value}
        />
        <button className="chat-send" onClick={() => send(value)} type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 11l18-8-8 18-2-7-8-3z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
