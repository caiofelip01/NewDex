import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppProvider } from "./context/AppContext";
import { useApp } from "./context/AppContext";
import { AppShell } from "./Components/AppShell";
import { AgendaPage } from "./Pages/AgendaPage";
import { AuthPage } from "./Pages/AuthPage";
import { CentralPage } from "./Pages/CentralPage";
import { ChatPage } from "./Pages/ChatPage";
import { ClientesPage } from "./Pages/ClientesPage";
import { DashboardPage } from "./Pages/DashboardPage";
import { EquipePage } from "./Pages/EquipePage";
import { FinanceiroPage } from "./Pages/FinanceiroPage";
import { EstoquePage } from "./Pages/EstoquePage";
import { RelatoriosPage } from "./Pages/RelatoriosPage";

// Encapsula a aplicação inteira no provider global de estado.
export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

// Decide entre loading, autenticação e app principal com base na sessão.
function AppContent() {
  const { session, status, authBusy, signIn, signUp, appMode, demoAccounts, canAccessRoute, pushToast } = useApp();

  if (status === "loading") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "var(--bg)",
          color: "var(--txt)",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        Carregando Frontdex...
      </div>
    );
  }

  if (!session) {
    return (
      <AuthPage
        appMode={appMode}
        busy={authBusy}
        demoAccounts={demoAccounts}
        onLogin={signIn}
        onRegister={signUp}
      />
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/agenda" element={<AgendaPage />} />
        <Route
          path="/financeiro"
          element={
            <RouteAccessGuard canAccess={canAccessRoute("/financeiro")} onBlocked={pushToast}>
              <FinanceiroPage />
            </RouteAccessGuard>
          }
        />
        <Route path="/clientes" element={<ClientesPage />} />
        <Route path="/estoque" element={<EstoquePage />} />
        <Route path="/equipe" element={<EquipePage />} />
        <Route path="/central" element={<CentralPage />} />
        <Route
          path="/relatorios"
          element={
            <RouteAccessGuard canAccess={canAccessRoute("/relatorios")} onBlocked={pushToast}>
              <RelatoriosPage />
            </RouteAccessGuard>
          }
        />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  );
}

// Bloqueia rotas protegidas e avisa o usuário quando o perfil não pode acessá-las.
function RouteAccessGuard({ children, canAccess, onBlocked }) {
  useEffect(() => {
    if (!canAccess) {
      // O toast é disparado no efeito para evitar side effect durante o render.
      onBlocked("Seu perfil nao pode acessar essa rota no modo demo.", "err");
    }
  }, [canAccess, onBlocked]);

  if (!canAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
