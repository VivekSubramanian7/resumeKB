import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

let supabase = null;
let authRequired = false;

export async function initAuth(config) {
  authRequired = Boolean(config.auth_required);
  if (!authRequired) {
    return null;
  }
  if (!config.supabase_url || !config.supabase_anon_key) {
    throw new Error("Supabase is not configured on the server.");
  }
  supabase = createClient(config.supabase_url, config.supabase_anon_key, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return supabase;
}

export function isAuthRequired() {
  return authRequired;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
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
