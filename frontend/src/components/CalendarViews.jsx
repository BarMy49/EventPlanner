import { useMemo } from 'react';
import {
  DAYS,
  SHORT_DAYS,
  DAY_NAME_FORMATTER,
  MONTH_NAME_FORMATTER,
  formatDate,
  formatProposalParticipants,
  formatSlotDateRange,
  getCalendarItemsForDate,
  getMonthActualDays,
  getMonthDays,
  getProposalsForDate,
  getUsersForDate,
  isSameDay,
  startOfDay,
} from '../utils/calendar.js';

export function MonthCalendar({ visibleDate, slots, proposals }) {
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

export function YearCalendar({ visibleDate, slots, onOpenMonth }) {
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

export function EventsCalendar({ visibleDate, slots, proposals }) {
  const days = useMemo(
    () => getMonthActualDays(visibleDate)
      .map((date) => ({ date, items: getCalendarItemsForDate(slots, proposals, date) }))
      .filter((day) => day.items.length > 0),
    [visibleDate, slots, proposals],
  );

  return (
    <div className="events-calendar">
      {days.length === 0 && (
        <p className="empty-state events-empty">Brak wydarzeń i zajętych terminów w tym miesiącu.</p>
      )}
      {days.map((day) => (
        <section className="events-day" key={day.date.toISOString()}>
          <div className="events-day-header">
            <div>
              <strong>{formatDate(day.date)}</strong>
              <span>{DAY_NAME_FORMATTER.format(day.date)}</span>
            </div>
            <small>Wpisy: {day.items.length}</small>
          </div>
          <div className="events-list">
            {day.items.map((item) => {
              if (item.type === 'busy') {
                return (
                  <article className="calendar-event busy" key={item.id}>
                    <span className="event-kind busy">Zajęte</span>
                    <div className="event-details">
                      <b>{item.slot.username}</b>
                      <span>{formatSlotDateRange(item.slot)}</span>
                    </div>
                  </article>
                );
              }

              return (
                <article className={`calendar-event ${item.status}`} key={item.id}>
                  <span className={`event-kind ${item.status}`}>
                    {item.status === 'accepted' ? 'Zaakceptowane' : 'Głosowanie'}
                  </span>
                  <div className="event-details">
                    <b>{item.proposal.title}</b>
                    <span>{formatSlotDateRange(item.proposal)}</span>
                    <small>Autor: {item.proposal.creator_username}</small>
                    <small>Uczestnicy: {formatProposalParticipants(item.proposal)}</small>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
