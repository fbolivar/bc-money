import { supabase } from './supabase';
import { offlineCache } from './offlineCache';
import type { Transaction, Account, Category, Budget } from './supabase';

function isNetworkError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    !navigator.onLine ||
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('Load failed') ||
    msg.includes('fetch')
  );
}

export async function fetchTransactions(userId: string): Promise<Transaction[]> {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(500);

    if (error) throw error;
    const rows = (data ?? []) as Transaction[];
    await offlineCache.set('transactions', userId, rows).catch(() => undefined);
    return rows;
  } catch (err) {
    if (isNetworkError(err)) {
      const cached = await offlineCache.get<Transaction>('transactions', userId).catch(() => null);
      if (cached) return cached;
    }
    throw err;
  }
}

export async function fetchAccounts(userId: string): Promise<Account[]> {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .order('name');

    if (error) throw error;
    const rows = (data ?? []) as Account[];
    await offlineCache.set('accounts', userId, rows).catch(() => undefined);
    return rows;
  } catch (err) {
    if (isNetworkError(err)) {
      const cached = await offlineCache.get<Account>('accounts', userId).catch(() => null);
      if (cached) return cached;
    }
    throw err;
  }
}

export async function fetchCategories(userId: string): Promise<Category[]> {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      ;

    if (error) throw error;
    const rows = (data ?? []) as Category[];
    await offlineCache.set('categories', userId, rows).catch(() => undefined);
    return rows;
  } catch (err) {
    if (isNetworkError(err)) {
      const cached = await offlineCache.get<Category>('categories', userId).catch(() => null);
      if (cached) return cached;
    }
    throw err;
  }
}

export async function fetchBudgets(userId: string): Promise<Budget[]> {
  try {
    const { data, error } = await supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;
    const rows = (data ?? []) as Budget[];
    await offlineCache.set('budgets', userId, rows).catch(() => undefined);
    return rows;
  } catch (err) {
    if (isNetworkError(err)) {
      const cached = await offlineCache.get<Budget>('budgets', userId).catch(() => null);
      if (cached) return cached;
    }
    throw err;
  }
}
