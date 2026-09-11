import { supabase } from "./supabase";

export async function ensureAnonymousUser() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    console.log("USUARIO SUPABASE:", session.user.id);
    return session.user;
  }

  const { data, error } = await supabase.auth.signInAnonymously();

  if (error) {
    console.error("Erro ao criar usuário anônimo:", error);
    return null;
  }

  console.log("USUARIO SUPABASE:", data.user?.id);

  return data.user;
}