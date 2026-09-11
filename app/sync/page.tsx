"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

const STORAGE_KEY = "meu-ritmo-v2.3";

type LocalState = {
  tasks?: unknown[];
  habits?: unknown[];
  ideas?: unknown[];
  categories?: unknown[];
  countdowns?: unknown[];
  [key: string]: unknown;
};

export default function SyncPage() {
  const router = useRouter();
  const [localState, setLocalState] = useState<LocalState | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session || session.user.is_anonymous) {
        router.replace("/login");
        return;
      }

      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        setStatus("Não encontrei dados do Meu Ritmo neste aparelho.");
        return;
      }

      try {
        setLocalState(JSON.parse(raw));
      } catch {
        setStatus("Os dados locais existem, mas não consegui lê-los.");
      }
    };

    load();
  }, [router]);

  const counts = useMemo(
    () => ({
      tasks: Array.isArray(localState?.tasks) ? localState!.tasks!.length : 0,
      habits: Array.isArray(localState?.habits) ? localState!.habits!.length : 0,
      ideas: Array.isArray(localState?.ideas) ? localState!.ideas!.length : 0,
      categories: Array.isArray(localState?.categories)
        ? localState!.categories!.length
        : 0,
      countdowns: Array.isArray(localState?.countdowns)
        ? localState!.countdowns!.length
        : 0,
    }),
    [localState]
  );

  async function sendToCloud() {
    if (!localState || busy) return;

    setBusy(true);
    setStatus("");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        setStatus("Sua sessão expirou. Entre novamente.");
        return;
      }

      const { data: existing, error: readError } = await supabase
        .from("app_state")
        .select("updated_at")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (readError) {
        setStatus(`Não consegui conferir a nuvem: ${readError.message}`);
        return;
      }

      if (existing) {
        const ok = confirm(
          "Já existe um estado salvo na nuvem para esta conta. Quer substituir pelo conteúdo deste aparelho?"
        );
        if (!ok) {
          setStatus("Envio cancelado. Nada foi alterado.");
          return;
        }
      }

      const { error } = await supabase.from("app_state").upsert(
        {
          user_id: session.user.id,
          state: localState,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (error) {
        setStatus(`Não consegui salvar: ${error.message}`);
        return;
      }

      setStatus(
        "Cópia salva na nuvem com sucesso. Os dados deste aparelho continuam intactos."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f2ec] px-4 py-8 text-[#24364b]">
      <div className="mx-auto w-full max-w-[440px]">
        <section className="rounded-[30px] border border-[#e6dfd6] bg-[#fffdf9] p-6 shadow-sm">
          <button
            onClick={() => router.replace("/")}
            className="mb-6 text-sm font-semibold text-[#65768a]"
          >
            ← Voltar
          </button>

          <div className="mb-2 text-[11px] font-bold uppercase tracking-[.14em] text-[#8b939b]">
            Primeira sincronização
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Salvar este aparelho na nuvem
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#7e8790]">
            Nesta etapa fazemos apenas uma cópia dos dados atuais. Nada será apagado
            do iPhone.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-[#f6f2ec] p-3">
              <div className="text-xl font-semibold">{counts.tasks}</div>
              <div className="text-xs text-[#7e8790]">tarefas</div>
            </div>
            <div className="rounded-2xl bg-[#f6f2ec] p-3">
              <div className="text-xl font-semibold">{counts.habits}</div>
              <div className="text-xs text-[#7e8790]">hábitos</div>
            </div>
            <div className="rounded-2xl bg-[#f6f2ec] p-3">
              <div className="text-xl font-semibold">{counts.ideas}</div>
              <div className="text-xs text-[#7e8790]">ideias</div>
            </div>
            <div className="rounded-2xl bg-[#f6f2ec] p-3">
              <div className="text-xl font-semibold">{counts.categories}</div>
              <div className="text-xs text-[#7e8790]">categorias</div>
            </div>
          </div>

          <button
            onClick={sendToCloud}
            disabled={!localState || busy}
            className="mt-6 w-full rounded-2xl bg-[#24364b] px-4 py-3.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "Salvando..." : "Enviar dados deste aparelho"}
          </button>

          {status && (
            <div className="mt-4 rounded-2xl bg-[#f6f2ec] px-4 py-3 text-sm leading-5 text-[#65707b]">
              {status}
            </div>
          )}

          <p className="mt-5 text-[11px] leading-5 text-[#90979e]">
            Depois de confirmar que esta cópia chegou ao Supabase, ativaremos a
            sincronização automática entre celular e computador.
          </p>
        </section>
      </div>
    </main>
  );
}
