import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Pencil,
  LogOut,
  Moon,
  Plus,
  Save,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import './style.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const DAYS = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];
const SHORT_DAYS = ['P', 'W', 'Ś', 'C', 'P', 'S', 'N'];
const DATE_FORMATTER = new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
const MONTH_FORMATTER = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' });
const MONTH_NAME_FORMATTER = new Intl.DateTimeFormat('pl-PL', { month: 'long' });
const YEAR_FORMATTER = new Intl.DateTimeFormat('pl-PL', { year: 'numeric' });
const THEME_ANIMATION_MS = 420;

function pad(n) {
  return String(n).padStart(2, '0');
}

function getMonday(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function addYears(date, years) {
  return new Date(date.getFullYear() + years, 0, 1);
}

function toDateInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromDateInputValue(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(date) {
  return DATE_FORMATTER.format(date);
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function getMonthDays(date) {
  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = getMonday(firstOfMonth);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function getUsersForDate(slots, date) {
  const dayStart = startOfDay(date);
  const dayEnd = addDays(dayStart, 1);
  const users = new Set();

  slots.forEach((slot) => {
    if (new Date(slot.start_time) < dayEnd && new Date(slot.end_time) > dayStart) {
      if (Array.isArray(slot.users)) {
        slot.users.forEach((user) => users.add(user));
      } else if (slot.username) {
        users.add(slot.username);
      }
    }
  });

  return [...users].sort();
}

function displayEndDate(endTime) {
  const end = new Date(endTime);
  if (
    end.getHours() === 0
    && end.getMinutes() === 0
    && end.getSeconds() === 0
    && end.getMilliseconds() === 0
  ) {
    return addDays(startOfDay(end), -1);
  }
  return startOfDay(end);
}

function formatSlotDateRange(slot) {
  const startDate = startOfDay(new Date(slot.start_time));
  const endDate = displayEndDate(slot.end_time);
  return isSameDay(startDate, endDate)
    ? formatDate(startDate)
    : `${formatDate(startDate)} - ${formatDate(endDate)}`;
}

function getSlotStartInputValue(slot) {
  return toDateInputValue(startOfDay(new Date(slot.start_time)));
}

function getSlotEndInputValue(slot) {
  return toDateInputValue(displayEndDate(slot.end_time));
}

function buildBusyPayload(startValue, endValue, userId) {
  const startDate = startOfDay(fromDateInputValue(startValue));
  const endDate = addDays(startOfDay(fromDateInputValue(endValue)), 1);
  if (endDate <= startDate) {
    throw new Error('Data końca nie może być wcześniejsza niż data początku.');
  }

  const payload = {
    start_time: startDate.toISOString(),
    end_time: endDate.toISOString(),
  };

  if (userId) {
    payload.user_id = Number(userId);
  }

  return payload;
}

function getInitialTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === 'dark';
  return (
    <button type="button" className="secondary theme-toggle" onClick={onToggle} title={isDark ? 'Tryb jasny' : 'Tryb ciemny'}>
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
      {isDark ? 'Jasny' : 'Ciemny'}
    </button>
  );
}

function MonthCalendar({ visibleDate, slots }) {
  const today = startOfDay(new Date());
  const days = useMemo(() => getMonthDays(visibleDate), [visibleDate]);

  return (
    <div className="month-calendar">
      <div className="weekday-row">
        {DAYS.map((day) => <div className="weekday" key={day}>{day}</div>)}
      </div>
      <div className="month-grid">
        {days.map((day) => {
          const users = getUsersForDate(slots, day);
          const outside = day.getMonth() !== visibleDate.getMonth();
          const className = [
            'day-cell',
            outside ? 'outside-month' : '',
            users.length ? 'busy-day' : '',
            isSameDay(day, today) ? 'today' : '',
          ].filter(Boolean).join(' ');

          return (
            <div className={className} key={day.toISOString()}>
              <div className="day-number">{day.getDate()}</div>
              {users.length > 0 && (
                <div className="busy-users">
                  {users.map((user) => <span key={user}>{user}</span>)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniMonth({ date, slots, onOpenMonth }) {
  const days = useMemo(() => getMonthDays(date), [date]);

  return (
    <section className="mini-month">
      <button type="button" className="mini-month-title" onClick={() => onOpenMonth(date)}>
        {MONTH_NAME_FORMATTER.format(date)}
      </button>
      <div className="mini-weekdays">
        {SHORT_DAYS.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
      </div>
      <div className="mini-grid">
        {days.map((day) => {
          const users = getUsersForDate(slots, day);
          const outside = day.getMonth() !== date.getMonth();
          const title = users.length ? `${formatDate(day)}: ${users.join(', ')}` : formatDate(day);

          return (
            <div
              className={[
                'mini-day',
                outside ? 'outside-month' : '',
                users.length ? 'busy-marker' : '',
              ].filter(Boolean).join(' ')}
              key={day.toISOString()}
              title={title}
              aria-label={title}
            >
              {day.getDate()}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function YearCalendar({ visibleDate, slots, onOpenMonth }) {
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, month) => new Date(visibleDate.getFullYear(), month, 1)),
    [visibleDate],
  );

  return (
    <div className="year-calendar">
      {months.map((month) => (
        <MiniMonth
          key={month.getMonth()}
          date={month}
          slots={slots}
          onOpenMonth={onOpenMonth}
        />
      ))}
    </div>
  );
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('login');
  const [busy, setBusy] = useState([]);
  const [message, setMessage] = useState('');
  const [visibleDate, setVisibleDate] = useState(startOfDay(new Date()));
  const [calendarView, setCalendarView] = useState('month');
  const [mobilePanel, setMobilePanel] = useState('slots');
  const [theme, setTheme] = useState(getInitialTheme);
  const [start, setStart] = useState(toDateInputValue(new Date()));
  const [end, setEnd] = useState(toDateInputValue(new Date()));
  const [selectedUserId, setSelectedUserId] = useState('');
  const [editingSlotId, setEditingSlotId] = useState(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editUserId, setEditUserId] = useState('');
  const themeAnimationTimer = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => () => {
    window.clearTimeout(themeAnimationTimer.current);
  }, []);

  function toggleTheme() {
    const root = document.documentElement;
    window.clearTimeout(themeAnimationTimer.current);
    root.dataset.themeChanging = 'true';
    setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'));
    themeAnimationTimer.current = window.setTimeout(() => {
      delete root.dataset.themeChanging;
    }, THEME_ANIMATION_MS);
  }

  async function api(path, options = {}) {
    const res = await fetch(`${API}${path}`, options);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Błąd API');
    }
    return res.json();
  }

  async function submitAuth(e) {
    e.preventDefault();
    setMessage('');
    try {
      if (mode === 'register') {
        await api('/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
      }
      const form = new URLSearchParams();
      form.append('username', username);
      form.append('password', password);
      const data = await api('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      });
      localStorage.setItem('token', data.access_token);
      setToken(data.access_token);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function loadData() {
    if (!token) return;
    const headers = authHeaders(token);
    const meData = await api('/users/me', { headers });
    const busyData = await api('/busy', { headers });
    setCurrentUser(meData);
    setBusy(busyData);

    if (meData.is_admin) {
      const usersData = await api('/users', { headers });
      setUsers(usersData);
      setSelectedUserId((previous) => (
        usersData.some((user) => String(user.id) === previous) ? previous : String(meData.id)
      ));
    } else {
      setUsers([]);
      setSelectedUserId('');
    }
  }

  useEffect(() => {
    loadData().catch((err) => setMessage(err.message));
  }, [token]);

  async function addBusy(e) {
    e.preventDefault();
    setMessage('');
    try {
      if (currentUser?.is_admin && !selectedUserId) {
        throw new Error('Wybierz użytkownika dla nowego terminu.');
      }
      const payload = buildBusyPayload(start, end, currentUser?.is_admin ? selectedUserId : null);
      await api('/busy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify(payload),
      });
      await loadData();
    } catch (err) {
      setMessage(err.message);
    }
  }

  function startEditing(slot) {
    setMessage('');
    setEditingSlotId(slot.id);
    setEditStart(getSlotStartInputValue(slot));
    setEditEnd(getSlotEndInputValue(slot));
    setEditUserId(String(slot.user_id));
  }

  function cancelEditing() {
    setEditingSlotId(null);
    setEditStart('');
    setEditEnd('');
    setEditUserId('');
  }

  async function updateBusy(id) {
    setMessage('');
    try {
      if (currentUser?.is_admin && !editUserId) {
        throw new Error('Wybierz użytkownika dla edytowanego terminu.');
      }
      const payload = buildBusyPayload(editStart, editEnd, currentUser?.is_admin ? editUserId : null);
      await api(`/busy/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify(payload),
      });
      cancelEditing();
      await loadData();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function deleteBusy(id) {
    setMessage('');
    try {
      await api(`/busy/${id}`, { method: 'DELETE', headers: authHeaders(token) });
      if (editingSlotId === id) {
        cancelEditing();
      }
      await loadData();
    } catch (err) {
      setMessage(err.message);
    }
  }

  function logout() {
    localStorage.removeItem('token');
    setToken('');
    setCurrentUser(null);
    setUsers([]);
    setBusy([]);
    setSelectedUserId('');
    cancelEditing();
  }

  function navigateCalendar(direction) {
    setVisibleDate((date) => (
      calendarView === 'month' ? addMonths(date, direction) : addYears(date, direction)
    ));
  }

  function openMonth(date) {
    setVisibleDate(date);
    setCalendarView('month');
  }

  const calendarTitle = calendarView === 'month'
    ? MONTH_FORMATTER.format(visibleDate)
    : YEAR_FORMATTER.format(visibleDate);
  const isAdmin = Boolean(currentUser?.is_admin);
  const canManageSlot = (slot) => isAdmin || slot.user_id === currentUser?.id;

  if (!token) {
    return <main className="auth-page">
      <ThemeToggle
        theme={theme}
        onToggle={toggleTheme}
      />
      <section className="card auth-card">
        <div className="logo"><CalendarDays /> Event Planner</div>
        <h1>{mode === 'login' ? 'Logowanie' : 'Rejestracja'}</h1>
        <form onSubmit={submitAuth}>
          <input placeholder="Nazwa użytkownika" value={username} onChange={e => setUsername(e.target.value)} />
          <input placeholder="Hasło" type="password" value={password} onChange={e => setPassword(e.target.value)} />
          <button>{mode === 'login' ? 'Zaloguj' : 'Utwórz konto'}</button>
        </form>
        <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Nie masz konta? Zarejestruj się' : 'Masz konto? Zaloguj się'}
        </button>
        {message && <p className="error">{message}</p>}
      </section>
    </main>;
  }

  return <main className="app">
    <header>
      <div>
        <h1>Planowanie eventów</h1>
        <p>Zaznacz kiedy nie możesz. Aplikacja pokazuje zajęte terminy wszystkich osób.</p>
        {currentUser && (
          <div className="user-meta">
            {currentUser.username}
            {isAdmin && <span>Admin</span>}
          </div>
        )}
      </div>
      <div className="header-actions">
        <ThemeToggle
          theme={theme}
          onToggle={toggleTheme}
        />
        <button type="button" className="secondary" onClick={logout}><LogOut size={18}/> Wyloguj</button>
      </div>
    </header>

    {message && <p className="error">{message}</p>}

    <div className="mobile-tabs" role="group" aria-label="Widok aplikacji">
      <button
        type="button"
        className={mobilePanel === 'slots' ? 'toggle active' : 'toggle'}
        onClick={() => setMobilePanel('slots')}
        aria-pressed={mobilePanel === 'slots'}
      >
        <Plus size={18}/> Terminy
      </button>
      <button
        type="button"
        className={mobilePanel === 'calendar' ? 'toggle active' : 'toggle'}
        onClick={() => setMobilePanel('calendar')}
        aria-pressed={mobilePanel === 'calendar'}
      >
        <CalendarDays size={18}/> Kalendarz
      </button>
    </div>

    <section className="layout">
      <aside className={`card slots-card ${mobilePanel === 'slots' ? 'mobile-active' : ''}`}>
        <h2>Dodaj zajęty termin</h2>
        <form onSubmit={addBusy} className="slot-form">
          {isAdmin && (
            <label>
              Użytkownik
              <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} required>
                {users.map((user) => (
                  <option value={user.id} key={user.id}>
                    {user.username}{user.is_admin ? ' (admin)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>Od<input type="date" value={start} onChange={e => setStart(e.target.value)} required /></label>
          <label>Do<input type="date" value={end} onChange={e => setEnd(e.target.value)} required /></label>
          <button><Plus size={18}/> Dodaj</button>
        </form>

        <h2>{isAdmin ? 'Wszystkie wpisy' : 'Moje / wszystkie wpisy'}</h2>
        <div className="slot-list">
          {busy.map(s => <div className="slot-item" key={s.id}>
            {editingSlotId === s.id ? (
              <div className="slot-edit">
                {isAdmin && (
                  <label>
                    Użytkownik
                    <select value={editUserId} onChange={e => setEditUserId(e.target.value)} required>
                      {users.map((user) => (
                        <option value={user.id} key={user.id}>
                          {user.username}{user.is_admin ? ' (admin)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>Od<input type="date" value={editStart} onChange={e => setEditStart(e.target.value)} required /></label>
                <label>Do<input type="date" value={editEnd} onChange={e => setEditEnd(e.target.value)} required /></label>
                <div className="slot-actions">
                  <button type="button" className="secondary" onClick={cancelEditing}><X size={16}/> Anuluj</button>
                  <button type="button" onClick={() => updateBusy(s.id)}><Save size={16}/> Zapisz</button>
                </div>
              </div>
            ) : (
              <>
                <div><b>{s.username}</b><br />{formatSlotDateRange(s)}</div>
                {canManageSlot(s) && (
                  <div className="slot-actions">
                    <button type="button" className="secondary action-icon" onClick={() => startEditing(s)} title="Edytuj wpis"><Pencil size={16}/></button>
                    <button type="button" className="icon action-icon" onClick={() => deleteBusy(s.id)} title="Usuń wpis"><Trash2 size={16}/></button>
                  </div>
                )}
              </>
            )}
          </div>)}
        </div>
      </aside>

      <section className={`card calendar-card ${mobilePanel === 'calendar' ? 'mobile-active' : ''}`}>
        <div className="calendar-nav">
          <div className="nav-group">
            <button type="button" className="secondary icon-label" onClick={() => navigateCalendar(-1)}>
              <ChevronLeft size={18}/> Poprzedni
            </button>
            <button type="button" className="secondary icon-only" onClick={() => setVisibleDate(startOfDay(new Date()))} title="Dzisiaj">
              <CalendarDays size={18}/>
            </button>
            <button type="button" className="secondary icon-label" onClick={() => navigateCalendar(1)}>
              Następny <ChevronRight size={18}/>
            </button>
          </div>
          <strong>{calendarTitle}</strong>
          <div className="view-toggle" role="group" aria-label="Widok kalendarza">
            <button
              type="button"
              className={calendarView === 'month' ? 'toggle active' : 'toggle'}
              onClick={() => setCalendarView('month')}
              aria-pressed={calendarView === 'month'}
            >
              <CalendarDays size={18}/> Miesiąc
            </button>
            <button
              type="button"
              className={calendarView === 'year' ? 'toggle active' : 'toggle'}
              onClick={() => setCalendarView('year')}
              aria-pressed={calendarView === 'year'}
            >
              <CalendarRange size={18}/> Rok
            </button>
          </div>
        </div>

        {calendarView === 'month'
          ? <MonthCalendar visibleDate={visibleDate} slots={busy} />
          : <YearCalendar visibleDate={visibleDate} slots={busy} onOpenMonth={openMonth} />}
      </section>
    </section>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
