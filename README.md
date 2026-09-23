# Event Planner App

MVP aplikacji do planowania eventów.

- Backend: Python, FastAPI, JWT
- Dane: prosty plik `backend/data.json`, bez SQLite i bez SQLAlchemy
- Frontend: React + Vite
- Użytkownicy tworzą konta
- Każdy dodaje terminy, kiedy nie może
- Kalendarz pokazuje wspólne zajęte terminy
- Użytkownicy tworzą propozycje dat spotkań/wyjazdów i głosują za albo przeciw
- Administrator może dodawać, edytować i usuwać terminy wszystkich użytkowników
- Administrator może tworzyć, edytować i usuwać konta użytkowników
- Wszyscy zalogowani widzą listę użytkowników

## Uruchomienie backendu

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API działa na:

```text
http://localhost:8000
```

Swagger:

```text
http://localhost:8000/docs
```

## Uruchomienie frontendu

```bash
cd frontend
npm install
npm run dev
```

Frontend działa na:

```text
http://localhost
```

## Uruchomienie w Dockerze

Skopiuj `.env.example` do `.env` i ustaw wszystkie wartości w tym pliku. `.env` jest jedynym miejscem konfiguracji wdrożenia i nie jest śledzony przez Git; `docker-compose.yml` tylko przekazuje te wartości do kontenerów.

DNS domeny musi wskazywać ten serwer, a porty TCP `80` i `443` muszą być dostępne publicznie. Pierwsze uruchomienie pobierze certyfikat Let's Encrypt, a kontener będzie go odnawiał automatycznie.

```bash
docker compose up --build
```

Frontend działa na:

```text
http://localhost
```

API działa na:

```text
http://localhost:8000
```

Przy pustym wolumenie Docker utworzy konto administratora:

```text
login: admin
hasło: admin123
```

Możesz zmienić dane admina i sekret JWT przez zmienne środowiskowe:

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD=strong-password SECRET_KEY=change-me docker compose up --build
```

`docker-compose.yml` przekazuje `ADMIN_USERNAME` i `ADMIN_PASSWORD` do backendu.
Backend czyta je przy starcie i tworzy albo aktualizuje konto administratora o tej nazwie.

## Google Calendar

Po ustawieniu zmiennych `GOOGLE_OAUTH_*`, `GOOGLE_TOKEN_ENCRYPTION_KEY` oraz
`APP_PUBLIC_URL` użytkownik może połączyć swoje konto Google z nagłówka aplikacji.
W Google Cloud utwórz klienta OAuth typu **Web application** i dodaj dokładnie ten
adres przekierowania:

```text
https://twoja-domena.example/api/integrations/google-calendar/callback
```

Po połączeniu aplikacja synchronizuje bieżące i przyszłe propozycje danego użytkownika:
otwarte głosowania są oznaczone jako oczekujące, zatwierdzone większością są aktualizowane,
a odrzucone propozycje są usuwane z Kalendarza Google.

## Gdzie są dane?

Po pierwszym uruchomieniu backend utworzy plik:

```text
backend/data.json
```

Możesz go usunąć, żeby zresetować użytkowników i terminy.
W Dockerze dane są trzymane w wolumenie `backend-data`.

## Testy

Testy backendu korzystają z tymczasowego pliku JSON i nie zmieniają `backend/data.json`:

```bash
cd backend
python -m pip install -r requirements-dev.txt
python -m pytest tests -q
```

Testy frontendu:

```bash
cd frontend
npm install
npm test
npx playwright install
PYTHON=../.venv/Scripts/python.exe npm run test:e2e
```

Test E2E uruchamia lokalnie osobne procesy Uvicorn i Vite na portach 8001 oraz 4173. Nie wymaga Dockera ani nie używa danych aplikacji.

## Uwaga produkcyjna

Ustaw `SECRET_KEY` jako zmienną środowiskową. Ten projekt jest prostym MVP, więc JSON jest OK do nauki/demo, ale do wielu użytkowników naraz lepsza będzie normalna baza danych.
