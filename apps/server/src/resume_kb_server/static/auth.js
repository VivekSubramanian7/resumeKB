import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

let supabase = null;
let authRequired = false;

export async function initAuth(config) {
  authRequired = Boolean(config.auth_required);
  if (!authRequired) {
    return null;
  }
  if (!config.supabase_url || !config.supabase_anon_key) {
    const missing = [];
    if (!config.supabase_url) missing.push("SUPABASE_URL");
    if (!config.supabase_anon_key) missing.push("SUPABASE_ANON_KEY");
    throw new Error(
      `Supabase is not configured on the server (missing ${missing.join(" and ")}). ` +
        "Add them to .env locally or to your Railway service variables.",
    );
  }
  supabase = createClient(config.supabase_url, config.supabase_anon_key, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return supabase;
}

export function isAuthRequired() {
  return authRequired;
}

export function isAuthReady() {
  return !authRequired || supabase !== null;
}

function requireClient() {
  if (!supabase) {
    throw new Error(
      "Sign-in is unavailable — set SUPABASE_URL and SUPABASE_ANON_KEY on the server, " +
        "or set AUTH_DISABLED=true for local development.",
    );
  }
  return supabase;
}

export async function signIn(email, password) {
  const { data, error } = await requireClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password) {
  const { data, error } = await requireClient().auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (supabase) {
    await supabase.auth.signOut();
  }
}

export async function getAccessToken() {
  if (!authRequired || !supabase) {
    return null;
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function getSession() {
  if (!authRequired || !supabase) {
    return null;
  }
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthStateChange(callback) {
  if (!supabase) {
    return { data: { subscription: { unsubscribe() {} } } };
  }
  return supabase.auth.onAuthStateChange(callback);
}
