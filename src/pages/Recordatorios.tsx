import { useState, useEffect, useCallback } from 'react';
import { Plus, Bell, Trash2, Edit2, X, Check, Clock, Calendar, Repeat } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format, addDays, addWeeks, addMonths, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import './Recordatorios.css';

interface Reminder {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  frequency: 'once' | 'daily' | 'weekly' | 'monthly';
  day_of_month: number | null;
  day_of_week: number | null;
  remind_at: string | null;
  next_trigger: string;
  is_active: boolean;
  created_at: string;
}

const FREQ_LABELS: Record<string, string> = {
  once: 'Una vez', daily: 'Diario', weekly: 'Semanal', monthly: 'Mensual',
};
const FREQ_ICONS: Record<string, typeof Bell> = {
  once: Bell, daily: Clock, weekly: Repeat, monthly: Calendar,
};
const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const EMPTY_FORM = {
  title: '', description: '', frequency: 'monthly' as Reminder['frequency'],
  day_of_month: 1, day_of_week: 1, remind_at: '08:00',
  next_trigger: format(new Date(), 'yyyy-MM-dd'),
};

function nextTriggerDate(
  frequency: string, dayOfMonth: number, dayOfWeek: number, baseDate: string,
): string {
  const now = new Date();
  if (frequency === 'once') return baseDate;
  if (frequency === 'daily') return format(addDays(now, 1), 'yyyy-MM-dd');
  if (frequency === 'weekly') {
    const d = new Date(now);
    const diff = (dayOfWeek - d.getDay() + 7) % 7 || 7;
    return format(addDays(d, diff), 'yyyy-MM-dd');
  }
  // monthly
  const next = new Date(now.getFullYear(), now.getMonth(), dayOfMonth);
  if (next <= now) return format(addMonths(next, 1), 'yyyy-MM-dd');
  return format(next, 'yyyy-MM-dd');
}

export function Recordatorios() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetch = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('reminders')
      .select('*')
      .eq('user_id', user.id)
      .order('next_trigger', { ascending: true });
    setReminders((data as Reminder[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (r: Reminder) => {
    setEditing(r);
    setForm({
      title: r.title,
      description: r.description || '',
      frequency: r.frequency,
      day_of_month: r.day_of_month ?? 1,
      day_of_week: r.day_of_week ?? 1,
      remind_at: r.remind_at ?? '08:00',
      next_trigger: r.next_trigger,
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !form.title.trim()) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      frequency: form.frequency,
      day_of_month: form.frequency === 'monthly' ? form.day_of_month : null,
      day_of_week: form.frequency === 'weekly' ? form.day_of_week : null,
      remind_at: form.remind_at || null,
      next_trigger: nextTriggerDate(form.frequency, form.day_of_month, form.day_of_week, form.next_trigger),
      is_active: true,
    };
    if (editing) {
      await supabase.from('reminders').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('reminders').insert(payload);
    }
    setSaving(false);
    setShowModal(false);
    fetch();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('reminders').delete().eq('id', id);
    setReminders(prev => prev.filter(r => r.id !== id));
  };

  const handleToggle = async (r: Reminder) => {
    await supabase.from('reminders').update({ is_active: !r.is_active }).eq('id', r.id);
    setReminders(prev => prev.map(x => x.id === r.id ? { ...x, is_active: !x.is_active } : x));
  };

  const active = reminders.filter(r => r.is_active);
  const inactive = reminders.filter(r => !r.is_active);

  if (loading) return <div className="loading-container"><div className="loading-spinner" /></div>;

  return (
    <div className="rem-page animate-fadeIn">
      <div className="rem-header">
        <div>
          <h1><Bell size={22} /> Recordatorios</h1>
          <p>Alertas personalizadas para no olvidar nada</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Plus size={16} /> Nuevo Recordatorio
        </button>
      </div>

      {reminders.length === 0 && (
        <div className="rem-empty">
          <Bell size={48} strokeWidth={1} />
          <h3>Sin recordatorios</h3>
          <p>Crea alertas para pagos, revisiones o cualquier evento financiero</p>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Crear recordatorio
          </button>
        </div>
      )}

      {active.length > 0 && (
        <section className="rem-section">
          <h2>Activos ({active.length})</h2>
          <div className="rem-list">
            {active.map(r => <ReminderCard key={r.id} r={r} onEdit={openEdit} onDelete={handleDelete} onToggle={handleToggle} />)}
          </div>
        </section>
      )}

      {inactive.length > 0 && (
        <section className="rem-section rem-section--inactive">
          <h2>Inactivos ({inactive.length})</h2>
          <div className="rem-list">
            {inactive.map(r => <ReminderCard key={r.id} r={r} onEdit={openEdit} onDelete={handleDelete} onToggle={handleToggle} />)}
          </div>
        </section>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="rem-modal" onClick={e => e.stopPropagation()}>
            <div className="rem-modal-header">
              <h2>{editing ? 'Editar' : 'Nuevo'} Recordatorio</h2>
              <button type="button" title="Cerrar" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <form className="rem-form" onSubmit={handleSave}>
              <div className="rem-field">
                <label>Título *</label>
                <input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Ej: Pagar arriendo" required />
              </div>
              <div className="rem-field">
                <label>Descripción</label>
                <input className="form-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Detalle opcional" />
              </div>
              <div className="rem-field">
                <label>Frecuencia</label>
                <div className="rem-freq-grid">
                  {(['once', 'daily', 'weekly', 'monthly'] as const).map(f => (
                    <button key={f} type="button"
                      className={`rem-freq-btn ${form.frequency === f ? 'active' : ''}`}
                      onClick={() => setForm(p => ({ ...p, frequency: f }))}>
                      {FREQ_LABELS[f]}
                    </button>
                  ))}
                </div>
              </div>

              {form.frequency === 'once' && (
                <div className="rem-field">
                  <label>Fecha</label>
                  <input type="date" className="form-input" value={form.next_trigger}
                    onChange={e => setForm(f => ({ ...f, next_trigger: e.target.value }))} />
                </div>
              )}
              {form.frequency === 'weekly' && (
                <div className="rem-field">
                  <label>Día de la semana</label>
                  <div className="rem-days-grid">
                    {DAYS_ES.map((d, i) => (
                      <button key={i} type="button"
                        className={`rem-day-btn ${form.day_of_week === i ? 'active' : ''}`}
                        onClick={() => setForm(f => ({ ...f, day_of_week: i }))}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {form.frequency === 'monthly' && (
                <div className="rem-field">
                  <label>Día del mes (1-31)</label>
                  <input type="number" className="form-input" min={1} max={31}
                    value={form.day_of_month}
                    onChange={e => setForm(f => ({ ...f, day_of_month: Number(e.target.value) }))} />
                </div>
              )}
              <div className="rem-field">
                <label>Hora del recordatorio</label>
                <input type="time" className="form-input" value={form.remind_at}
                  onChange={e => setForm(f => ({ ...f, remind_at: e.target.value }))} />
              </div>
              <div className="rem-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  <Check size={16} /> {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ReminderCard({ r, onEdit, onDelete, onToggle }: {
  r: Reminder;
  onEdit: (r: Reminder) => void;
  onDelete: (id: string) => void;
  onToggle: (r: Reminder) => void;
}) {
  const Icon = FREQ_ICONS[r.frequency] || Bell;
  const nextDate = parseISO(r.next_trigger);
  const isPast = nextDate < new Date() && r.is_active;

  return (
    <div className={`rem-card ${!r.is_active ? 'rem-card--inactive' : ''} ${isPast ? 'rem-card--past' : ''}`}>
      <div className="rem-card-icon">
        <Icon size={18} />
      </div>
      <div className="rem-card-body">
        <strong>{r.title}</strong>
        {r.description && <span className="rem-card-desc">{r.description}</span>}
        <div className="rem-card-meta">
          <span className="rem-badge">{FREQ_LABELS[r.frequency]}</span>
          <span className="rem-next">
            {isPast ? '⚠ ' : ''}
            {format(nextDate, "d 'de' MMMM", { locale: es })}
            {r.remind_at && ` a las ${r.remind_at.slice(0, 5)}`}
          </span>
        </div>
      </div>
      <div className="rem-card-actions">
        <button type="button" title={r.is_active ? 'Pausar' : 'Activar'} className="rem-icon-btn"
          onClick={() => onToggle(r)}>
          {r.is_active ? <Clock size={15} /> : <Check size={15} />}
        </button>
        <button type="button" title="Editar" className="rem-icon-btn" onClick={() => onEdit(r)}>
          <Edit2 size={15} />
        </button>
        <button type="button" title="Eliminar" className="rem-icon-btn rem-icon-btn--danger"
          onClick={() => onDelete(r.id)}>
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
