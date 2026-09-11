"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const check = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session && !session.user.is_anonymous) {
        router.replace("/");
      }
    };

    check();
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      if (!email.trim() || !password) {
        setError("Preencha o e-mail e a senha.");
        return;
      }

      if (password.length < 6) {
        setError("A senha precisa ter pelo menos 6 caracteres.");
        return;
      }

      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (error) {
          setError(error.message);
          return;
        }

        if (data.session) {
          router.replace("/");
          return;
        }

        setMessage(
          "Conta criada. Confira seu e-mail para confirmar o cadastro e depois volte para entrar."
        );
        setMode("login");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setError(
          error.message === "Invalid login credentials"
            ? "E-mail ou senha incorretos."
            : error.message
        );
        return;
      }

      router.replace("/");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f2ec] px-4 py-8 text-[#24364b]">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[440px] items-center justify-center">
        <section className="w-full rounded-[30px] border border-[#e6dfd6] bg-[#fffdf9] p-6 shadow-sm">
          <div className="mb-8">
            <div className="mb-3 inline-flex rounded-full bg-[#24364b]/10 px-3 py-1 text-[11px] font-bold">
              Meu Ritmo
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {mode === "login" ? "Entrar" : "Criar sua conta"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-[#7e8790]">
              {mode === "login"
                ? "Use a mesma conta no celular e no computador."
                : "Crie uma conta para preparar a sincronização entre seus dispositivos."}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-xs font-bold">E-mail</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seuemail@exemplo.com"
                className="w-full rounded-2xl border border-[#ddd7cf] bg-white px-4 py-3 text-base outline-none focus:border-[#24364b]"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-bold">Senha</span>
              <input
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo de 6 caracteres"
                className="w-full rounded-2xl border border-[#ddd7cf] bg-white px-4 py-3 text-base outline-none focus:border-[#24364b]"
              />
            </label>

            {error && (
              <div className="rounded-2xl bg-[#f7e9e5] px-4 py-3 text-sm text-[#9b5f54]">
                {error}
              </div>
            )}

            {message && (
              <div className="rounded-2xl bg-[#e8f1eb] px-4 py-3 text-sm leading-5 text-[#557765]">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-[#24364b] px-4 py-3.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {loading
                ? "Aguarde..."
                : mode === "login"
                ? "Entrar"
                : "Criar conta"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === "login" ? "signup" : "login"));
              setError("");
              setMessage("");
            }}
            className="mt-4 w-full py-2 text-sm font-semibold text-[#53677d]"
          >
            {mode === "login"
              ? "Ainda não tenho conta"
              : "Já tenho uma conta"}
          </button>

          <p className="mt-6 text-center text-[11px] leading-5 text-[#90979e]">
            Seus dados atuais do navegador não serão apagados nesta etapa.
          </p>
        </section>
      </div>
    </main>
  );
}
