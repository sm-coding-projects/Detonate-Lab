import { useState } from "react";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import { COLORS, MONO } from "../lib/theme";

export function AuthScreen() {
  const { config, login, register } = useAuth();
  const allowReg = config?.allow_registration ?? true;
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (isRegister) await register(email.trim(), password);
      else await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: "1px solid rgba(26,25,21,0.26)",
    borderRadius: 4,
    background: "transparent",
    padding: "14px 16px",
    fontFamily: MONO,
    fontSize: 13.5,
    color: COLORS.ink,
    outline: "none",
  };

  return (
    <div style={{ flex: 1, overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 420, padding: "40px 32px" }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 12,
            color: COLORS.mut,
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 26,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#3E7A4E" }} />
          Sandbox online — authentication required
        </div>
        <h1 style={{ fontSize: 32, lineHeight: 1.1, fontWeight: 500, letterSpacing: "-0.025em", margin: 0 }}>
          {isRegister ? "Create your analyst account." : "Sign in to Detonate Lab."}
        </h1>
        <p style={{ margin: "14px 0 30px", fontSize: 14.5, lineHeight: 1.6, color: COLORS.faint }}>
          {isRegister
            ? "Set up access to the isolated detonation environment."
            : "Access the isolated, read-only malware detonation environment."}
        </p>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
          <input
            type="password"
            required
            minLength={isRegister ? 12 : undefined}
            autoComplete={isRegister ? "new-password" : "current-password"}
            placeholder={isRegister ? "Password (min 12 characters)" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
          {error && (
            <div style={{ fontFamily: MONO, fontSize: 12, color: COLORS.hot, lineHeight: 1.5 }}>{error}</div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="submit-btn"
            style={{
              cursor: busy ? "default" : "pointer",
              fontSize: 14,
              fontWeight: 500,
              color: COLORS.bg,
              background: COLORS.ink,
              border: "none",
              borderRadius: 4,
              padding: "15px 22px",
              marginTop: 4,
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? "Working…" : isRegister ? "Create account" : "Sign in"}
          </button>
        </form>

        {allowReg && (
          <div style={{ marginTop: 22, fontSize: 13.5, color: COLORS.faint }}>
            {isRegister ? "Already have an account?" : "Need an account?"}{" "}
            <button
              className="text-link"
              onClick={() => {
                setMode(isRegister ? "login" : "register");
                setError(null);
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: COLORS.ink,
                textDecoration: "underline",
                textUnderlineOffset: 4,
                fontSize: 13.5,
                padding: 0,
              }}
            >
              {isRegister ? "Sign in" : "Create one"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
