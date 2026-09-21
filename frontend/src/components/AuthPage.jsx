import { CalendarDays } from 'lucide-react';
import ThemeToggle from './ThemeToggle.jsx';

export default function AuthPage({ mode, username, password, message, theme, onToggleTheme, onSubmit, onModeChange, onUsernameChange, onPasswordChange }) {
  return <main className="auth-page">
    <ThemeToggle theme={theme} onToggle={onToggleTheme} />
    <section className="card auth-card">
      <div className="logo"><CalendarDays /> Event Planner</div>
      <h1>{mode === 'login' ? 'Logowanie' : 'Rejestracja'}</h1>
      <form onSubmit={onSubmit}>
        <input placeholder="Nazwa użytkownika" value={username} onChange={(event) => onUsernameChange(event.target.value)} minLength={3} maxLength={80} autoComplete="username" required />
        <input placeholder="Hasło" type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} minLength={6} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
        <button>{mode === 'login' ? 'Zaloguj' : 'Utwórz konto'}</button>
      </form>
      <button type="button" className="link" onClick={onModeChange}>{mode === 'login' ? 'Nie masz konta? Zarejestruj się' : 'Masz konto? Zaloguj się'}</button>
      {message && <p className="error">{message}</p>}
    </section>
  </main>;
}
