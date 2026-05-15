import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, CheckCheck, Info, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import './NotificationBell.css';

interface NotificationBellProps {
  userId: string | undefined;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

const TYPE_ICONS = {
  info: Info,
  warning: AlertTriangle,
  danger: AlertCircle,
  success: CheckCircle,
};

export function NotificationBell({ userId }: NotificationBellProps) {
  const { notifications, unreadCount, markAsRead, markAllRead } = useNotifications(userId);
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  function handleNotificationClick(id: string, link: string | null, read: boolean) {
    if (!read) markAsRead(id);
    if (link) {
      setIsOpen(false);
      navigate(link);
    }
  }

  return (
    <div className="nb-wrapper" ref={panelRef}>
      <button
        type="button"
        className={`topbar-btn nb-btn${unreadCount > 0 ? ' nb-btn--active' : ''}`}
        title="Notificaciones"
        onClick={() => setIsOpen(prev => !prev)}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="nb-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="nb-panel">
          <div className="nb-panel-header">
            <span className="nb-panel-title">Notificaciones{unreadCount > 0 ? ` (${unreadCount})` : ''}</span>
            <div className="nb-panel-actions">
              {unreadCount > 0 && (
                <button type="button" className="nb-markall-btn" title="Marcar todas como leídas" onClick={markAllRead}>
                  <CheckCheck size={15} />
                  <span>Todas leídas</span>
                </button>
              )}
              <button type="button" className="nb-close-btn" title="Cerrar" onClick={() => setIsOpen(false)}>
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="nb-panel-body">
            {notifications.length === 0 ? (
              <div className="nb-empty">
                <Bell size={28} className="nb-empty-icon" />
                <p>No hay notificaciones nuevas</p>
              </div>
            ) : (
              notifications.map(n => {
                const Icon = TYPE_ICONS[n.type] ?? Info;
                return (
                  <div
                    key={n.id}
                    className={`nb-item nb-item--${n.type}${!n.read ? ' nb-item--unread' : ''}${n.link ? ' nb-item--clickable' : ''}`}
                    onClick={() => handleNotificationClick(n.id, n.link, n.read)}
                  >
                    <Icon size={16} className="nb-item-icon" />
                    <div className="nb-item-content">
                      <span className="nb-item-title">{n.title}</span>
                      <span className="nb-item-body">{n.body}</span>
                      <span className="nb-item-time">{timeAgo(n.created_at)}</span>
                    </div>
                    {!n.read && <span className="nb-unread-dot" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
