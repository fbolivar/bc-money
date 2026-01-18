import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Create client even if env vars are missing - will show errors at usage time
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// Check if properly configured
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Type exports for database
export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  country: string;
  currency: string;
  income_type: 'hourly' | 'fixed' | 'variable';
  hourly_rate: number | null;
  hours_per_week: number | null;
  fixed_salary: number | null;
  pay_frequency: 'weekly' | 'biweekly' | 'monthly';
  net_income_percentage: number;
  risk_tolerance: 'conservative' | 'moderate' | 'aggressive';
  investment_horizon: 'short' | 'medium' | 'long';
  life_situation: 'student' | 'first_job' | 'employed' | 'freelancer' | 'retired';
  birth_year: number | null;
  onboarding_completed: boolean;
  onboarding_step: number;
  role: 'admin' | 'user';
  status: 'active' | 'inactive' | 'banned';
  created_at: string;
  updated_at: string;
};

export type Category = {
  id: string;
  user_id: string | null;
  name: string;
  type: 'income' | 'expense' | 'both';
  icon: string;
  color: string;
  is_system: boolean;
  is_essential: boolean;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Transaction = {
  id: string;
  user_id: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  category_id: string | null;
  description: string | null;
  notes: string | null;
  merchant: string | null;
  date: string;
  is_essential: boolean;
  payment_method: 'cash' | 'debit' | 'credit' | 'transfer' | 'other';
  is_recurring: boolean;
  recurrence_rule: string | null;
  recurrence_parent_id: string | null;
  is_split: boolean;
  created_at: string;
  updated_at: string;
};

export type Budget = {
  id: string;
  user_id: string;
  category_id: string | null;
  amount: number;
  period: 'weekly' | 'monthly' | 'yearly';
  start_date: string;
  end_date: string | null;
  alert_threshold: number;
  created_at: string;
  updated_at: string;
};

export type Goal = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  priority: number;
  goal_type: 'emergency_fund' | 'savings' | 'purchase' | 'education' | 'investment' | 'debt_payoff' | 'other';
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  auto_contribute: boolean;
  contribution_amount: number | null;
  contribution_frequency: 'weekly' | 'biweekly' | 'monthly' | null;
  target_mode: 'amount' | 'percentage';
  target_percentage: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type AIConversation = {
  id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  structured_response: Record<string, unknown> | null;
  context_snapshot: Record<string, unknown> | null;
  created_at: string;
};
