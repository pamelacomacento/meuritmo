"use client";

import { useEffect } from "react";
import { supabase } from "../lib/supabase";

const STORAGE_KEY = "meu-ritmo-v2.3";
const LOCAL_POLL_MS = 1000;
const CLOUD_POLL_MS = 5000;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = stableValue((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  return value;
}

function stableStringify(value: unknown) {
  return JSON.stringify(stableValue(value));
}

function parseState(raw: string | null) {
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function CloudSync() {
  useEffect(() => {
    let stopped = false;
    let localTimer: ReturnType<typeof setInterval> | null = null;
    let cloudTimer: ReturnType<typeof setInterval> | null = null;

    let userId = "";
    let lastLocalCanonical = "";
    let lastCloudUpdatedAt = "";
    let uploading = false;
    let checkingCloud = false;

    const uploadLocalState = async (raw: string) => {
      if (!userId || uploading || stopped) return;

      const parsed = parseState(raw);
      if (!parsed) return;

      uploading = true;

      try {
        const now = new Date().toISOString();

        const { data, error } = await supabase
          .from("app_state")
          .upsert(
            {
              user_id: userId,
              state: parsed,
              updated_at: now,
            },
            { onConflict: "user_id" }
          )
          .select("updated_at")
          .single();

        if (!error && data?.updated_at) {
          lastCloudUpdatedAt = data.updated_at;
        }
      } finally {
        uploading = false;
      }
    };

    const checkLocalChanges = async () => {
      if (stopped || !userId) return;

      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = parseState(raw);
      if (!raw || !parsed) return;

      const canonical = stableStringify(parsed);

      if (canonical === lastLocalCanonical) return;

      lastLocalCanonical = canonical;
      await uploadLocalState(raw);
    };

    const checkCloudChanges = async () => {
      if (stopped || !userId || checkingCloud || uploading) return;

      checkingCloud = true;

      try {
        const { data, error } = await supabase
          .from("app_state")
          .select("state, updated_at")
          .eq("user_id", userId)
          .maybeSingle();

        if (error || !data?.state || !data.updated_at) return;

        if (data.updated_at === lastCloudUpdatedAt) return;

        const cloudCanonical = stableStringify(data.state);
        const currentRaw = localStorage.getItem(STORAGE_KEY);
        const currentState = parseState(currentRaw);
        const currentCanonical = currentState
          ? stableStringify(currentState)
          : "";

        lastCloudUpdatedAt = data.updated_at;

        if (cloudCanonical === currentCanonical) {
          lastLocalCanonical = currentCanonical;
          return;
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(data.state));
        lastLocalCanonical = cloudCanonical;

        // O app atual lê o estado no carregamento.
        // Recarregar garante que a alteração remota apareça sem mexer
        // na lógica principal da tela.
        window.location.reload();
      } finally {
        checkingCloud = false;
      }
    };

    const start = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (
        stopped ||
        !session ||
        session.user.is_anonymous
      ) {
        return;
      }

      userId = session.user.id;

      const localRaw = localStorage.getItem(STORAGE_KEY);
      const localState = parseState(localRaw);

      if (localState) {
        lastLocalCanonical = stableStringify(localState);
      }

      const { data, error } = await supabase
        .from("app_state")
        .select("state, updated_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (stopped) return;

      if (!error && data?.state) {
        lastCloudUpdatedAt = data.updated_at || "";

        const cloudCanonical = stableStringify(data.state);
        const localCanonical = localState
          ? stableStringify(localState)
          : "";

        if (cloudCanonical !== localCanonical) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data.state));
          window.location.reload();
          return;
        }
      } else if (localRaw && localState) {
        await uploadLocalState(localRaw);
      }

      localTimer = setInterval(checkLocalChanges, LOCAL_POLL_MS);
      cloudTimer = setInterval(checkCloudChanges, CLOUD_POLL_MS);
    };

    start();

    return () => {
      stopped = true;

      if (localTimer) clearInterval(localTimer);
      if (cloudTimer) clearInterval(cloudTimer);
    };
  }, []);

  return null;
}
