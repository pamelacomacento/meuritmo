"use client";

import { FormEvent, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();

    setLoading(true);
    setError("");
    setMessage("");

    if (!email.trim()) {
      setError("Digite seu e-mail.");
      setLoading(false);
      return;
    }

    try {
      const redirectTo = `${window.location.origin}/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo,
        }
      );

      if (error) {
        setError(error.message);
        return;
      }

      setMessage(
        "Se existir uma conta com esse e-mail, enviamos um link para redefinir sua senha. Confira também a pasta de spam."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f2ec] px-4 py-8 text-[#24364b]">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[440px] items-center justify-center">
        <section className="w-full rounded-[30px] border border-[#e6dfd6] bg-[#fffdf9] p-6 shadow-sm">
          <div className="mb-8">
            <a
              href="/login"
              className="text-xs font-semibold text-[#53677d] hover:underline"
            >
              ← Voltar para entrar
            </a>

            <h1 className="mt-6 text-3xl font-semibold tracking-tight">
              Esqueci minha senha
            </h1>

            <p className="mt-2 text-sm leading-6 text-[#7e8790]">
              Digite o e-mail da sua conta e enviaremos um link para você criar
              uma nova senha.
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
              {loading ? "Enviando..." : "Enviar link"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
