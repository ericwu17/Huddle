import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useProcedure, useSpacetimeDB } from "spacetimedb/react";
import { procedures } from "../module_bindings";
import { useAccount } from "../accountData";
import { clearAccountBrowserState } from "../session";
import { useRun } from "../useRun";
import AccountStatus from "../components/AccountStatus";
import { Buddy } from "../doodle/Doodle";

export default function Login() {
  const { isActive } = useSpacetimeDB();
  const account = useAccount();
  const login = useProcedure(procedures.loginAccount);
  const register = useProcedure(procedures.registerAccount);
  const { run, busy, error } = useRun();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState(params.get("username") ?? "");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const requestedReturn = params.get("returnTo") ?? "";
  const returnTo = /^\/invite\/[A-Za-z0-9_-]+$/.test(requestedReturn) ? requestedReturn : "/start";
  return <main className="page space-y-5">
    <Link className="logo" to="/start">huddle</Link>
    <div className="flex items-center gap-4"><Buddy who={displayName || username || "Welcome"} pose="wave" size={100} crown />
      <h1 className="shout text-[48px]">Your people.<br />Your huddles.</h1></div>
    {account ? <><AccountStatus />{returnTo !== "/start" ? <Link className="btn btn-sun" to={returnTo}>Continue to your invitation</Link> : null}<p className="on-sky">Sign out before switching accounts.</p></> :
      <section className="card space-y-4">
        <div className="flex flex-wrap gap-3" aria-label="Account action">
          <button className={`btn ${mode === "login" ? "btn-primary" : ""}`} disabled={busy} aria-pressed={mode === "login"} onClick={() => setMode("login")}>Sign in</button>
          <button className={`btn ${mode === "register" ? "btn-primary" : ""}`} disabled={busy} aria-pressed={mode === "register"} onClick={() => setMode("register")}>Create account</button>
        </div>
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); void run(async () => {
          try {
            const result = mode === "register" ? await register({ username, password, displayName }) : await login({ username, password });
            if (!result.ok) throw new Error(result.message);
            clearAccountBrowserState(false);
            window.location.replace(returnTo);
          } finally { setPassword(""); }
        }); }}>
          <label className="block font-bold" htmlFor="account-username">Username</label>
          <input id="account-username" className="input" autoComplete="username" autoCapitalize="none" spellCheck={false}
            minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" required value={username} onChange={e => setUsername(e.target.value)} />
          <p className="muted">3–24 letters, numbers or underscores. Usernames ignore letter case.</p>
          {mode === "register" ? <><label className="block font-bold" htmlFor="account-name">Display name</label>
            <input id="account-name" className="input" autoComplete="nickname" required maxLength={40}
              value={displayName} onChange={e => setDisplayName(e.target.value)} /></> : null}
          <label className="block font-bold" htmlFor="account-password">Password</label>
          <div className="password-field"><input id="account-password" className="input" type={showPassword ? "text" : "password"} required minLength={8} maxLength={128}
            autoComplete={mode === "register" ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} />
            <button className="password-toggle" type="button" aria-controls="account-password" aria-pressed={showPassword} onClick={() => setShowPassword(v => !v)}>{showPassword ? "Hide password" : "Show password"}</button></div>
          <p className="muted">At least 8 characters. Use a unique demo password. Password reset is not available yet.</p>
          {!isActive || account === undefined ? <p role="status">Connecting to Huddle…</p> : null}
          <button className="btn btn-primary w-full" disabled={busy || !isActive || account === undefined}>
            {busy ? "Please wait…" : mode === "register" ? "Create my account" : "Sign in to Huddle"}
          </button>
          {error ? <p className="error" role="alert">{error}</p> : null}
        </form>
      </section>}
    <p className="on-sky"><Link className="underline" to="/start">Back to Huddle</Link></p>
  </main>;
}
