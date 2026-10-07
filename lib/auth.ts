import { supabase } from "./supabase";

export async function ensureAnonymousUser() {
  let {
    data: { session },
  } = await supabase.auth.getSession();

  // Se a sessão ainda não estiver disponível no primeiro carregamento,
  // tenta renová-la antes de considerar o usuário desconectado.
  if (!session) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session ?? null;
  }

  if (session && !session.user.is_anonymous) {
    return session.user;
  }

  if (session?.user?.is_anonymous) {
    await supabase.auth.signOut({ scope: "local" });
  }

  if (typeof window !== "undefined") {
    window.location.replace("/login");
  }

  return null;
}

export async function signOutUser() {
  await supabase.auth.signOut({ scope: "local" });

  if (typeof window !== "undefined") {
    window.location.replace("/login");
  }
}
