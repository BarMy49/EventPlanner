import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CalendarDays,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  LockKeyhole,
  Pencil,
  LogOut,
  Moon,
  Plus,
  Save,
  Sun,
  Trash2,
  Users,
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

function proposalCalendarStatus(proposal) {
  if (proposal.status === 'open') {
    return 'pending';
  }

  if (proposal.status === 'closed' && proposal.results?.yes_count > proposal.results?.no_count) {
    return 'accepted';
  }

  return null;
}

function getProposalsForDate(proposals, date) {
  const dayStart = startOfDay(date);
  const dayEnd = addDays(dayStart, 1);

  return proposals
    .map((proposal) => ({ ...proposal, calendarStatus: proposalCalendarStatus(proposal) }))
    .filter((proposal) => (
      proposal.calendarStatus
      && new Date(proposal.start_time) < dayEnd
      && new Date(proposal.end_time) > dayStart
    ))
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
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

function buildProposalPayload(titleValue, startValue, endValue) {
  const title = titleValue.trim();
  if (!title) {
    throw new Error('Podaj nazwę propozycji.');
  }

  const payload = buildBusyPayload(startValue, endValue);
  return {
    title,
    start_time: payload.start_time,
    end_time: payload.end_time,
  };
}

function voteLabel(vote) {
  if (vote === 'yes') return 'za';
  if (vote === 'no') return 'przeciw';
  return '';
}

function getInitialTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

function formatApiError(err) {
  if (Array.isArray(err.detail)) {
    return err.detail
      .map((detail) => {
        const field = Array.isArray(detail.loc) ? detail.loc[detail.loc.length - 1] : '';
        return field ? `${field}: ${detail.msg}` : detail.msg;
      })
      .join(' ');
  }

  return err.detail || err.message || 'Błąd API';
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

function MonthCalendar({ visibleDate, slots, proposals }) {
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
          const dayProposals = getProposalsForDate(proposals, day);
          const outside = day.getMonth() !== visibleDate.getMonth();
          const className = [
            'day-cell',
            outside ? 'outside-month' : '',
            users.length ? 'busy-day' : '',
            dayProposals.some((proposal) => proposal.calendarStatus === 'pending') ? 'proposal-pending-day' : '',
            dayProposals.some((proposal) => proposal.calendarStatus === 'accepted') ? 'proposal-accepted-day' : '',
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
              {dayProposals.length > 0 && (
                <div className="calendar-proposals">
                  {dayProposals.map((proposal) => (
                    <span
                      className={`calendar-proposal ${proposal.calendarStatus}`}
                      key={proposal.id}
                      title={`${proposal.title}: ${formatSlotDateRange(proposal)}`}
                    >
                      {proposal.title}
                    </span>
                  ))}
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
  const [proposals, setProposals] = useState([]);
  const [message, setMessage] = useState('');
  const [visibleDate, setVisibleDate] = useState(startOfDay(new Date()));
  const [calendarView, setCalendarView] = useState('month');
  const [leftPanel, setLeftPanel] = useState('slots');
  const [mobilePanel, setMobilePanel] = useState('slots');
  const [theme, setTheme] = useState(getInitialTheme);
  const [start, setStart] = useState(toDateInputValue(new Date()));
  const [end, setEnd] = useState(toDateInputValue(new Date()));
  const [proposalTitle, setProposalTitle] = useState('');
  const [proposalStart, setProposalStart] = useState(toDateInputValue(new Date()));
  const [proposalEnd, setProposalEnd] = useState(toDateInputValue(new Date()));
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [editingSlotId, setEditingSlotId] = useState(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editUserId, setEditUserId] = useState('');
  const [editingManagedUserId, setEditingManagedUserId] = useState(null);
  const [editManagedUsername, setEditManagedUsername] = useState('');
  const [editManagedPassword, setEditManagedPassword] = useState('');
  const [editManagedIsAdmin, setEditManagedIsAdmin] = useState(false);
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
      const error = new Error(formatApiError(err));
      error.status = res.status;
      throw error;
    }
    return res.json();
  }

  async function submitAuth(e) {
    e.preventDefault();
    setMessage('');
    const cleanUsername = username.trim();
    try {
      if (mode === 'register') {
        await api('/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: cleanUsername, password }),
        });
      }
      const form = new URLSearchParams();
      form.append('username', cleanUsername);
      form.append('password', password);
      const data = await api('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      });
      if (!data.access_token) {
        throw new Error('Logowanie nie zwróciło tokena dostępu.');
      }
      await loadData(data.access_token);
      localStorage.setItem('token', data.access_token);
      setToken(data.access_token);
    } catch (err) {
      localStorage.removeItem('token');
      setToken('');
      setMessage(err.message);
    }
  }

  async function loadData(authToken = token) {
    if (!authToken) return;
    const headers = authHeaders(authToken);
    const meData = await api('/users/me', { headers });
    const busyData = await api('/busy', { headers });
    const proposalsData = await api('/proposals', { headers });
    const usersData = await api('/users', { headers });
    setCurrentUser(meData);
    setBusy(busyData);
    setProposals(proposalsData);
    setUsers(usersData);

    if (meData.is_admin) {
      setSelectedUserId((previous) => (
        usersData.some((user) => String(user.id) === previous) ? previous : String(meData.id)
      ));
    } else {
      setSelectedUserId('');
    }
  }

  useEffect(() => {
    if (!token) return;
    loadData(token).catch((err) => {
      if (err.status === 401 || err.status === 403) {
        localStorage.removeItem('token');
        setToken('');
        setCurrentUser(null);
        setUsers([]);
        setBusy([]);
        setProposals([]);
        setSelectedUserId('');
        cancelEditing();
        cancelManagedUserEditing();
      }
      setMessage(err.message);
    });
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

  async function addProposal(e) {
    e.preventDefault();
    setMessage('');
    try {
      const payload = buildProposalPayload(proposalTitle, proposalStart, proposalEnd);
      await api('/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify(payload),
      });
      setProposalTitle('');
      await loadData();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function voteProposal(id, vote) {
    setMessage('');
    try {
      await api(`/proposals/${id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ vote }),
      });
      await loadData();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function closeProposal(id) {
    setMessage('');
    try {
      await api(`/proposals/${id}/close`, {
        method: 'POST',
        headers: authHeaders(token),
      });
      await loadData();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function deleteProposal(id) {
    setMessage('');
    try {
      await api(`/proposals/${id}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      });
      await loadData();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function createManagedUser(e) {
    e.preventDefault();
    setMessage('');
    try {
      await api('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({
          username: newUserUsername.trim(),
          password: newUserPassword,
          is_admin: newUserIsAdmin,
        }),
      });
      setNewUserUsername('');
      setNewUserPassword('');
      setNewUserIsAdmin(false);
      await loadData();
    } catch (err) {
      setMessage(err.message);
    }
  }

  function startEditingManagedUser(user) {
    setMessage('');
    setEditingManagedUserId(user.id);
    setEditManagedUsername(user.username);
    setEditManagedPassword('');
    setEditManagedIsAdmin(Boolean(user.is_admin));
  }

  function cancelManagedUserEditing() {
    setEditingManagedUserId(null);
    setEditManagedUsername('');
    setEditManagedPassword('');
    setEditManagedIsAdmin(false);
  }

  async function updateManagedUser(id) {
    setMessage('');
    try {
      const payload = {
        username: editManagedUsername.trim(),
        is_admin: editManagedIsAdmin,
      };
      if (editManagedPassword) {
        payload.password = editManagedPassword;
      }

      await api(`/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify(payload),
      });
      cancelManagedUserEditing();
      await loadData();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function deleteManagedUser(id) {
    setMessage('');
    try {
      await api(`/users/${id}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      });
      if (editingManagedUserId === id) {
        cancelManagedUserEditing();
      }
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
    setProposals([]);
    setSelectedUserId('');
    cancelEditing();
    cancelManagedUserEditing();
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
  const canVoteProposal = (proposal) => (
    proposal.status === 'open' && proposal.creator_user_id !== currentUser?.id
  );

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
          <input
            placeholder="Nazwa użytkownika"
            value={username}
            onChange={e => setUsername(e.target.value)}
            minLength={3}
            maxLength={80}
            autoComplete="username"
            required
          />
          <input
            placeholder="Hasło"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            minLength={6}
            maxLength={128}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />
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
        className={mobilePanel === 'proposals' ? 'toggle active' : 'toggle'}
        onClick={() => setMobilePanel('proposals')}
        aria-pressed={mobilePanel === 'proposals'}
      >
        <CalendarRange size={18}/> Propozycje
      </button>
      <button
        type="button"
        className={mobilePanel === 'users' ? 'toggle active' : 'toggle'}
        onClick={() => setMobilePanel('users')}
        aria-pressed={mobilePanel === 'users'}
      >
        <Users size={18}/> Użytkownicy
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
      <div className={isAdmin ? 'side-column admin-side-column' : 'side-column'}>
      <div className="side-tabs" role="group" aria-label="Lewy panel">
        <button
          type="button"
          className={leftPanel === 'slots' ? 'toggle active' : 'toggle'}
          onClick={() => setLeftPanel('slots')}
          aria-pressed={leftPanel === 'slots'}
        >
          <Plus size={18}/> Zajęte
        </button>
        <button
          type="button"
          className={leftPanel === 'proposals' ? 'toggle active' : 'toggle'}
          onClick={() => setLeftPanel('proposals')}
          aria-pressed={leftPanel === 'proposals'}
        >
          <CalendarRange size={18}/> Propozycje
        </button>
        <button
          type="button"
          className={leftPanel === 'users' ? 'toggle active' : 'toggle'}
          onClick={() => setLeftPanel('users')}
          aria-pressed={leftPanel === 'users'}
        >
          <Users size={18}/> Użytkownicy
        </button>
      </div>
      <aside className={`card slots-card side-card ${leftPanel === 'slots' ? 'desktop-active' : ''} ${mobilePanel === 'slots' ? 'mobile-active' : ''}`}>
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

      <section className={`card proposals-card side-card ${leftPanel === 'proposals' ? 'desktop-active' : ''} ${mobilePanel === 'proposals' ? 'mobile-active' : ''}`}>
        <form onSubmit={addProposal} className="proposal-form">
          <label>
            Nazwa
            <input
              value={proposalTitle}
              onChange={e => setProposalTitle(e.target.value)}
              placeholder="Spotkanie lub wyjazd"
              minLength={3}
              maxLength={120}
              required
            />
          </label>
          <label>Od<input type="date" value={proposalStart} onChange={e => setProposalStart(e.target.value)} required /></label>
          <label>Do<input type="date" value={proposalEnd} onChange={e => setProposalEnd(e.target.value)} required /></label>
          <button><Plus size={18}/> Dodaj propozycję</button>
        </form>

        <div className="proposal-list">
          {proposals.length === 0 && <p className="empty-state">Brak propozycji.</p>}
          {proposals.map((proposal) => (
            <article className={`proposal-item ${proposal.status}`} key={proposal.id}>
              <div className="proposal-head">
                <div>
                  <b>{proposal.title}</b>
                  <span>{formatSlotDateRange(proposal)}</span>
                  <small>Autor: {proposal.creator_username}</small>
                </div>
                <span className={`status-pill ${proposal.status}`}>
                  {proposal.status === 'closed' ? 'Zamknięta' : 'Otwarta'}
                </span>
              </div>

              {proposal.status === 'open' && proposal.my_vote && (
                <p className="proposal-vote-note">Twój głos: {voteLabel(proposal.my_vote)}</p>
              )}

              {canVoteProposal(proposal) && (
                <div className="proposal-votes">
                  <button
                    type="button"
                    className={proposal.my_vote === 'yes' ? 'vote-yes active' : 'vote-yes'}
                    onClick={() => voteProposal(proposal.id, 'yes')}
                  >
                    <Check size={16}/> Za
                  </button>
                  <button
                    type="button"
                    className={proposal.my_vote === 'no' ? 'secondary vote-no active' : 'secondary vote-no'}
                    onClick={() => voteProposal(proposal.id, 'no')}
                  >
                    <X size={16}/> Przeciw
                  </button>
                </div>
              )}

              {proposal.status === 'closed' && proposal.results && (
                <div className="proposal-results">
                  <div className="result-row">
                    <span>Za</span>
                    <div className="result-bar yes"><i style={{ width: `${proposal.results.yes_percent}%` }} /></div>
                    <strong>{proposal.results.yes_count} ({proposal.results.yes_percent}%)</strong>
                  </div>
                  <div className="result-row">
                    <span>Przeciw</span>
                    <div className="result-bar no"><i style={{ width: `${proposal.results.no_percent}%` }} /></div>
                    <strong>{proposal.results.no_count} ({proposal.results.no_percent}%)</strong>
                  </div>
                </div>
              )}

              {proposal.can_manage && (
                <div className="proposal-actions">
                  {proposal.status === 'open' && (
                    <button type="button" className="secondary" onClick={() => closeProposal(proposal.id)}>
                      <LockKeyhole size={16}/> Zamknij
                    </button>
                  )}
                  <button type="button" className="icon action-icon" onClick={() => deleteProposal(proposal.id)} title="Usuń propozycję">
                    <Trash2 size={16}/>
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
      <section className={`card admin-users-card side-card ${leftPanel === 'users' ? 'desktop-active' : ''} ${mobilePanel === 'users' ? 'mobile-active' : ''}`}>
          {isAdmin && (
            <form onSubmit={createManagedUser} className="user-form">
              <label>
                Nazwa
                <input
                  value={newUserUsername}
                  onChange={e => setNewUserUsername(e.target.value)}
                  placeholder="Nazwa użytkownika"
                  minLength={3}
                  maxLength={80}
                  required
                />
              </label>
              <label>
                Hasło
                <input
                  type="password"
                  value={newUserPassword}
                  onChange={e => setNewUserPassword(e.target.value)}
                  minLength={6}
                  maxLength={128}
                  autoComplete="new-password"
                  required
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={newUserIsAdmin}
                  onChange={e => setNewUserIsAdmin(e.target.checked)}
                />
                Admin
              </label>
              <button><Plus size={18}/> Dodaj użytkownika</button>
            </form>
          )}

          <div className="user-list">
            {users.map((user) => {
              const editingUser = editingManagedUserId === user.id;
              const isCurrentUser = user.id === currentUser?.id;

              return (
                <article className="user-item" key={user.id}>
                  {isAdmin && editingUser ? (
                    <div className="user-edit">
                      <label>
                        Nazwa
                        <input
                          value={editManagedUsername}
                          onChange={e => setEditManagedUsername(e.target.value)}
                          minLength={3}
                          maxLength={80}
                          disabled={isCurrentUser}
                          required
                        />
                      </label>
                      <label>
                        Nowe hasło
                        <input
                          type="password"
                          value={editManagedPassword}
                          onChange={e => setEditManagedPassword(e.target.value)}
                          minLength={6}
                          maxLength={128}
                          placeholder="Bez zmiany"
                          autoComplete="new-password"
                        />
                      </label>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={editManagedIsAdmin}
                          onChange={e => setEditManagedIsAdmin(e.target.checked)}
                          disabled={isCurrentUser}
                        />
                        Admin
                      </label>
                      <div className="user-actions">
                        <button type="button" className="secondary" onClick={cancelManagedUserEditing}><X size={16}/> Anuluj</button>
                        <button type="button" onClick={() => updateManagedUser(user.id)}><Save size={16}/> Zapisz</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="user-summary">
                        <div>
                          <b>{user.username}</b>
                          {isCurrentUser && <small>To Ty</small>}
                        </div>
                        {user.is_admin && <span className="role-pill">Admin</span>}
                      </div>
                      {isAdmin && (
                        <div className="user-actions">
                          <button type="button" className="secondary action-icon" onClick={() => startEditingManagedUser(user)} title="Edytuj użytkownika">
                            <Pencil size={16}/>
                          </button>
                          <button
                            type="button"
                            className="icon action-icon"
                            onClick={() => deleteManagedUser(user.id)}
                            title="Usuń użytkownika"
                            disabled={isCurrentUser}
                          >
                            <Trash2 size={16}/>
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <section className={`card calendar-card calendar-${calendarView}-view ${mobilePanel === 'calendar' ? 'mobile-active' : ''}`}>
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
          ? <MonthCalendar visibleDate={visibleDate} slots={busy} proposals={proposals} />
          : <YearCalendar visibleDate={visibleDate} slots={busy} onOpenMonth={openMonth} />}
      </section>
    </section>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
