export const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

export function formatApiError(err) {
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
