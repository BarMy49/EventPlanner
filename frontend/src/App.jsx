import React, { useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  List,
  LockKeyhole,
  Pencil,
  LogOut,
  Plus,
  Save,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { EventsCalendar, MonthCalendar, YearCalendar } from './components/CalendarViews.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import { API, authHeaders, formatApiError } from './utils/api.js';
import {
  MONTH_FORMATTER,
  YEAR_FORMATTER,
  addMonths,
  addYears,
  buildBusyPayload,
  buildProposalPayload,
  formatProposalParticipants,
  formatSlotDateRange,
  getSlotEndInputValue,
  getSlotStartInputValue,
  startOfDay,
  toDateInputValue,
  updateRangeEnd,
  updateRangeStart,
  voteLabel,
} from './utils/calendar.js';
import { THEME_ANIMATION_MS, getInitialTheme } from './utils/theme.js';

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
  const [proposalParticipantIds, setProposalParticipantIds] = useState([]);
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
    const selectableParticipantIds = new Set(
      usersData
        .filter((user) => user.id !== meData.id)
        .map((user) => String(user.id)),
    );
    setProposalParticipantIds((previous) => (
      previous.filter((userId) => selectableParticipantIds.has(userId))
    ));

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
        setProposalParticipantIds([]);
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
      const payload = buildProposalPayload(proposalTitle, proposalStart, proposalEnd, proposalParticipantIds);
      await api('/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify(payload),
      });
      setProposalTitle('');
      setProposalParticipantIds([]);
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

  function toggleProposalParticipant(userId) {
    const participantId = String(userId);
    setProposalParticipantIds((previous) => (
      previous.includes(participantId)
        ? previous.filter((id) => id !== participantId)
        : [...previous, participantId]
    ));
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
    setProposalParticipantIds([]);
    setSelectedUserId('');
    cancelEditing();
    cancelManagedUserEditing();
  }

  function navigateCalendar(direction) {
    setVisibleDate((date) => (
      calendarView === 'year' ? addYears(date, direction) : addMonths(date, direction)
    ));
  }

  function openMonth(date) {
    setVisibleDate(date);
    setCalendarView('month');
  }

  const calendarTitle = calendarView === 'year'
    ? YEAR_FORMATTER.format(visibleDate)
    : MONTH_FORMATTER.format(visibleDate);
  const isAdmin = Boolean(currentUser?.is_admin);
  const proposalParticipantOptions = users.filter((user) => user.id !== currentUser?.id);
  const canManageSlot = (slot) => isAdmin || slot.user_id === currentUser?.id;
  const canVoteProposal = (proposal) => (
    proposal.status === 'open'
    && proposal.creator_user_id !== currentUser?.id
    && proposal.participants?.some((participant) => participant.id === currentUser?.id)
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
        <h1>Planowanie wydarzeń</h1>
        <p>Zaznacz kiedy nie możesz i twórz propozycje wydarzeń dla wybranych uczestników.</p>
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
        <CalendarRange size={18}/> Wydarzenia
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
          <CalendarRange size={18}/> Wydarzenia
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
          <label>Od<input type="date" value={start} onChange={e => updateRangeStart(e.target.value, end, setStart, setEnd)} required /></label>
          <label>Do<input type="date" value={end} onChange={e => updateRangeEnd(e.target.value, start, setStart, setEnd)} required /></label>
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
                <label>Od<input type="date" value={editStart} onChange={e => updateRangeStart(e.target.value, editEnd, setEditStart, setEditEnd)} required /></label>
                <label>Do<input type="date" value={editEnd} onChange={e => updateRangeEnd(e.target.value, editStart, setEditStart, setEditEnd)} required /></label>
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
          <label>Od<input type="date" value={proposalStart} onChange={e => updateRangeStart(e.target.value, proposalEnd, setProposalStart, setProposalEnd)} required /></label>
          <label>Do<input type="date" value={proposalEnd} onChange={e => updateRangeEnd(e.target.value, proposalStart, setProposalStart, setProposalEnd)} required /></label>
          <div className="participant-field">
            <span>Uczestnicy</span>
            <div className="participant-options" role="group" aria-label="Uczestnicy wydarzenia">
              {proposalParticipantOptions.length === 0 && (
                <span className="participant-empty">Brak dostępnych użytkowników.</span>
              )}
              {proposalParticipantOptions.map((user) => (
                <label className="participant-option" key={user.id}>
                  <input
                    type="checkbox"
                    checked={proposalParticipantIds.includes(String(user.id))}
                    onChange={() => toggleProposalParticipant(user.id)}
                  />
                  <span>{user.username}{user.is_admin ? ' (admin)' : ''}</span>
                </label>
              ))}
            </div>
          </div>
          <button><Plus size={18}/> Dodaj wydarzenie</button>
        </form>

        <div className="proposal-list">
          {proposals.length === 0 && <p className="empty-state">Brak wydarzeń.</p>}
          {proposals.map((proposal) => (
            <article className={`proposal-item ${proposal.status}`} key={proposal.id}>
              <div className="proposal-head">
                <div>
                  <b>{proposal.title}</b>
                  <span>{formatSlotDateRange(proposal)}</span>
                  <small>Autor: {proposal.creator_username}</small>
                  <small>Uczestnicy: {formatProposalParticipants(proposal)}</small>
                </div>
                <span className={`status-pill ${proposal.status}`}>
                  {proposal.status === 'closed' ? 'Zamknięte' : 'Głosowanie'}
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
                  {proposal.can_close && (
                    <button type="button" className="secondary" onClick={() => closeProposal(proposal.id)}>
                      <LockKeyhole size={16}/> Zamknij
                    </button>
                  )}
                  <button type="button" className="icon action-icon" onClick={() => deleteProposal(proposal.id)} title="Usuń wydarzenie">
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
              aria-label="Widok miesiąca"
              title="Widok miesiąca"
            >
              <CalendarDays size={18}/> Miesiąc
            </button>
            <button
              type="button"
              className={calendarView === 'year' ? 'toggle active' : 'toggle'}
              onClick={() => setCalendarView('year')}
              aria-pressed={calendarView === 'year'}
              aria-label="Widok roku"
              title="Widok roku"
            >
              <CalendarRange size={18}/> Rok
            </button>
            <button
              type="button"
              className={calendarView === 'events' ? 'toggle active' : 'toggle'}
              onClick={() => setCalendarView('events')}
              aria-pressed={calendarView === 'events'}
              aria-label="Widok wydarzeń"
              title="Widok wydarzeń"
            >
              <List size={18}/> Wydarzenia
            </button>
          </div>
        </div>

        {calendarView === 'month' && (
          <MonthCalendar visibleDate={visibleDate} slots={busy} proposals={proposals} />
        )}
        {calendarView === 'year' && (
          <YearCalendar visibleDate={visibleDate} slots={busy} onOpenMonth={openMonth} />
        )}
        {calendarView === 'events' && (
          <EventsCalendar visibleDate={visibleDate} slots={busy} proposals={proposals} />
        )}
      </section>
    </section>
  </main>;
}

export default App;
