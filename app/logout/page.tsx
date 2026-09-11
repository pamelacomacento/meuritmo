"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    const logout = async () => {
      await supabase.auth.signOut();
      router.replace("/login");
    };

    logout();
  }, [router]);

  return (
    <main className="min-h-screen bg-[#f6f2ec] px-4 py-8 text-[#24364b]">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[440px] items-center justify-center">
        <div className="rounded-3xl border border-[#e6dfd6] bg-[#fffdf9] px-6 py-5 text-center">
          <div className="text-sm font-semibold">Saindo...</div>
          <p className="mt-2 text-xs text-[#7e8790]">
            Seus dados locais não serão apagados.
          </p>
        </div>
      </div>
    </main>
  );
}
