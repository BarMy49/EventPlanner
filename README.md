# Event Planner App

MVP aplikacji do planowania eventów.

- Backend: Python, FastAPI, JWT
- Dane: prosty plik `backend/data.json`, bez SQLite i bez SQLAlchemy
- Frontend: React + Vite
- Użytkownicy tworzą konta
- Każdy dodaje terminy, kiedy nie może
- Kalendarz pokazuje wspólne zajęte terminy
- Administrator może dodawać, edytować i usuwać terminy wszystkich użytkowników

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
http://localhost:5173
```

## Uruchomienie w Dockerze

```bash
docker compose up --build
```

Frontend działa na:

```text
http://localhost:5173
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

## Gdzie są dane?

Po pierwszym uruchomieniu backend utworzy plik:

```text
backend/data.json
```

Możesz go usunąć, żeby zresetować użytkowników i terminy.
W Dockerze dane są trzymane w wolumenie `backend-data`.

## Uwaga produkcyjna

Ustaw `SECRET_KEY` jako zmienną środowiskową. Ten projekt jest prostym MVP, więc JSON jest OK do nauki/demo, ale do wielu użytkowników naraz lepsza będzie normalna baza danych.
