export const DAYS = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];
export const SHORT_DAYS = ['P', 'W', 'Ś', 'C', 'P', 'S', 'N'];
export const DATE_FORMATTER = new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
export const DAY_NAME_FORMATTER = new Intl.DateTimeFormat('pl-PL', { weekday: 'long' });
export const MONTH_FORMATTER = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' });
export const MONTH_NAME_FORMATTER = new Intl.DateTimeFormat('pl-PL', { month: 'long' });
export const YEAR_FORMATTER = new Intl.DateTimeFormat('pl-PL', { year: 'numeric' });

function pad(n) {
  return String(n).padStart(2, '0');
}

export function getMonday(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function addYears(date, years) {
  return new Date(date.getFullYear() + years, 0, 1);
}

export function toDateInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDateInputValue(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatDate(date) {
  return DATE_FORMATTER.format(date);
}

export function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function getMonthDays(date) {
  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = getMonday(firstOfMonth);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function getMonthActualDays(date) {
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, day) => new Date(date.getFullYear(), date.getMonth(), day + 1));
}

export function getUsersForDate(slots, date) {
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

export function getSlotsForDate(slots, date) {
  const dayStart = startOfDay(date);
  const dayEnd = addDays(dayStart, 1);

  return slots
    .filter((slot) => new Date(slot.start_time) < dayEnd && new Date(slot.end_time) > dayStart)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time) || a.username.localeCompare(b.username));
}

export function proposalCalendarStatus(proposal) {
  if (proposal.status === 'open') {
    return 'pending';
  }

  if (proposal.status === 'closed' && proposal.results?.yes_count > proposal.results?.no_count) {
    return 'accepted';
  }

  return null;
}

export function getProposalsForDate(proposals, date) {
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

export function getCalendarItemsForDate(slots, proposals, date) {
  const busyItems = getSlotsForDate(slots, date).map((slot) => ({
    id: `busy-${slot.id}`,
    type: 'busy',
    start_time: slot.start_time,
    end_time: slot.end_time,
    slot,
  }));
  const proposalItems = getProposalsForDate(proposals, date).map((proposal) => ({
    id: `proposal-${proposal.id}`,
    type: 'proposal',
    status: proposal.calendarStatus,
    start_time: proposal.start_time,
    end_time: proposal.end_time,
    proposal,
  }));

  return [...busyItems, ...proposalItems].sort((a, b) => (
    new Date(a.start_time) - new Date(b.start_time)
    || a.type.localeCompare(b.type)
  ));
}

export function displayEndDate(endTime) {
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

export function formatSlotDateRange(slot) {
  const startDate = startOfDay(new Date(slot.start_time));
  const endDate = displayEndDate(slot.end_time);
  return isSameDay(startDate, endDate)
    ? formatDate(startDate)
    : `${formatDate(startDate)} - ${formatDate(endDate)}`;
}

export function getSlotStartInputValue(slot) {
  return toDateInputValue(startOfDay(new Date(slot.start_time)));
}

export function getSlotEndInputValue(slot) {
  return toDateInputValue(displayEndDate(slot.end_time));
}

export function updateRangeStart(nextStart, currentEnd, setStartValue, setEndValue) {
  setStartValue(nextStart);
  if (nextStart && currentEnd && currentEnd < nextStart) {
    setEndValue(nextStart);
  }
}

export function updateRangeEnd(nextEnd, currentStart, setStartValue, setEndValue) {
  setEndValue(nextEnd);
  if (nextEnd && currentStart && currentStart > nextEnd) {
    setStartValue(nextEnd);
  }
}

export function buildBusyPayload(startValue, endValue, userId) {
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

export function buildProposalPayload(titleValue, startValue, endValue, participantIds) {
  const title = titleValue.trim();
  if (!title) {
    throw new Error('Podaj nazwę wydarzenia.');
  }

  const participantUserIds = [...new Set(participantIds.map(Number).filter(Boolean))];
  if (participantUserIds.length === 0) {
    throw new Error('Wybierz co najmniej jednego uczestnika wydarzenia.');
  }

  const payload = buildBusyPayload(startValue, endValue);
  return {
    title,
    start_time: payload.start_time,
    end_time: payload.end_time,
    participant_user_ids: participantUserIds,
  };
}

export function formatProposalParticipants(proposal) {
  if (!proposal.participants?.length) {
    return 'Brak uczestników';
  }

  return proposal.participants.map((participant) => participant.username).join(', ');
}

export function voteLabel(vote) {
  if (vote === 'yes') return 'za';
  if (vote === 'no') return 'przeciw';
  return '';
}
