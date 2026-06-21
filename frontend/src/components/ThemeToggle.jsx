import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === 'dark';
  return (
    <button type="button" className="secondary theme-toggle" onClick={onToggle} title={isDark ? 'Tryb jasny' : 'Tryb ciemny'}>
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
      {isDark ? 'Jasny' : 'Ciemny'}
    </button>
  );
}
