import { useCallback, useEffect, useState } from "react";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { get, setAccessToken } from "@/lib/api";

interface AppConfig {
  auth_required: boolean;
  supabase_url: string;
  supabase_anon_key: string;
  max_note_seconds: number;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  authRequired: boolean;
  maxNoteSeconds: number;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

let supabase: SupabaseClient | null = null;

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [maxNoteSeconds, setMaxNoteSeconds] = useState(120);

  useEffect(() => {
    let sub: { unsubscribe: () => void } | null = null;

    (async () => {
      try {
        const config = await get<AppConfig>("/api/config");
        setAuthRequired(config.auth_required);
        setMaxNoteSeconds(config.max_note_seconds);

        if (!config.auth_required) {
          return;
        }

        supabase = createClient(config.supabase_url, config.supabase_anon_key, {
          auth: { persistSession: true, autoRefreshToken: true },
        });

        const { data } = await supabase.auth.getSession();
        if (data.session) {
          setAccessToken(data.session.access_token);
          setUser(data.session.user);
        }

        const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
          setAccessToken(session?.access_token ?? null);
          setUser(session?.user ?? null);
        });
        sub = listener.subscription;
      } finally {
        setLoading(false);
      }
    })();

    return () => { sub?.unsubscribe(); };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return;
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setAccessToken(null);
    setUser(null);
  }, []);

  return { user, loading, authRequired, maxNoteSeconds, signIn, signUp, signOut };
}
