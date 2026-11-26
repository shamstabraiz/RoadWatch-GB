import { Session, User } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from '../config/supabaseConfig';

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
}

export async function getCurrentSession(): Promise<Session | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function fetchUserProfile(user: User): Promise<UserProfile> {
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', user.id)
    .maybeSingle();

  if (data) {
    return {
      id: data.id,
      fullName: data.full_name || user.email?.split('@')[0] || 'Traveler',
      email: data.email || user.email || '',
    };
  }

  const meta = user.user_metadata ?? {};
  return {
    id: user.id,
    fullName: meta.full_name || user.email?.split('@')[0] || 'Traveler',
    email: user.email || '',
  };
}

export async function signInWithEmail(email: string, password: string): Promise<Session> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error || !data.session) {
    throw new Error(error?.message ?? 'Unable to sign in. Check your credentials.');
  }
  return data.session;
}

export async function signUpWithEmail(params: {
  fullName: string;
  email: string;
  password: string;
}): Promise<{ session: Session | null; needsEmailConfirmation: boolean }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email: params.email.trim().toLowerCase(),
    password: params.password,
    options: {
      data: {
        full_name: params.fullName.trim(),
      },
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    session: data.session,
    needsEmailConfirmation: !data.session,
  };
}

export async function signOutUser(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabaseClient();
  await supabase.auth.signOut();
}
