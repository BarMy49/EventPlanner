from __future__ import annotations

import secrets
from datetime import date, datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

from cryptography.fernet import Fernet, InvalidToken

from .config import GoogleCalendarConfig, google_calendar_config


CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events"
OAUTH_STATE_TTL_SECONDS = 10 * 60


class CalendarConfigurationError(RuntimeError):
    pass


class CalendarIntegrationError(RuntimeError):
    pass


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class GoogleCalendarService:
    def is_available(self) -> bool:
        try:
            return google_calendar_config() is not None
        except ValueError:
            return False

    def config(self) -> GoogleCalendarConfig:
        try:
            config = google_calendar_config()
        except ValueError as exc:
            raise CalendarConfigurationError(str(exc)) from exc
        if not config:
            raise CalendarConfigurationError("Google Calendar integration is not configured")
        return config

    def create_oauth_state(self) -> dict[str, str]:
        expires_at = datetime.now(timezone.utc).timestamp() + OAUTH_STATE_TTL_SECONDS
        return {"value": secrets.token_urlsafe(32), "expires_at": str(int(expires_at))}

    def oauth_state_is_valid(self, state_record: Any, state: str) -> bool:
        if not isinstance(state_record, dict) or not state or state_record.get("value") != state:
            return False
        try:
            return int(state_record.get("expires_at", "0")) > datetime.now(timezone.utc).timestamp()
        except (TypeError, ValueError):
            return False

    def authorization_url(self, state: str) -> str:
        config = self.config()
        try:
            from google_auth_oauthlib.flow import Flow
        except ImportError as exc:
            raise CalendarConfigurationError("Google Calendar dependencies are not installed") from exc

        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": config.client_id,
                    "client_secret": config.client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                }
            },
            scopes=[CALENDAR_SCOPE],
            redirect_uri=config.redirect_uri,
        )
        authorization_url, _ = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
            state=state,
        )
        return authorization_url

    def exchange_code(self, code: str) -> str:
        config = self.config()
        try:
            from google_auth_oauthlib.flow import Flow
        except ImportError as exc:
            raise CalendarConfigurationError("Google Calendar dependencies are not installed") from exc

        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": config.client_id,
                    "client_secret": config.client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                }
            },
            scopes=[CALENDAR_SCOPE],
            redirect_uri=config.redirect_uri,
        )
        try:
            flow.fetch_token(code=code)
        except Exception as exc:
            raise CalendarIntegrationError("Google Calendar authorization could not be completed") from exc
        refresh_token = flow.credentials.refresh_token
        if not refresh_token:
            raise CalendarIntegrationError("Google did not return an offline access token")
        return refresh_token

    def encrypt_refresh_token(self, refresh_token: str) -> str:
        try:
            return Fernet(self.config().token_encryption_key.encode("utf-8")).encrypt(refresh_token.encode("utf-8")).decode("utf-8")
        except (ValueError, TypeError) as exc:
            raise CalendarConfigurationError("GOOGLE_TOKEN_ENCRYPTION_KEY is not a valid Fernet key") from exc

    def _decrypt_refresh_token(self, user: dict) -> str:
        encrypted_token = user.get("google_calendar", {}).get("refresh_token")
        if not encrypted_token:
            raise CalendarIntegrationError("Google Calendar is not connected")
        try:
            return Fernet(self.config().token_encryption_key.encode("utf-8")).decrypt(encrypted_token.encode("utf-8")).decode("utf-8")
        except (InvalidToken, ValueError, TypeError) as exc:
            raise CalendarIntegrationError("Google Calendar authorization needs to be reconnected") from exc

    def _calendar_api(self, user: dict):
        config = self.config()
        refresh_token = self._decrypt_refresh_token(user)
        try:
            from google.auth.transport.requests import Request
            from google.oauth2.credentials import Credentials
            from googleapiclient.discovery import build
        except ImportError as exc:
            raise CalendarConfigurationError("Google Calendar dependencies are not installed") from exc

        credentials = Credentials(
            token=None,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=config.client_id,
            client_secret=config.client_secret,
            scopes=[CALENDAR_SCOPE],
        )
        try:
            credentials.refresh(Request())
            return build("calendar", "v3", credentials=credentials, cache_discovery=False)
        except Exception as exc:
            raise CalendarIntegrationError("Google Calendar authorization needs to be reconnected") from exc

    def _timezone(self) -> ZoneInfo:
        try:
            return ZoneInfo(self.config().event_time_zone)
        except Exception as exc:
            raise CalendarConfigurationError("EVENT_TIME_ZONE is not a valid IANA time zone") from exc

    def _proposal_dates(self, proposal: dict) -> tuple[date, date]:
        timezone_value = self._timezone()
        start = datetime.fromisoformat(proposal["start_time"]).astimezone(timezone_value).date()
        end = datetime.fromisoformat(proposal["end_time"]).astimezone(timezone_value).date()
        return start, end

    def _proposal_state(self, proposal: dict) -> str | None:
        if proposal.get("status") == "open":
            return "pending"
        results = proposal_results(proposal)
        if proposal.get("status") == "closed" and results["yes_count"] > results["no_count"]:
            return "confirmed"
        return None

    def _is_eligible(self, proposal: dict, user: dict) -> bool:
        return user["id"] == proposal.get("creator_user_id") or user["id"] in proposal.get("participant_user_ids", [])

    def _is_current_or_future(self, proposal: dict) -> bool:
        _, end = self._proposal_dates(proposal)
        return end > datetime.now(self._timezone()).date()

    def _event_body(self, proposal: dict, state: str) -> dict:
        start, end = self._proposal_dates(proposal)
        config = self.config()
        if state == "pending":
            summary = f"Głosowanie: {proposal['title']}"
            description = f"Głosowanie trwa. Oddaj głos w Event Planner: {config.app_public_url}"
            status = "tentative"
        else:
            summary = f"Potwierdzone: {proposal['title']}"
            description = f"Wydarzenie zaakceptowane w Event Planner: {config.app_public_url}"
            status = "confirmed"
        return {
            "summary": summary,
            "description": description,
            "status": status,
            "start": {"date": start.isoformat()},
            "end": {"date": end.isoformat()},
            "extendedProperties": {
                "private": {
                    "event_planner_proposal_id": str(proposal["id"]),
                    "event_planner_state": state,
                }
            },
        }

    def _delete_event(self, api, event_id: str) -> None:
        try:
            api.events().delete(calendarId="primary", eventId=event_id, sendUpdates="none").execute()
        except Exception as exc:
            if "404" not in str(exc):
                raise CalendarIntegrationError("Google Calendar event could not be removed") from exc

    def _upsert_event(self, api, link: dict | None, proposal: dict, state: str) -> dict:
        body = self._event_body(proposal, state)
        event_id = link.get("event_id") if link else None
        if event_id:
            try:
                event = api.events().patch(
                    calendarId="primary",
                    eventId=event_id,
                    body=body,
                    sendUpdates="none",
                ).execute()
                return {"event_id": event["id"], "state": state}
            except Exception as exc:
                if "404" not in str(exc):
                    raise CalendarIntegrationError("Google Calendar event could not be updated") from exc
        try:
            event = api.events().insert(calendarId="primary", body=body, sendUpdates="none").execute()
        except Exception as exc:
            raise CalendarIntegrationError("Google Calendar event could not be created") from exc
        return {"event_id": event["id"], "state": state}

    def _calendar_record(self, user: dict) -> dict:
        calendar = user.setdefault("google_calendar", {})
        calendar.setdefault("event_links", {})
        calendar.setdefault("last_sync_at", None)
        calendar.setdefault("last_error", None)
        return calendar

    def _sync_proposal(self, user: dict, proposal: dict, api) -> None:
        calendar = self._calendar_record(user)
        links = calendar["event_links"]
        link_key = str(proposal["id"])
        link = links.get(link_key)
        target_state = self._proposal_state(proposal)

        if not self._is_eligible(proposal, user) or not self._is_current_or_future(proposal) or not target_state:
            if link and target_state is None:
                self._delete_event(api, link["event_id"])
                links.pop(link_key, None)
            elif link and not self._is_current_or_future(proposal):
                links.pop(link_key, None)
            return

        links[link_key] = self._upsert_event(api, link, proposal, target_state)

    def sync_user(self, user: dict, proposals: list[dict]) -> None:
        calendar = self._calendar_record(user)
        if not calendar.get("refresh_token"):
            raise CalendarIntegrationError("Google Calendar is not connected")

        try:
            api = self._calendar_api(user)
            proposals_by_id = {str(proposal["id"]): proposal for proposal in proposals}
            for proposal_id, link in list(calendar["event_links"].items()):
                proposal = proposals_by_id.get(str(proposal_id))
                if not proposal:
                    self._delete_event(api, link["event_id"])
                    calendar["event_links"].pop(str(proposal_id), None)
            for proposal in proposals:
                if self._is_eligible(proposal, user):
                    self._sync_proposal(user, proposal, api)
            calendar["last_sync_at"] = now_iso()
            calendar["last_error"] = None
        except (CalendarIntegrationError, CalendarConfigurationError) as exc:
            calendar["last_error"] = str(exc)

    def sync_connected_users_for_proposal(self, store: dict, proposal: dict) -> None:
        for user in store["users"]:
            calendar = user.get("google_calendar")
            if not self._is_eligible(proposal, user) or not isinstance(calendar, dict) or not calendar.get("refresh_token"):
                continue
            try:
                api = self._calendar_api(user)
                self._sync_proposal(user, proposal, api)
                calendar["last_sync_at"] = now_iso()
                calendar["last_error"] = None
            except (CalendarIntegrationError, CalendarConfigurationError) as exc:
                calendar["last_error"] = str(exc)

    def delete_proposal_events(self, store: dict, proposal: dict) -> None:
        link_key = str(proposal["id"])
        for user in store["users"]:
            calendar = user.get("google_calendar")
            if not isinstance(calendar, dict):
                continue
            link = calendar.get("event_links", {}).get(link_key)
            if not link or not calendar.get("refresh_token"):
                continue
            try:
                self._delete_event(self._calendar_api(user), link["event_id"])
                calendar["event_links"].pop(link_key, None)
                calendar["last_error"] = None
            except (CalendarIntegrationError, CalendarConfigurationError) as exc:
                calendar["last_error"] = str(exc)

    def disconnect_user(self, user: dict, proposals: list[dict]) -> None:
        calendar = user.get("google_calendar")
        if not isinstance(calendar, dict) or not calendar.get("refresh_token"):
            user.pop("google_calendar", None)
            return

        api = self._calendar_api(user)
        proposals_by_id = {str(proposal["id"]): proposal for proposal in proposals}
        for proposal_id, link in calendar.get("event_links", {}).items():
            proposal = proposals_by_id.get(str(proposal_id))
            if not proposal or self._is_current_or_future(proposal):
                self._delete_event(api, link["event_id"])
        user.pop("google_calendar", None)

    def status(self, user: dict) -> dict:
        calendar = user.get("google_calendar") if isinstance(user.get("google_calendar"), dict) else {}
        return {
            "available": self.is_available(),
            "connected": bool(calendar.get("refresh_token")),
            "last_sync_at": calendar.get("last_sync_at"),
            "last_error": calendar.get("last_error"),
        }


def proposal_results(proposal: dict) -> dict[str, int]:
    participant_ids = set(proposal.get("participant_user_ids", []))
    votes = [vote for vote in proposal.get("votes", []) if vote.get("user_id") in participant_ids]
    yes_count = sum(1 for vote in votes if vote.get("vote") == "yes")
    no_count = sum(1 for vote in votes if vote.get("vote") == "no")
    return {"yes_count": yes_count, "no_count": no_count}
