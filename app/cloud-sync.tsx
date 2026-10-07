"use client";

import { useEffect } from "react";
import { supabase } from "../lib/supabase";

const STORAGE_KEY = "meu-ritmo-v2.3";

const LOCAL_POLL_MS = 1000;
const CLOUD_POLL_MS = 5000;
const SESSION_RETRY_MS = 1000;
const SESSION_RETRY_LIMIT = 15;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = stableValue(
          (value as Record<string, unknown>)[key]
        );
        return result;
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
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: (() => void) | null = null;

    let lastLocalValue =
      typeof window !== "undefined"
        ? localStorage.getItem(STORAGE_KEY)
        : null;

    let lastCloudValue: string | null = null;

    const stopTimers = () => {
      if (localTimer) {
        clearInterval(localTimer);
        localTimer = null;
      }

      if (cloudTimer) {
        clearInterval(cloudTimer);
        cloudTimer = null;
      }

      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const uploadLocalState = async (userId: string) => {
      if (stopped) return;

      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const state = parseState(raw);
      if (!state) return;

      const { error } = await supabase
        .from("app_state")
        .upsert(
          {
            user_id: userId,
            data: state,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "user_id",
          }
        );

      if (!error) {
        lastLocalValue = raw;
      }
    };

    const checkLocalChanges = async (userId: string) => {
      if (stopped) return;

      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw || raw === lastLocalValue) {
        return;
      }

      const state = parseState(raw);

      if (!state) return;

      const { error } = await supabase
        .from("app_state")
        .upsert(
          {
            user_id: userId,
            data: state,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "user_id",
          }
        );

      if (!error) {
        lastLocalValue = raw;
        lastCloudValue = stableStringify(state);
      }
    };

    const checkCloudChanges = async (userId: string) => {
      if (stopped) return;

      const { data, error } = await supabase
        .from("app_state")
        .select("data, updated_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (error || !data?.data) {
        return;
      }

      const cloudValue = stableStringify(data.data);

      if (cloudValue === lastCloudValue) {
        return;
      }

      lastCloudValue = cloudValue;

      const localRaw = localStorage.getItem(STORAGE_KEY);
      const localState = parseState(localRaw);

      const localValue = localState
        ? stableStringify(localState)
        : null;

      if (localValue === cloudValue) {
        lastLocalValue = localRaw;
        return;
      }

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(data.data)
      );

      lastLocalValue = JSON.stringify(data.data);

      window.location.reload();
    };

    const start = async (attempt = 0) => {
      if (stopped) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        if (attempt < SESSION_RETRY_LIMIT) {
          retryTimer = setTimeout(() => {
            start(attempt + 1);
          }, SESSION_RETRY_MS);
        }

        return;
      }

      const user = session.user;

      if (user.is_anonymous) {
        return;
      }

      stopTimers();

      await checkCloudChanges(user.id);

      if (stopped) return;

      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        await checkCloudChanges(user.id);
      } else {
        const state = parseState(raw);

        if (state) {
          const { data: existing } = await supabase
            .from("app_state")
            .select("data")
            .eq("user_id", user.id)
            .maybeSingle();

          if (!existing?.data) {
            await uploadLocalState(user.id);
          } else {
            const cloudValue = stableStringify(existing.data);
            const localValue = stableStringify(state);

            lastCloudValue = cloudValue;

            if (cloudValue !== localValue) {
              localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(existing.data)
              );

              lastLocalValue = JSON.stringify(existing.data);

              window.location.reload();
              return;
            }
          }
        }
      }

      localTimer = setInterval(() => {
        checkLocalChanges(user.id);
      }, LOCAL_POLL_MS);

      cloudTimer = setInterval(() => {
        checkCloudChanges(user.id);
      }, CLOUD_POLL_MS);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      start();
    };

    const setup = async () => {
      await start();

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(() => {
        start();
      });

      unsubscribe = () => {
        subscription.unsubscribe();
      };

      document.addEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };

    setup();

    return () => {
      stopped = true;

      stopTimers();

      if (unsubscribe) {
        unsubscribe();
      }

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, []);

  return null;
}
