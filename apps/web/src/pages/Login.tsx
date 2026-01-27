import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../lib/auth";
import { startAuthentication } from "@simplewebauthn/browser";
import { API_BASE_URL } from "../lib/api";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorToken, setTwoFactorToken] = useState("");
  const [requires2FA, setRequires2FA] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isPasskeyLogin, setIsPasskeyLogin] = useState(false);

  const handlePasskeyLogin = async () => {
    setError("");
    setLoading(true);
    setIsPasskeyLogin(true);

    try {
      const optionsRes = await fetch(
        `${API_BASE_URL}/passkeys/authenticate/options`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email || undefined })
        }
      );

      if (!optionsRes.ok) {
        throw new Error("Failed to get authentication options");
      }

      const options = await optionsRes.json();
      const asseResp = await startAuthentication(options);

      const verifyRes = await fetch(
        `${API_BASE_URL}/passkeys/authenticate/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            response: asseResp,
            challengeId: options.challengeId
          })
        }
      );

      if (!verifyRes.ok) {
        const errData = await verifyRes.json();
        throw new Error(errData.message || "Authentication failed");
      }

      const data = await verifyRes.json();
      localStorage.setItem("edge_monitoring_token", data.token);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Passkey authentication failed");
    } finally {
      setLoading(false);
      setIsPasskeyLogin(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password, twoFactorToken || undefined);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Login failed";

      if (errorMessage.includes("Two-factor authentication") || errorMessage.includes("2fa-required")) {
        setRequires2FA(true);
        setError("Please enter your 2FA code");
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-obsidian-950 grid-bg px-4">
      {/* Ambient effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-neon-cyan/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-neon-violet/5 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        className="relative w-full max-w-md"
      >
        {/* Card */}
        <div className="rounded-2xl border border-slate-700/50 bg-obsidian-900/80 backdrop-blur-xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="mb-8 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
              className="inline-flex h-16 w-16 items-center justify-center mb-4"
            >
              <div className="relative flex h-14 w-14 items-center justify-center">
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-neon-cyan to-neon-emerald opacity-20 blur-sm" />
                <div className="relative flex h-14 w-14 items-center justify-center rounded-xl border border-neon-cyan/30 bg-obsidian-800">
                  <svg className="h-8 w-8 text-neon-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                </div>
              </div>
            </motion.div>
            <h1 className="font-display text-2xl font-bold text-white">
              Edge<span className="text-neon-cyan">Monitor</span>
            </h1>
            <p className="mt-2 text-sm text-slate-400">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl bg-neon-rose/10 border border-neon-rose/30 px-4 py-3 text-sm text-neon-rose"
              >
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {error}
                </div>
              </motion.div>
            )}

            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={requires2FA}
                  className="block w-full rounded-xl border border-slate-700/50 bg-obsidian-800 pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 transition-all focus:border-neon-cyan/50 focus:ring-2 focus:ring-neon-cyan/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                </div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={requires2FA}
                  className="block w-full rounded-xl border border-slate-700/50 bg-obsidian-800 pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 transition-all focus:border-neon-cyan/50 focus:ring-2 focus:ring-neon-cyan/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Enter your password"
                />
              </div>
            </div>

            {requires2FA && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="space-y-2"
              >
                <label htmlFor="twoFactorToken" className="block text-sm font-medium text-slate-300">
                  Two-Factor Code
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  </div>
                  <input
                    id="twoFactorToken"
                    type="text"
                    value={twoFactorToken}
                    onChange={(e) => setTwoFactorToken(e.target.value)}
                    required
                    maxLength={6}
                    className="block w-full rounded-xl border border-slate-700/50 bg-obsidian-800 pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 transition-all focus:border-neon-cyan/50 focus:ring-2 focus:ring-neon-cyan/20 font-mono tracking-widest text-center"
                    placeholder="000000"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-slate-500">
                  Enter the 6-digit code from your authenticator app
                </p>
              </motion.div>
            )}

            <motion.button
              type="submit"
              disabled={loading}
              className="relative w-full overflow-hidden rounded-xl bg-neon-cyan px-4 py-3 text-sm font-semibold text-obsidian-950 transition-all hover:bg-neon-cyan/90 focus:outline-none focus:ring-2 focus:ring-neon-cyan/50 focus:ring-offset-2 focus:ring-offset-obsidian-900 disabled:cursor-not-allowed disabled:opacity-50"
              whileTap={{ scale: 0.98 }}
            >
              {loading && !isPasskeyLogin ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                "Sign in"
              )}
            </motion.button>

            {!requires2FA && (
              <>
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-700/50" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="bg-obsidian-900 px-3 text-slate-500">Or continue with</span>
                  </div>
                </div>

                <motion.button
                  type="button"
                  onClick={handlePasskeyLogin}
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-700/50 bg-obsidian-800 px-4 py-3 text-sm font-medium text-slate-300 transition-all hover:bg-slate-800 hover:border-slate-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-neon-cyan/30 disabled:cursor-not-allowed disabled:opacity-50"
                  whileTap={{ scale: 0.98 }}
                >
                  <svg className="h-5 w-5 text-neon-violet" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                  </svg>
                  {loading && isPasskeyLogin ? "Authenticating..." : "Sign in with Passkey"}
                </motion.button>
              </>
            )}

            {requires2FA && (
              <button
                type="button"
                onClick={() => {
                  setRequires2FA(false);
                  setTwoFactorToken("");
                  setError("");
                }}
                className="w-full text-sm text-slate-400 hover:text-neon-cyan transition-colors"
              >
                Use different account
              </button>
            )}
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate-600">
          Secure infrastructure monitoring
        </p>
      </motion.div>
    </div>
  );
}
