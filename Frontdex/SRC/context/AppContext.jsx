import { createContext, useContext, useEffect, useRef, useState } from "react";

import { apiRequest, ApiError } from "../api/client";
import { initialData } from "../data/initialData";
import { normalizeAppData } from "../utils/appData";
import { applyAppointmentChange, applyStockPurchase } from "../utils/domainOperations";

const AppContext = createContext(null);

const DEMO_ACCOUNTS = [
  {
    id: "demo-admin",
    email: "adm@frontdex.demo",
    password: "Frontdex123!",
    displayName: "Administrador Dex",
    role: "admin",
  },
  {
    id: "demo-joao",
    email: "joao@frontdex.demo",
    password: "Frontdex123!",
    displayName: "Joao Carlos",
    role: "employee",
  },
  {
    id: "demo-pedro",
    email: "pedro@frontdex.demo",
    password: "Frontdex123!",
    displayName: "Pedro Alves",
    role: "employee",
  },
];

const DEMO_SHOP = {
  id: "demo-shop",
  name: "Barbearia Dex Demo",
};

const DEMO_SESSION_STORAGE_KEY = "frontdex_demo_session_v1";
const DEMO_DATA_STORAGE_KEY = "frontdex_demo_data_v3";
const API_HEALTH_UNAVAILABLE_CODES = new Set(["missing_database_url", "internal_error", "api_error"]);

let toastSeed = 0;

// Provider central: guarda sessão, dados da app e ações compartilhadas pelo front inteiro.
export function AppProvider({ children }) {
  const [data, setData] = useState(() => normalizeAppData(initialData));
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState("loading");
  const [authBusy, setAuthBusy] = useState(false);
  const [appMode, setAppMode] = useState("api");
  const [isDark, setIsDark] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [toasts, setToasts] = useState([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    // O tema é refletido direto no body para o CSS global reagir sem props extras.
    document.body.classList.toggle("light", !isDark);
  }, [isDark]);

  useEffect(() => {
    mountedRef.current = true;
    // Bootstrap decide entre API real e modo demo logo na inicialização.
    void bootstrap();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Cria notificações temporárias e remove cada uma pelo id correspondente.
  function pushToast(message, type = "ok") {
    const id = `toast_${++toastSeed}`;
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 2600);
  }

  // Primeiro tenta falar com a API; se falhar, cai automaticamente para o demo.
  async function bootstrap() {
    setStatus("loading");

    try {
      await ensureApiAvailable();
      await bootstrapApiMode();
    } catch (error) {
      enableDemoMode();
    }
  }

  // Health check simples para distinguir indisponibilidade real de erros de aplicação.
  async function ensureApiAvailable() {
    try {
      await apiRequest("/api/health");
      return true;
    } catch (error) {
      if (error instanceof ApiError && API_HEALTH_UNAVAILABLE_CODES.has(error.code)) {
        throw error;
      }

      if (!(error instanceof ApiError)) {
        throw error;
      }
    }

    return true;
  }

  // Hidrata a sessão e o estado completo quando a aplicação está online.
  async function bootstrapApiMode() {
    setAppMode("api");

    try {
      const sessionPayload = await apiRequest("/api/auth/session");
      if (!mountedRef.current) {
        return;
      }

      setSession(sessionPayload.session);
      await refreshApiAppState(false, sessionPayload.session);
      setStatus("ready");
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      if (error instanceof ApiError && error.status === 401) {
        setSession(null);
        setData(normalizeAppData(initialData));
        setStatus("ready");
        return;
      }

      throw error;
    }
  }

  // No modo demo, a fonte de verdade vira o localStorage do navegador.
  function enableDemoMode() {
    if (!mountedRef.current) {
      return;
    }

    setAppMode("demo");
    setSession(readDemoSession());
    setData(normalizeAppData(readDemoData()));
    setStatus("ready");
  }

  // Busca o snapshot mais recente da API e mantém a sessão sincronizada.
  async function refreshApiAppState(updateStatus = true, currentSession = session) {
    if (updateStatus) {
      setStatus("loading");
    }

    try {
      const payload = await apiRequest("/api/app-state");
      if (!mountedRef.current) {
        return;
      }

      setData(normalizeAppData(payload.data));
      if (payload.session) {
        setSession(payload.session);
      } else if (currentSession) {
        setSession(currentSession);
      }
      setStatus("ready");
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      if (error instanceof ApiError && error.status === 401) {
        setSession(null);
        setData(normalizeAppData(initialData));
        setStatus("ready");
        return;
      }

      throw error;
    }
  }

  // Recarrega o estado local salvo para simular persistência no demo.
  async function refreshDemoAppState(updateStatus = true) {
    if (updateStatus) {
      setStatus("loading");
    }

    if (!mountedRef.current) {
      return;
    }

    setSession(readDemoSession());
    setData(normalizeAppData(readDemoData()));
    setStatus("ready");
  }

  // Esconde da UI a diferença entre atualizar do demo e atualizar da API.
  async function refreshAppState(updateStatus = true, currentSession = session) {
    if (appMode === "demo") {
      await refreshDemoAppState(updateStatus);
      return;
    }

    await refreshApiAppState(updateStatus, currentSession);
  }

  // Login usa a mesma função para os dois modos, mudando apenas a origem da sessão.
  async function signIn(credentials) {
    setAuthBusy(true);

    try {
      if (appMode === "demo") {
        const account = DEMO_ACCOUNTS.find(
          (item) =>
            item.email.toLowerCase() === String(credentials.email || "").trim().toLowerCase() &&
            item.password === String(credentials.password || ""),
        );

        if (!account) {
          throw new Error("Login demo invalido. Use uma das contas liberadas na tela.");
        }

        const nextSession = createDemoSession(account);
        persistDemoSession(nextSession);
        setSession(nextSession);
        setData(normalizeAppData(readDemoData()));
        setStatus("ready");
        return;
      }

      const payload = await apiRequest("/api/auth/login", {
        method: "POST",
        body: credentials,
      });
      await refreshApiAppState(false, payload.session);
      setStatus("ready");
    } finally {
      if (mountedRef.current) {
        setAuthBusy(false);
      }
    }
  }

  // Cadastro só existe quando a API real está ativa.
  async function signUp(payload) {
    setAuthBusy(true);

    try {
      if (appMode === "demo") {
        throw new Error("Cadastro real fica disponivel quando o banco for conectado. Use um dos logins demo por enquanto.");
      }

      const response = await apiRequest("/api/auth/register", {
        method: "POST",
        body: payload,
      });
      await refreshApiAppState(false, response.session);
      setStatus("ready");
    } finally {
      if (mountedRef.current) {
        setAuthBusy(false);
      }
    }
  }

  // Sempre limpa a sessão local, mesmo se o logout remoto falhar.
  async function signOut() {
    if (appMode === "demo") {
      clearDemoSession();

      if (!mountedRef.current) {
        return;
      }

      setSession(null);
      setData(normalizeAppData(readDemoData()));
      setStatus("ready");
      return;
    }

    try {
      await apiRequest("/api/auth/logout", {
        method: "POST",
      });
    } catch {
      // Ignore logout network issues and clear local state anyway.
    }

    if (!mountedRef.current) {
      return;
    }

    setSession(null);
    setData(normalizeAppData(initialData));
    setStatus("ready");
  }

  // Wrapper único para mutações: persiste na API ou emula no demo.
  async function runMutation(apiMutation, demoMutation) {
    try {
      if (appMode === "demo") {
        // structuredClone evita mutar acidentalmente o objeto salvo no localStorage.
        ensurePermission("manage_app");
        const nextData = demoMutation(structuredClone(normalizeAppData(readDemoData())));
        persistDemoData(nextData);
        setData(normalizeAppData(nextData));
        return;
      }

      await apiMutation();
      await refreshApiAppState(false);
    } catch (error) {
      pushToast(error.message || "Falha ao salvar dados.", "err");
      throw error;
    }
  }

  // Atualiza a meta atual do mês no dashboard.
  async function saveGoal(payload) {
    return runMutation(
      () =>
        apiRequest("/api/goals/current", {
          method: "PUT",
          body: payload,
        }),
      (draft) => ({
        ...draft,
        metas: {
          ...draft.metas,
          faturamento: Number(payload.faturamento ?? draft.metas.faturamento ?? 0),
          monthKey: payload.monthKey || draft.metas.monthKey,
        },
      }),
    );
  }

  async function saveAppointment(payload, appointmentId) {
    return runMutation(
      () =>
        apiRequest(appointmentId ? `/api/appointments/${appointmentId}` : "/api/appointments", {
          method: appointmentId ? "PUT" : "POST",
          body: payload,
        }),
      (draft) => {
        const current = draft.agenda.find((item) => item.id === appointmentId);
        const nextItem = {
          ...current,
          id: appointmentId || createLocalId("agenda"),
          clienteId: payload.clienteId || null,
          cliente: payload.cliente,
          barbeiroId: payload.barbeiroId || null,
          barbeiro: payload.barbeiro,
          servico: payload.servico,
          hora: payload.hora,
          dur: Number(payload.dur || 45),
          valor: Number(payload.valor || 0),
          status: payload.status || "agendado",
          data: payload.data,
        };

        return applyAppointmentChange(draft, nextItem);
      },
    );
  }

  // Troca rapidamente o status do atendimento sem editar o registro inteiro.
  async function updateAppointmentStatus(appointmentId, nextStatus) {
    return runMutation(
      () =>
        apiRequest(`/api/appointments/${appointmentId}/status`, {
          method: "PATCH",
          body: { status: nextStatus },
        }),
      (draft) => {
        const current = draft.agenda.find((item) => item.id === appointmentId);
        if (!current) {
          throw new Error("Agendamento não encontrado.");
        }

        return applyAppointmentChange(draft, { ...current, status: nextStatus });
      },
    );
  }

  async function saveCustomer(payload, customerId) {
    return runMutation(
      () =>
        apiRequest(customerId ? `/api/customers/${customerId}` : "/api/customers", {
          method: customerId ? "PUT" : "POST",
          body: payload,
        }),
      (draft) => {
        const name = String(payload.nome || "").trim();
        const current = draft.clientes.find((item) => item.id === customerId);
        const nextItem = {
          id: customerId || createLocalId("cliente"),
          nome: name,
          telefone: payload.telefone || "",
          visitas: Number(current?.visitas || 0),
          gasto: Number(current?.gasto || 0),
          avatar: payload.avatar || createInitials(name),
          instagram: payload.instagram || "",
          email: payload.email || "",
          nascimento: payload.nascimento || "",
          ultimaVisita: current?.ultimaVisita || "",
          observacoes: payload.observacoes || "",
        };

        return {
          ...draft,
          clientes: upsertById(draft.clientes, nextItem),
        };
      },
    );
  }

  async function removeCustomer(customerId) {
    return runMutation(
      () =>
        apiRequest(`/api/customers/${customerId}`, {
          method: "DELETE",
        }),
      (draft) => ({
        ...draft,
        clientes: draft.clientes.filter((item) => item.id !== customerId),
        agenda: draft.agenda.map((item) =>
          item.clienteId === customerId ? { ...item, clienteId: null } : item,
        ),
      }),
    );
  }

  async function saveEmployee(payload, employeeId) {
    return runMutation(
      () =>
        apiRequest(employeeId ? `/api/employees/${employeeId}` : "/api/employees", {
          method: employeeId ? "PUT" : "POST",
          body: payload,
        }),
      (draft) => {
        const name = String(payload.nome || "").trim();
        const current = draft.equipe.find((item) => item.id === employeeId);
        const nextItem = {
          id: employeeId || createLocalId("equipe"),
          nome: name,
          cargo: payload.cargo || "Barbeiro",
          comissao: Number(payload.comissao ?? 35),
          sessoes: Number(current?.sessoes || 0),
          faturamento: Number(current?.faturamento || 0),
          avatar: payload.avatar || createInitials(name),
          cor: payload.cor || "#FF6B2B",
          telefone: payload.telefone || "",
          email: payload.email || "",
          admissao: payload.admissao || "",
          especialidades: Array.isArray(payload.especialidades) ? payload.especialidades : [],
          dias: Number(payload.dias || 0),
        };

        return {
          ...draft,
          equipe: upsertById(draft.equipe, nextItem),
        };
      },
    );
  }

  async function saveFinancialEntry(payload, entryId) {
    return runMutation(
      () =>
        apiRequest(entryId ? `/api/financial-entries/${entryId}` : "/api/financial-entries", {
          method: entryId ? "PUT" : "POST",
          body: payload,
        }),
      (draft) => {
        ensurePermission("finance");
        const current = draft.financeiro.find((item) => item.id === entryId);
        if (current?.editavel === false) {
          throw new Error("Altere este lançamento pela operação que o originou.");
        }

        const nextItem = {
          id: entryId || createLocalId("financeiro"),
          tipo: payload.tipo || "entrada",
          descricao: payload.descricao || "",
          categoria: payload.categoria || "",
          valor: Number(payload.valor || 0),
          data: payload.data || "",
          origem: null,
          referenciaId: null,
          editavel: true,
        };

        return {
          ...draft,
          financeiro: upsertById(draft.financeiro, nextItem),
        };
      },
    );
  }

  async function removeFinancialEntry(entryId) {
    return runMutation(
      () =>
        apiRequest(`/api/financial-entries/${entryId}`, {
          method: "DELETE",
        }),
      (draft) => {
        ensurePermission("finance");
        const current = draft.financeiro.find((item) => item.id === entryId);
        if (current?.editavel === false) {
          throw new Error("Altere este lançamento pela operação que o originou.");
        }

        return {
          ...draft,
          financeiro: draft.financeiro.filter((item) => item.id !== entryId),
        };
      },
    );
  }

  async function saveProduct(payload, productId) {
    return runMutation(
      () =>
        apiRequest(productId ? `/api/products/${productId}` : "/api/products", {
          method: productId ? "PUT" : "POST",
          body: payload,
        }),
      (draft) => {
        const nextItem = {
          id: productId || createLocalId("estoque"),
          produto: payload.produto || "",
          categoria: payload.categoria || "",
          quantidade: Number(payload.quantidade || 0),
          minimo: Number(payload.minimo || 0),
          preco: Number(payload.preco || 0),
          marca: payload.marca || "",
        };

        return {
          ...draft,
          estoque: upsertById(draft.estoque, nextItem),
        };
      },
    );
  }

  // Compra é uma operação única: estoque, custo médio, movimento e financeiro.
  async function registerStockPurchase(payload) {
    return runMutation(
      () =>
        apiRequest(`/api/products/${payload.produtoId}/purchases`, {
          method: "POST",
          body: {
            quantidade: payload.quantidade,
            custoUnitario: payload.custoUnitario,
            data: payload.data,
            observacao: payload.observacao,
          },
        }),
      (draft) => {
        ensurePermission("finance");
        return applyStockPurchase(draft, {
          ...payload,
          id: createLocalId("movimento"),
          financeiroId: createLocalId("financeiro"),
        });
      },
    );
  }

  async function removeProduct(productId) {
    return runMutation(
      () =>
        apiRequest(`/api/products/${productId}`, {
          method: "DELETE",
        }),
      (draft) => {
        if (draft.movimentacoesEstoque.some((item) => item.produtoId === productId)) {
          throw new Error("Produtos com movimentações devem ser mantidos no histórico.");
        }

        return {
          ...draft,
          estoque: draft.estoque.filter((item) => item.id !== productId),
        };
      },
    );
  }

  // Adiciona um novo card no quadro interno da Central de Operações.
  async function saveBoardCard(payload) {
    return runMutation(
      () =>
        apiRequest("/api/board-cards", {
          method: "POST",
          body: payload,
        }),
      (draft) => ({
        ...draft,
        boards: draft.boards.map((board) => ({
          ...board,
          cols: board.cols.map((column) =>
            column.id === payload.columnId
              ? {
                  ...column,
                  cards: [
                    ...column.cards,
                    {
                      id: createLocalId("card"),
                      titulo: payload.titulo || "",
                      prioridade: payload.prioridade || "media",
                      responsavelId: payload.responsavelId || null,
                      due: payload.due || null,
                      checks: [],
                      comentarios: [],
                      auto: false,
                    },
                  ],
                }
              : column,
          ),
        })),
      }),
    );
  }

  // Move cards entre colunas e também respeita a ordem dentro de cada coluna.
  async function moveBoardCard(payload) {
    return runMutation(
      () =>
        apiRequest(`/api/board-cards/${payload.cardId}/move`, {
          method: "PATCH",
          body: {
            targetColumnId: payload.targetColumnId,
            targetIndex: payload.targetIndex,
          },
        }),
      (draft) => ({
        ...draft,
        boards: moveCardInBoards(draft.boards, payload),
      }),
    );
  }

  // Mapa enxuto de permissões por perfil para rotas e ações sensíveis.
  function hasPermission(permission) {
    const role = session?.user?.role || "guest";
    const permissionsByRole = {
      admin: new Set(["finance", "reports", "manage_app"]),
      employee: new Set(["manage_app"]),
      owner: new Set(["finance", "reports", "manage_app"]),
      guest: new Set(),
    };

    return permissionsByRole[role]?.has(permission) || false;
  }

  // Define quais telas exigem permissões extras no modo autenticado/demo.
  function canAccessRoute(pathname) {
    if (pathname === "/financeiro") {
      return hasPermission("finance");
    }

    if (pathname === "/relatorios") {
      return hasPermission("reports");
    }

    return true;
  }

  // Reusa a regra de permissão nas mutações locais do modo demo.
  function ensurePermission(permission) {
    if (!hasPermission(permission)) {
      throw new Error("Seu perfil demo nao tem permissao para acessar esta area.");
    }
  }

  const value = {
    appMode,
    demoAccounts: DEMO_ACCOUNTS.map(({ email, password, displayName, role }) => ({
      email,
      password,
      displayName,
      role,
    })),
    data,
    session,
    status,
    authBusy,
    isDark,
    hasPermission,
    canAccessRoute,
    toggleTheme: () => setIsDark((current) => !current),
    sidebarCollapsed,
    toggleSidebar: () => setSidebarCollapsed((current) => !current),
    notifOpen,
    toggleNotif: () => setNotifOpen((current) => !current),
    closeNotif: () => setNotifOpen(false),
    modal,
    openModal: setModal,
    closeModal: () => setModal(null),
    toasts,
    pushToast,
    dismissToast: (id) =>
      setToasts((current) => current.filter((toast) => toast.id !== id)),
    signIn,
    signUp,
    signOut,
    refreshAppState,
    saveGoal,
    saveAppointment,
    updateAppointmentStatus,
    saveCustomer,
    removeCustomer,
    saveEmployee,
    saveFinancialEntry,
    removeFinancialEntry,
    saveProduct,
    registerStockPurchase,
    removeProduct,
    saveBoardCard,
    moveBoardCard,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);

  if (!context) {
    // Força uso correto do hook sempre dentro do provider.
    throw new Error("useApp must be used within AppProvider");
  }

  return context;
}

// Recupera a sessão demo persistida entre refreshes do navegador.
function readDemoSession() {
  try {
    const stored = window.localStorage.getItem(DEMO_SESSION_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    return JSON.parse(stored);
  } catch {
    return null;
  }
}

// Persiste a sessão demo no navegador para manter o usuário logado.
function persistDemoSession(session) {
  window.localStorage.setItem(DEMO_SESSION_STORAGE_KEY, JSON.stringify(session));
}

function clearDemoSession() {
  window.localStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
}

// Recupera a base mockada local; se não existir nada salvo, usa os seeds iniciais.
function readDemoData() {
  try {
    const stored = window.localStorage.getItem(DEMO_DATA_STORAGE_KEY);
    if (!stored) {
      return initialData;
    }

    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object" ? parsed : initialData;
  } catch {
    return initialData;
  }
}

// Mantém o snapshot do modo demo sincronizado com cada mutação.
function persistDemoData(data) {
  window.localStorage.setItem(DEMO_DATA_STORAGE_KEY, JSON.stringify(data));
}

// Monta o formato de sessão que o restante da app espera consumir.
function createDemoSession(account) {
  return {
    user: {
      id: account.id,
      shopId: DEMO_SHOP.id,
      displayName: account.displayName,
      email: account.email,
      role: account.role,
      shopName: DEMO_SHOP.name,
    },
  };
}

// Faz insert/update pelo id sem duplicar lógica em cada entidade.
function upsertById(items, nextItem) {
  const index = items.findIndex((item) => item.id === nextItem.id);
  if (index === -1) {
    return [nextItem, ...items];
  }

  return items.map((item) => (item.id === nextItem.id ? { ...item, ...nextItem } : item));
}

// Gera ids locais quando o fluxo está rodando sem backend real.
function createLocalId(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Usa as iniciais como fallback visual para avatares sem imagem.
function createInitials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

// Replica no modo demo a mesma movimentação de cards que a API faz no banco.
function moveCardInBoards(boards, payload) {
  const nextBoards = boards.map((board) => ({
    ...board,
    cols: board.cols.map((column) => ({
      ...column,
      cards: [...column.cards],
    })),
  }));

  let movingCard = null;

  for (const board of nextBoards) {
    for (const column of board.cols) {
      const cardIndex = column.cards.findIndex((item) => item.id === payload.cardId);
      if (cardIndex === -1) {
        continue;
      }

      movingCard = column.cards.splice(cardIndex, 1)[0];
      break;
    }

    if (movingCard) {
      break;
    }
  }

  if (!movingCard) {
    return boards;
  }

  for (const board of nextBoards) {
    for (const column of board.cols) {
      if (column.id !== payload.targetColumnId) {
        continue;
      }

      // Garante que o índice final fique sempre dentro do intervalo válido da coluna.
      const targetIndex = Math.max(
        0,
        Math.min(Number(payload.targetIndex) || 0, column.cards.length),
      );
      column.cards.splice(targetIndex, 0, movingCard);
      return nextBoards;
    }
  }

  return boards;
}
