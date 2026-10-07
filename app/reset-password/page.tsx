"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError(
          "Este link de recuperação é inválido ou expirou. Solicite um novo link."
        );
      }

      setCheckingSession(false);
    };

    checkSession();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();

    setError("");
    setMessage("");

    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas não são iguais.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      setMessage("Senha alterada com sucesso! Você já pode entrar.");

      setPassword("");
      setConfirmPassword("");

      setTimeout(() => {
        router.replace("/login");
      }, 1800);
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="min-h-screen bg-[#f6f2ec] px-4 py-8 text-[#24364b]">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[440px] items-center justify-center">
          <div className="text-sm text-[#7e8790]">
            Verificando o link...
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f2ec] px-4 py-8 text-[#24364b]">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[440px] items-center justify-center">
        <section className="w-full rounded-[30px] border border-[#e6dfd6] bg-[#fffdf9] p-6 shadow-sm">
          <div className="mb-8">
            <h1 className="text-3xl font-semibold tracking-tight">
              Criar nova senha
            </h1>

            <p className="mt-2 text-sm leading-6 text-[#7e8790]">
              Escolha uma nova senha para sua conta.
            </p>
          </div>

          {!error || !password ? (
            <form onSubmit={submit} className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs font-bold">
                  Nova senha
                </span>

                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo de 6 caracteres"
                  className="w-full rounded-2xl border border-[#ddd7cf] bg-white px-4 py-3 text-base outline-none focus:border-[#24364b]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-bold">
                  Confirmar nova senha
                </span>

                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Digite novamente"
                  className="w-full rounded-2xl border border-[#ddd7cf] bg-white px-4 py-3 text-base outline-none focus:border-[#24364b]"
                />
              </label>

              {error && (
                <div className="rounded-2xl bg-[#f7e9e5] px-4 py-3 text-sm leading-5 text-[#9b5f54]">
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
                {loading ? "Salvando..." : "Alterar senha"}
              </button>
            </form>
          ) : (
            <div>
              <div className="rounded-2xl bg-[#f7e9e5] px-4 py-3 text-sm leading-5 text-[#9b5f54]">
                {error}
              </div>

              <a
                href="/forgot-password"
                className="mt-4 block w-full rounded-2xl bg-[#24364b] px-4 py-3.5 text-center text-sm font-bold text-white"
              >
                Solicitar novo link
              </a>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
