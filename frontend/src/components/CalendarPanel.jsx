import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, List } from 'lucide-react';
import { EventsCalendar, MonthCalendar, YearCalendar } from './CalendarViews.jsx';

export default function CalendarPanel({ calendarTitle, calendarView, visibleDate, slots, proposals, mobileActive, onNavigate, onToday, onViewChange, onOpenMonth }) {
  return <section className={`card calendar-card calendar-${calendarView}-view ${mobileActive ? 'mobile-active' : ''}`}>
    <div className="calendar-nav">
      <div className="nav-group">
        <button type="button" className="secondary icon-label" onClick={() => onNavigate(-1)}><ChevronLeft size={18}/> Poprzedni</button>
        <button type="button" className="secondary icon-only" onClick={onToday} title="Dzisiaj"><CalendarDays size={18}/></button>
        <button type="button" className="secondary icon-label" onClick={() => onNavigate(1)}>Następny <ChevronRight size={18}/></button>
      </div>
      <strong>{calendarTitle}</strong>
      <div className="view-toggle" role="group" aria-label="Widok kalendarza">
        <button type="button" className={calendarView === 'month' ? 'toggle active' : 'toggle'} onClick={() => onViewChange('month')} aria-pressed={calendarView === 'month'} aria-label="Widok miesiąca" title="Widok miesiąca"><CalendarDays size={18}/> Miesiąc</button>
        <button type="button" className={calendarView === 'year' ? 'toggle active' : 'toggle'} onClick={() => onViewChange('year')} aria-pressed={calendarView === 'year'} aria-label="Widok roku" title="Widok roku"><CalendarRange size={18}/> Rok</button>
        <button type="button" className={calendarView === 'events' ? 'toggle active' : 'toggle'} onClick={() => onViewChange('events')} aria-pressed={calendarView === 'events'} aria-label="Widok wydarzeń" title="Widok wydarzeń"><List size={18}/> Wydarzenia</button>
      </div>
    </div>
    {calendarView === 'month' && <MonthCalendar visibleDate={visibleDate} slots={slots} proposals={proposals} />}
    {calendarView === 'year' && <YearCalendar visibleDate={visibleDate} slots={slots} onOpenMonth={onOpenMonth} />}
    {calendarView === 'events' && <EventsCalendar visibleDate={visibleDate} slots={slots} proposals={proposals} />}
  </section>;
}
