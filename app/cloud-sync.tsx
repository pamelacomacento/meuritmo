"use client";

import { useEffect } from "react";
import { supabase } from "../lib/supabase";

const STORAGE_KEY = "meu-ritmo-v2.3";
const SESSION_RETRY_MS = 1000;
const SESSION_RETRY_LIMIT = 30;
const CLOUD_POLL_MS = 5000;

function parseState(raw: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = stableValue((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }
  return value;
}

function stableStringify(value: unknown) {
  return JSON.stringify(stableValue(value));
}

function hasRealUserData(state: any) {
  return Boolean(
    state &&
      ((Array.isArray(state.tasks) && state.tasks.length) ||
        (Array.isArray(state.habits) && state.habits.length) ||
        (Array.isArray(state.ideas) && state.ideas.length) ||
        (Array.isArray(state.countdowns) && state.countdowns.length))
  );
}

export default function CloudSync() {
  useEffect(() => {
    let stopped = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let cloudTimer: ReturnType<typeof setInterval> | null = null;
    let startedUserId: string | null = null;

    const loadCloudState = async (userId: string) => {
      if (stopped) return null;

      const { data, error } = await supabase
        .from("app_state")
        .select("data, updated_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("[Agendinha] erro ao ler app_state:", error);
        return null;
      }

      return data?.data ?? null;
    };

    const saveLocalToCloud = async (userId: string, state: any) => {
      if (stopped || !state) return;

      const { error } = await supabase
        .from("app_state")
        .upsert(
          {
            user_id: userId,
            data: state,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (error) {
        console.error("[Agendinha] erro ao salvar app_state:", error);
      }
    };

    const applyCloudState = (cloudState: any) => {
      if (!cloudState || stopped) return;

      const cloudRaw = JSON.stringify(cloudState);
      const localState = parseState(localStorage.getItem(STORAGE_KEY));

      if (stableStringify(localState) === stableStringify(cloudState)) return;

      localStorage.setItem(STORAGE_KEY, cloudRaw);
      window.dispatchEvent(new CustomEvent("meu-ritmo-cloud-loaded"));
      window.location.reload();
    };

    const sync = async (userId: string) => {
      const localState = parseState(localStorage.getItem(STORAGE_KEY));
      const cloudState = await loadCloudState(userId);

      if (stopped) return;

      // If the phone/PWA has no local data and the cloud has the user's
      // saved data, restore it locally.
      if (cloudState && hasRealUserData(cloudState)) {
        if (!hasRealUserData(localState) || stableStringify(localState) !== stableStringify(cloudState)) {
          applyCloudState(cloudState);
        }
        return;
      }

      // If the cloud row exists but contains an empty/initial state, never
      // overwrite a device that already has real data. Send the real local
      // data to the cloud instead.
      if (hasRealUserData(localState)) {
        await saveLocalToCloud(userId, localState);
      }
    };

    const start = async (attempt = 0) => {
      if (stopped) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session || session.user.is_anonymous) {
        if (attempt < SESSION_RETRY_LIMIT) {
          retryTimer = setTimeout(() => start(attempt + 1), SESSION_RETRY_MS);
        }
        return;
      }

      const userId = session.user.id;

      if (startedUserId === userId && cloudTimer) return;
      startedUserId = userId;

      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }

      await sync(userId);
      if (stopped) return;

      cloudTimer = setInterval(() => sync(userId), CLOUD_POLL_MS);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      start();
    });

    start();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") start();
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (cloudTimer) clearInterval(cloudTimer);
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return null;
}
