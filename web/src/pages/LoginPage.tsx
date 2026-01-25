import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { login, register } from "../auth/client";
import { useAuth } from "../auth/AuthContext";

export default function LoginPage() {
  const nav = useNavigate();
  const location = useLocation() as any;
  const { state } = location;
  const { refresh } = useAuth();

  const initialMode = (() => {
    if (state?.mode === "register") return "register";
    const params = new URLSearchParams(location.search);
    return params.get("mode") === "register" ? "register" : "login";
  })();
  const [mode, setMode] = useState<"login"|"register">(initialMode);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const redirectTo = state?.from?.pathname || "/";

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("mode") === "register" && mode !== "register") {
      setMode("register");
    }
    if (params.get("mode") !== "register" && mode !== "login" && !state?.mode) {
      setMode("login");
    }
  }, [location.search, mode, state?.mode]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      if (mode === "login") await login(email, password);
      else await register(displayName, email, password);
      await refresh();
      nav(redirectTo, { replace: true });
    } catch (e: any) {
      setErr(e?.message || "Erreur");
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "60px auto", fontFamily: "system-ui,sans-serif" }}>
      <h2>{mode === "login" ? "Connexion" : "Inscription"}</h2>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
        {mode === "register" && (
          <input
            placeholder="Nom"
            value={displayName}
            onChange={e=>setDisplayName(e.target.value)}
            required
          />
        )}
        <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} type="email" required />
        <input placeholder="Mot de passe" value={password} onChange={e=>setPassword(e.target.value)} type="password" required />
        {err && <div style={{ color:"#b00" }}>{err}</div>}
        <button type="submit">{mode === "login" ? "Se connecter" : "Créer un compte"}</button>
      </form>
      <button onClick={()=>setMode(m=>m==="login"?"register":"login")} style={{ marginTop: 8 }}>
        {mode === "login" ? "Pas de compte ? Inscription" : "Déjà inscrit ? Connexion"}
      </button>
    </div>
  );
}
