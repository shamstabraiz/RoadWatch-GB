import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * RoadWatch GB — Direct Supabase Configuration
 * Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to `.env`
 * (see `.env.example`), or paste them directly below.
 */
export const supabaseConfig = {
  url: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
};

export function isSupabaseConfigured(): boolean {
  return Boolean(
    supabaseConfig.url &&
    supabaseConfig.anonKey &&
    !supabaseConfig.url.includes('your-project-ref') &&
    !supabaseConfig.anonKey.startsWith('your_')
  );
}

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase config is not set. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env or src/config/supabaseConfig.ts.'
    );
  }
  if (!cachedClient) {
    cachedClient = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return cachedClient;
}

