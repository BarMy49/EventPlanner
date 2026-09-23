import { CalendarPlus, LogOut, RefreshCw, Unplug } from 'lucide-react';
import ThemeToggle from './ThemeToggle.jsx';

export default function AppHeader({
  currentUser,
  theme,
  calendarConnection,
  calendarBusy,
  onConnectCalendar,
  onSyncCalendar,
  onDisconnectCalendar,
  onToggleTheme,
  onLogout,
}) {
  const calendarAvailable = Boolean(calendarConnection?.available);
  const calendarConnected = Boolean(calendarConnection?.connected);

  return <header>
    <div>
      <h1>Planowanie wydarzeń</h1>
      <p>Zaznacz kiedy nie możesz i twórz propozycje wydarzeń dla wybranych uczestników.</p>
      {currentUser && <div className="user-meta">{currentUser.username}{currentUser.is_admin && <span>Admin</span>}</div>}
    </div>
    <div className="header-actions">
      <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      {calendarAvailable && !calendarConnected && (
        <button type="button" className="secondary" onClick={onConnectCalendar} disabled={calendarBusy}>
          <CalendarPlus size={18}/> Google Calendar
        </button>
      )}
      {calendarAvailable && calendarConnected && (
        <>
          <button type="button" className="secondary" onClick={onSyncCalendar} disabled={calendarBusy}>
            <RefreshCw size={18}/> Synchronizuj
          </button>
          <button
            type="button"
            className="secondary action-icon"
            onClick={onDisconnectCalendar}
            disabled={calendarBusy}
            title="Odłącz Google Calendar"
            aria-label="Odłącz Google Calendar"
          >
            <Unplug size={18}/>
          </button>
        </>
      )}
      <button type="button" className="secondary logout-button" onClick={onLogout}><LogOut size={18}/> Wyloguj</button>
    </div>
  </header>;
}
