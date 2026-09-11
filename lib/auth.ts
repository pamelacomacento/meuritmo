import { supabase } from "./supabase";

export async function ensureAnonymousUser() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session && !session.user.is_anonymous) {
    return session.user;
  }

  if (session?.user?.is_anonymous) {
    await supabase.auth.signOut();
  }

  if (typeof window !== "undefined") {
    window.location.replace("/login");
  }

  return null;
}

export async function signOutUser() {
  await supabase.auth.signOut();

  if (typeof window !== "undefined") {
    window.location.replace("/login");
  }
}
