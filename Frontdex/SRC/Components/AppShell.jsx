import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

import { useApp } from "../context/AppContext";
import { getReferenceDate, summarizeAppointments } from "../utils/businessMetrics";

const routeMeta = {
  "/dashboard": {
    title: "Dashboard",
    subtitle: "Visão geral da operação",
  },
  "/agenda": {
    title: "Agenda",
    subtitle: "Gestao de agendamentos",
  },
  "/financeiro": {
    title: "Financeiro",
    subtitle: "Controle financeiro completo",
  },
  "/clientes": {
    title: "Clientes",
    subtitle: "Base de clientes e CRM",
  },
  "/estoque": {
    title: "Estoque",
    subtitle: "Controle de produtos",
  },
  "/equipe": {
    title: "Equipe",
    subtitle: "Profissionais e produtividade",
  },
  "/central": {
    title: "Central",
    subtitle: "Tarefas, compras, aprovacoes e rotina",
  },
  "/relatorios": {
    title: "Relatorios",
    subtitle: "Analises e exportacao",
  },
  "/chat": {
    title: "Dex IA",
    subtitle: "Seu assistente para a operacao da barbearia",
  },
};

const navSections = [
  {
    title: "PRINCIPAL",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: "📊" },
      { to: "/agenda", label: "Agenda", icon: "📅" },
      { to: "/financeiro", label: "Financeiro", icon: "💰" },
    ],
  },
  {
    title: "GESTAO",
    items: [
      { to: "/clientes", label: "Clientes", icon: "👥" },
      { to: "/estoque", label: "Estoque", icon: "📦" },
      { to: "/equipe", label: "Equipe", icon: "💈" },
    ],
  },
  {
    title: "OPERACOES",
    items: [{ to: "/central", label: "Central de Operacoes", icon: "🗂️", badge: "NOVO" }],
  },
  {
    title: "INTELIGENCIA",
    items: [
      { to: "/relatorios", label: "Relatorios", icon: "📈" },
      { to: "/chat", label: "Dex IA", icon: "🤖", badge: "IA" },
    ],
  },
];

export function AppShell({ children }) {
  const location = useLocation();
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 900 : false,
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const {
    data,
    session,
    canAccessRoute,
    isDark,
    toggleTheme,
    sidebarCollapsed,
    toggleSidebar,
    notifOpen,
    toggleNotif,
    closeNotif,
    modal,
    closeModal,
    toasts,
    dismissToast,
    signOut,
  } = useApp();

  const referenceDate = getReferenceDate(data);
  const baseMeta = routeMeta[location.pathname] || routeMeta["/dashboard"];
  const meta =
    location.pathname === "/dashboard"
      ? {
          ...baseMeta,
          subtitle: `${session?.user?.shopName || "Barbearia Dex"} · ${formatLongDate(referenceDate)}`,
        }
      : baseMeta;
  const criticalProducts = data.estoque.filter((item) => item.quantidade <= item.minimo);
  const notifications = buildNotifications(data.notifs, criticalProducts);
  const unreadCount = notifications.filter((item) => item.unread).length;
  const agendaCount = summarizeAppointments(data.agenda, referenceDate, "day").pending.length;
  const estoqueCount = criticalProducts.length;
  const centralCount = data.boards.reduce(
    (total, board) =>
      total + board.cols.reduce((colTotal, col) => colTotal + col.cards.length, 0),
    0,
  );

  const countMap = {
    "/agenda": agendaCount,
    "/estoque": estoqueCount,
    "/central": centralCount,
  };
  const userInitials = session?.user?.displayName
    ? session.user.displayName
        .split(" ")
        .slice(0, 2)
        .map((part) => part[0] || "")
        .join("")
        .toUpperCase()
    : "FD";
  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canAccessRoute(item.to)),
    }))
    .filter((section) => section.items.length > 0);
  const roleLabel =
    session?.user?.role === "admin"
      ? "Administrador"
      : session?.user?.role === "employee"
        ? "Funcionario"
        : "Owner";
  const sidebarIsCollapsed = sidebarCollapsed && !isMobile;

  useEffect(() => {
    function syncViewport() {
      const mobile = window.innerWidth <= 900;
      setIsMobile(mobile);
      if (!mobile) {
        setMobileSidebarOpen(false);
      }
    }

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  function handleNavClick() {
    closeNotif();
    if (isMobile) {
      setMobileSidebarOpen(false);
    }
  }

  function handleSidebarToggle() {
    if (isMobile) {
      setMobileSidebarOpen((current) => !current);
      return;
    }

    toggleSidebar();
  }

  return (
    <>
      {isMobile && mobileSidebarOpen ? (
        <button
          aria-label="Fechar menu"
          className="app-backdrop"
          onClick={() => setMobileSidebarOpen(false)}
          type="button"
        />
      ) : null}

      <div className="app">
        <aside
          className={`sidebar ${sidebarIsCollapsed ? "collapsed" : ""} ${isMobile ? "mobile" : ""} ${mobileSidebarOpen ? "show" : ""}`}
        >
          <div className="sb-head">
            <div className="logo-mark">
              <span className="bri">D</span>
            </div>
            <div className="logo-txt">
              <div className="logo-name">
                D<span>e</span>x
              </div>
              <div className="logo-tag">Barbearia</div>
            </div>
            {isMobile ? (
              <button
                aria-label="Fechar menu"
                className="sb-mobile-close"
                onClick={() => setMobileSidebarOpen(false)}
                type="button"
              >
                X
              </button>
            ) : null}
          </div>

          <nav className="nav">
            {visibleSections.map((section) => (
              <div key={section.title}>
                <div className="nav-section">{section.title}</div>
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => `nav-btn ${isActive ? "active" : ""}`}
                    onClick={handleNavClick}
                  >
                    <span className="nav-ico">{item.icon}</span>
                    <span>{item.label}</span>
                    {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
                    {!item.badge && countMap[item.to] ? (
                      <span className="nav-count">{countMap[item.to]}</span>
                    ) : null}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>

          <div className="sb-foot">
            <div className="sb-user">
              <div className="sb-user-avatar">{userInitials}</div>
              <div className="sb-user-meta">
                <div className="sb-user-name">{session?.user?.displayName || "Frontdex"}</div>
                <div className="sb-user-role">{roleLabel}</div>
              </div>
            </div>

            <button className="sb-logout" onClick={signOut} title="Sair e voltar para o login" type="button">
              <span className="sb-logout-ico">⏻</span>
              <span className="sb-logout-label">Sair / trocar conta</span>
            </button>
          </div>

          {isMobile ? null : (
            <button className="sb-toggle" onClick={handleSidebarToggle} type="button">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path
                  d="M10 3L5 8l5 5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </aside>

        <div className="main">
          <div className="topbar">
            <div className="tb-left">
              {isMobile ? (
                <button
                  aria-label="Abrir menu"
                  className="tb-btn tb-menu"
                  onClick={handleSidebarToggle}
                  type="button"
                >
                  ≡
                </button>
              ) : null}

              <div className="tb-copy">
                <div className="tb-title">{meta.title}</div>
                <div className="tb-sub">{meta.subtitle}</div>
              </div>
            </div>

            <div className="tb-spacer" />

            <div className="tb-actions">
              <button className="theme-tog" onClick={toggleTheme} type="button">
                <span>{isDark ? "☀️" : "🌙"}</span>
                <span>{isDark ? "Claro" : "Escuro"}</span>
              </button>

              <button className="tb-btn" onClick={toggleNotif} title="Notificacoes" type="button">
                🔔
                {unreadCount ? <span className="tb-dot" /> : null}
              </button>
            </div>
          </div>

          <div className={`content ${location.pathname === "/chat" ? "nopad" : ""}`}>{children}</div>
        </div>
      </div>

      <div className={`notif-panel ${notifOpen ? "show" : ""}`}>
        <div className="notif-tabs">
          {["Todas", "Dex", "Sistema", "Pendencias", "Equipe", "Mercado"].map((item) => (
            <button key={item} className={`notif-tab ${item === "Todas" ? "active" : ""}`} type="button">
              {item}
            </button>
          ))}
        </div>
        <div className="notif-list">
          {notifications.map((notif) => (
            <div key={notif.id} className={`notif-item ${notif.unread ? "unread" : ""}`}>
              <div className="notif-ico" style={{ background: `${notif.cor}1f` }}>
                {notif.ico}
              </div>
              <div className="notif-c">
                <div className="t">{notif.titulo}</div>
                <div className="d">{notif.descricao}</div>
                <div className="tm">{notif.tempo}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {modal ? (
        <div
          className="modal-bg show"
          onClick={(event) => (event.target === event.currentTarget ? closeModal() : null)}
        >
          <div className={`modal ${modal.wide ? "wide" : ""}`}>
            <div className="modal-hd">
              <h3>{modal.title}</h3>
              <button className="modal-x" onClick={closeModal} type="button">
                ✕
              </button>
            </div>
            <div className="modal-bd">{modal.content}</div>
            {modal.footer ? <div className="modal-ft">{modal.footer}</div> : null}
          </div>
        </div>
      ) : null}

      <div className="toasts">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast ${toast.type === "err" ? "err" : toast.type === "info" ? "info" : ""}`}
            onClick={() => dismissToast(toast.id)}
          >
            <span style={{ fontSize: 16 }}>
              {toast.type === "err" ? "⚠️" : toast.type === "info" ? "ℹ️" : "✓"}
            </span>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function formatLongDate(dateKey) {
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  if (!year || !month || !day) {
    return "Data atual";
  }

  const label = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function buildNotifications(items, criticalProducts) {
  const notifications = Array.isArray(items) ? items : [];
  const isStockAlert = (item) =>
    item.id === "n2" || /estoque cr[ií]tico/i.test(String(item.titulo || ""));
  const existingStockNotification = notifications.find(isStockAlert);
  const remaining = notifications.filter((item) => !isStockAlert(item));

  if (!criticalProducts.length) {
    return remaining;
  }

  return [
    {
      ...(existingStockNotification || {}),
      id: existingStockNotification?.id || "stock-critical",
      cat: "sistema",
      ico: "⚠️",
      cor: "#FF5050",
      titulo: "Estoque crítico",
      descricao: `${criticalProducts.map((item) => item.produto).join(", ")} abaixo ou no mínimo.`,
      tempo: existingStockNotification?.tempo || "agora",
      unread: existingStockNotification?.unread ?? true,
    },
    ...remaining,
  ];
}
