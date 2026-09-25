import { useState } from "react";

export function AuthPage({ onLogin, onRegister, busy, appMode, demoAccounts }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    shopName: "",
    displayName: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    try {
      if (mode === "login") {
        await onLogin({
          email: form.email,
          password: form.password,
        });
        return;
      }

      await onRegister(form);
    } catch (submissionError) {
      setError(submissionError.message || "Nao foi possivel autenticar.");
    }
  }

  function updateField(field) {
    return (event) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
    };
  }

  function applyDemoAccount(account) {
    setForm((current) => ({
      ...current,
      email: account.email,
      password: account.password,
    }));
    setMode("login");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background:
          "radial-gradient(circle at top left, rgba(255,107,43,.22), transparent 28%), var(--bg)",
      }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 560 }}>
        <div className="card-hd">
          <span className="card-title">
            {mode === "login" ? "Entrar no Frontdex" : "Criar conta"}
          </span>
          <div className="row" style={{ gap: 6 }}>
            <button
              className={`btn btn-sm ${mode === "login" ? "btn-primary" : ""}`}
              onClick={() => setMode("login")}
              type="button"
            >
              Login
            </button>
            {appMode === "demo" ? null : (
              <button
                className={`btn btn-sm ${mode === "register" ? "btn-primary" : ""}`}
                onClick={() => setMode("register")}
                type="button"
              >
                Cadastro
              </button>
            )}
          </div>
        </div>

        <div className="card-bd">
          {appMode === "demo" ? (
            <div
              style={{
                marginBottom: 18,
                borderRadius: 14,
                padding: 14,
                border: "1px solid rgba(255,184,46,.35)",
                background: "rgba(255,184,46,.1)",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                Modo demo ativo
              </div>
              <div style={{ fontSize: 12.5, color: "var(--txt2)", marginBottom: 12 }}>
                O banco ainda nao foi conectado. Os 3 logins abaixo ja estao liberados para validar o MVP.
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                {demoAccounts.map((account) => (
                  <div
                    key={account.email}
                    style={{
                      border: "1px solid var(--brd)",
                      background: "var(--surface)",
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        flexWrap: "wrap",
                        marginBottom: 8,
                      }}
                    >
                      <strong style={{ fontSize: 13 }}>
                        {account.displayName} ·{" "}
                        {account.role === "admin" ? "ADM" : "FUNCIONARIO"}
                      </strong>
                      <button className="btn btn-sm" onClick={() => applyDemoAccount(account)} type="button">
                        Usar este login
                      </button>
                    </div>
                    <div style={{ display: "grid", gap: 6, fontSize: 12.5 }}>
                      <div>
                        <strong>E-mail:</strong> {account.email}
                      </div>
                      <div>
                        <strong>Senha:</strong> {account.password}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <form onSubmit={handleSubmit}>
            {mode === "register" ? (
              <>
                <div className="form-field">
                  <label className="lbl">Nome da barbearia</label>
                  <input className="inp" onChange={updateField("shopName")} value={form.shopName} />
                </div>
                <div className="form-field">
                  <label className="lbl">Seu nome</label>
                  <input className="inp" onChange={updateField("displayName")} value={form.displayName} />
                </div>
              </>
            ) : null}

            <div className="form-field">
              <label className="lbl">E-mail</label>
              <input className="inp" onChange={updateField("email")} type="email" value={form.email} />
            </div>

            <div className="form-field">
              <label className="lbl">Senha</label>
              <input className="inp" onChange={updateField("password")} type="password" value={form.password} />
            </div>

            {mode === "register" ? (
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
                Use uma senha com 10+ caracteres, letras maiusculas, minusculas e numeros.
              </div>
            ) : null}

            {error ? (
              <div
                style={{
                  marginBottom: 16,
                  borderRadius: 12,
                  padding: "12px 14px",
                  border: "1px solid var(--red)",
                  background: "rgba(255, 80, 80, 0.12)",
                  color: "var(--red)",
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            ) : null}

            <button className="btn btn-primary" disabled={busy} style={{ width: "100%" }} type="submit">
              {busy
                ? "Processando..."
                : mode === "login"
                  ? "Entrar"
                  : "Criar conta e carregar a barbearia"}
            </button>

            {appMode === "demo" ? (
              <div style={{ marginTop: 12, fontSize: 12, color: "var(--muted)" }}>
                As credenciais demo estao listadas acima e o botao "Usar este login" preenche o formulario automaticamente.
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}
