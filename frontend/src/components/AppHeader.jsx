import { LogOut } from 'lucide-react';
import ThemeToggle from './ThemeToggle.jsx';

export default function AppHeader({ currentUser, theme, onToggleTheme, onLogout }) {
  return <header>
    <div>
      <h1>Planowanie wydarzeń</h1>
      <p>Zaznacz kiedy nie możesz i twórz propozycje wydarzeń dla wybranych uczestników.</p>
      {currentUser && <div className="user-meta">{currentUser.username}{currentUser.is_admin && <span>Admin</span>}</div>}
    </div>
    <div className="header-actions">
      <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      <button type="button" className="secondary" onClick={onLogout}><LogOut size={18}/> Wyloguj</button>
    </div>
  </header>;
}
