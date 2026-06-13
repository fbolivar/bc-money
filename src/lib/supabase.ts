import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const CLIENT_OPTIONS = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      'x-app-name': 'bc-money',
    },
  },
  // Disable realtime auto-connect to avoid WebSocket errors on restrictive browsers
  realtime: {
    timeout: 30000,
  },
} as const;

function createSupabaseClient(): SupabaseClient {
  try {
    return createClient(supabaseUrl, supabaseAnonKey, CLIENT_OPTIONS);
  } catch (e) {
    console.error('Supabase createClient error:', e);
    // Return a minimal client without realtime to avoid crashing the app
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: CLIENT_OPTIONS.auth,
      db: CLIENT_OPTIONS.db,
      global: CLIENT_OPTIONS.global,
    });
  }
}

export const supabase: SupabaseClient = createSupabaseClient();

// Check if properly configured
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Helper to create a temporary client for isolated auth operations (e.g. password verification)
export const createTemporaryClient = () => createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

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
  family_id: string | null;
  alert_warranty_days: number;
  alert_debt_days: number;
  alert_budget_pct: number;
  alerts_enabled: boolean;
  billing_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type BillingConfig = {
  id: string;
  user_id: string;
  razon_social: string;
  nit: string;
  direccion: string;
  ciudad: string;
  departamento: string;
  telefono: string;
  email_empresa: string;
  regimen: string;
  actividad_economica: string;
  resolucion_dian: string;
  prefijo_factura: string;
  numero_desde: number;
  numero_hasta: number;
  numero_actual: number;
  fecha_resolucion: string | null;
  vigencia_hasta: string | null;
  logo_base64: string | null;
  notas_defecto: string;
  created_at: string;
  updated_at: string;
};

export type BillingClient = {
  id: string;
  user_id: string;
  tipo_persona: string;
  nombre: string;
  nit_cedula: string;
  direccion: string;
  ciudad: string;
  departamento: string;
  telefono: string;
  email: string;
  regimen: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Invoice = {
  id: string;
  user_id: string;
  client_id: string | null;
  numero: string;
  fecha: string;
  fecha_vencimiento: string | null;
  subtotal: number;
  total_iva: number;
  pct_rtefte: number;
  total_rtefte: number;
  pct_rteica: number;
  total_rteica: number;
  aplica_rteiva: boolean;
  total_rteiva: number;
  total: number;
  datos_empresa: Record<string, unknown> | null;
  datos_cliente: Record<string, unknown> | null;
  estado: string;
  notas: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceItem = {
  id: string;
  invoice_id: string;
  user_id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  pct_iva: number;
  valor_iva: number;
  subtotal: number;
  total: number;
  sort_order: number;
  created_at: string;
};

export type Quote = {
  id: string;
  user_id: string;
  client_id: string | null;
  numero: string;
  fecha: string;
  fecha_vencimiento: string | null;
  subtotal: number;
  total_iva: number;
  pct_rtefte: number;
  total_rtefte: number;
  pct_rteica: number;
  total_rteica: number;
  aplica_rteiva: boolean;
  total_rteiva: number;
  total: number;
  datos_empresa: Record<string, unknown> | null;
  datos_cliente: Record<string, unknown> | null;
  estado: string;
  notas: string | null;
  invoice_id: string | null;
  created_at: string;
  updated_at: string;
};

export type QuoteItem = {
  id: string;
  quote_id: string;
  user_id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  pct_iva: number;
  valor_iva: number;
  subtotal: number;
  total: number;
  sort_order: number;
  created_at: string;
};

export type CreditNote = {
  id: string;
  user_id: string;
  invoice_id: string | null;
  client_id: string | null;
  numero: string;
  tipo: string;
  fecha: string;
  concepto: string;
  subtotal: number;
  total_iva: number;
  total: number;
  datos_empresa: Record<string, unknown> | null;
  datos_cliente: Record<string, unknown> | null;
  estado: string;
  created_at: string;
  updated_at: string;
};

export type CreditNoteItem = {
  id: string;
  credit_note_id: string;
  user_id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  pct_iva: number;
  valor_iva: number;
  subtotal: number;
  total: number;
  sort_order: number;
  created_at: string;
};

export type RecurringInvoice = {
  id: string;
  user_id: string;
  client_id: string | null;
  nombre: string;
  frecuencia: string;
  proximo_vencimiento: string | null;
  activo: boolean;
  template_items: Record<string, unknown>[];
  pct_rtefte: number;
  pct_rteica: number;
  aplica_rteiva: boolean;
  notas: string | null;
  ultimo_generado: string | null;
  created_at: string;
  updated_at: string;
};

export type TransactionAttachment = {
  id: string;
  transaction_id: string;
  user_id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  file_type: string | null;
  created_at: string;
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
  currency: string;
  type: 'income' | 'expense' | 'transfer';
  category_id: string | null;
  account_id: string | null;
  goal_id: string | null;
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
  tags: string[];
  event_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Event = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  budget: number | null;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  color: string;
  emoji: string;
  status: string;
  created_at: string;
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

export type Account = {
  id: string;
  user_id: string;
  name: string;
  type: 'checking' | 'savings' | 'credit_card' | 'cash' | 'crypto' | 'investment';
  currency: string;
  balance: number;
  color: string;
  icon: string;
  institution: string | null;
  account_number: string | null;
  min_balance_alert: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Debt = {
  id: string;
  user_id: string;
  name: string;
  type: 'mortgage' | 'personal_loan' | 'credit_card' | 'informal' | 'car_loan' | 'student_loan' | 'other';
  creditor: string | null;
  original_amount: number;
  remaining_amount: number;
  interest_rate: number;
  currency: string;
  total_installments: number | null;
  paid_installments: number;
  installment_amount: number | null;
  payment_day: number | null;
  start_date: string;
  end_date: string | null;
  status: 'active' | 'paid_off' | 'defaulted';
  is_current: boolean;
  months_behind: number;
  color: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type DebtPayment = {
  id: string;
  debt_id: string;
  user_id: string;
  amount: number;
  payment_date: string;
  installment_number: number | null;
  notes: string | null;
  created_at: string;
};

export type Warranty = {
  id: string;
  user_id: string;
  product_name: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  category: 'appliance' | 'electronics' | 'vehicle' | 'furniture' | 'clothing' | 'tools' | 'other';
  purchase_date: string;
  warranty_end_date: string;
  purchase_price: number | null;
  currency: string;
  store: string | null;
  color: string;
  notes: string | null;
  status: 'active' | 'expired' | 'claimed';
  created_at: string;
  updated_at: string;
};

export type Pet = {
  id: string;
  user_id: string;
  name: string;
  species: 'dog' | 'cat' | 'bird' | 'fish' | 'rabbit' | 'hamster' | 'reptile' | 'other';
  breed: string | null;
  birth_date: string | null;
  weight: number | null;
  color: string;
  photo_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PetEvent = {
  id: string;
  pet_id: string;
  user_id: string;
  type: 'vaccine' | 'vet_visit' | 'grooming' | 'medication' | 'surgery' | 'food' | 'accessory' | 'insurance' | 'other';
  name: string;
  date: string;
  next_date: string | null;
  cost: number | null;
  currency: string;
  veterinary: string | null;
  notes: string | null;
  created_at: string;
};

export type ShoppingList = {
  id: string;
  user_id: string;
  name: string;
  status: 'active' | 'completed' | 'archived';
  budget_limit: number | null;
  currency: string;
  created_at: string;
  updated_at: string;
};

export type ShoppingItem = {
  id: string;
  list_id: string;
  user_id: string;
  name: string;
  category: 'food' | 'cleaning' | 'personal' | 'pharmacy' | 'electronics' | 'clothing' | 'home' | 'pets' | 'other';
  quantity: number;
  unit: string;
  estimated_price: number | null;
  actual_price: number | null;
  is_checked: boolean;
  priority: 'low' | 'normal' | 'high';
  notes: string | null;
  created_at: string;
};

export type HomeItem = {
  id: string;
  user_id: string;
  name: string;
  area: 'kitchen' | 'bathroom' | 'bedroom' | 'living' | 'garage' | 'garden' | 'laundry' | 'exterior' | 'general';
  brand: string | null;
  model: string | null;
  install_date: string | null;
  color: string;
  notes: string | null;
  created_at: string;
};

export type HomeMaintenance = {
  id: string;
  item_id: string | null;
  user_id: string;
  type: 'repair' | 'cleaning' | 'inspection' | 'replacement' | 'installation' | 'painting' | 'plumbing' | 'electrical' | 'other';
  name: string;
  date: string;
  next_date: string | null;
  cost: number | null;
  currency: string;
  provider: string | null;
  status: 'scheduled' | 'completed' | 'cancelled';
  notes: string | null;
  created_at: string;
};

export type Family = {
  id: string;
  name: string;
  owner_id: string;
  shared_modules: string[];
  created_at: string;
};

export type FamilyMember = {
  id: string;
  family_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  invited_email: string | null;
  status: 'pending' | 'active' | 'rejected';
  created_at: string;
};

export type Investment = {
  id: string;
  user_id: string;
  name: string;
  type: 'stock' | 'crypto' | 'bond' | 'fund' | 'real_estate' | 'commodity' | 'other';
  symbol: string | null;
  quantity: number;
  purchase_price: number;
  current_price: number | null;
  currency: string;
  purchase_date: string;
  notes: string | null;
  color: string;
  created_at: string;
  updated_at: string;
};

export type NetWorthSnapshot = {
  id: string;
  user_id: string;
  date: string;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  breakdown: Record<string, unknown> | null;
  created_at: string;
};

export type Subscription = {
  id: string;
  user_id: string;
  name: string;
  category: 'entertainment' | 'software' | 'music' | 'gaming' | 'fitness' | 'education' | 'news' | 'cloud' | 'insurance' | 'membership' | 'other';
  amount: number;
  currency: string;
  billing_cycle: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  next_billing_date: string;
  auto_renew: boolean;
  color: string;
  provider: string | null;
  status: 'active' | 'paused' | 'cancelled';
  notes: string | null;
  created_at: string;
  updated_at: string;
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

export type FinancialNote = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  color: string;
  pinned: boolean;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
};
