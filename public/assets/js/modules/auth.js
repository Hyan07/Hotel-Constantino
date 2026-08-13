import { getSupabase } from './supabase.js';
import { setState } from './state.js';

export async function signIn(email, password) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const supabase = await getSupabase();
  await supabase.auth.signOut();
  setState({ session: null, profile: null });
}

export async function loadSession() {
  const supabase = await getSupabase();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session) return { session: null, profile: null };

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, role, active')
    .eq('id', session.user.id)
    .single();
  if (profileError) throw profileError;
  if (!profile.active) {
    await supabase.auth.signOut();
    throw new Error('Este usuário está inativo. Procure o administrador.');
  }
  setState({ session, profile });
  return { session, profile };
}

export async function watchAuth(onChange) {
  const supabase = await getSupabase();
  return supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') {
      setState({ session: null, profile: null });
      onChange?.(null);
    } else if (event === 'TOKEN_REFRESHED' && session) {
      setState({ session });
    }
  });
}
