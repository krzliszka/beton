# 🚀 INSTRUKCJA WDROŻENIA - Opcja A (Hybrid)

## ARCHITEKTURA
- **betonn.cc** → GitHub Pages (statyczna strona)
- **betonn.cc/api/** → Vercel Serverless Functions (backend Strava)

---

## KROK 1: Zainstaluj Vercel CLI

```bash
npm install -g vercel
```

Zaloguj się do Vercel:
```bash
vercel login
```

---

## KROK 2: Stwórz aplikację Strava

1. Idź na https://www.strava.com/settings/api
2. Kliknij **"Create an App"**
3. Wypełnij:
   - **Application Name**: Beton Rywalizacja
   - **Category**: Training
   - **Website**: https://betonn.cc
   - **Authorization Callback Domain**: `betonn.cc`
4. Zapisz **Client ID** i **Client Secret**

---

## KROK 3: Skonfiguruj config.json

Skopiuj przykładowy config:
```bash
cp api/config.example.json api/config.json
```

Edytuj `api/config.json`:
```json
{
  "strava_app": {
    "client_id": "TWOJE_CLIENT_ID_ZE_STRAVY",
    "client_secret": "TWOJE_CLIENT_SECRET_ZE_STRAVY"
  },
  "segments": [
    {
      "id": 12345678,
      "name": "Nazwa Segmentu",
      "type": "GORY",
      "distance_km": 3.5,
      "avg_grade": 7.2,
      "multiplier": 1.0
    }
  ],
  "participants": [],
  "settings": {
    "cache_ttl_minutes": 30,
    "date_range": {
      "start": "2026-02-21T00:00:00Z",
      "end": "2026-03-03T23:59:59Z"
    }
  }
}
```

---

## KROK 4: Deploy do Vercel

W folderze projektu:
```bash
cd /Users/krzysiek/beton-landing
vercel
```

Odpowiedz na pytania:
- **Set up and deploy?** → Yes
- **Which scope?** → Twoja nazwa
- **Link to existing project?** → No
- **Project name?** → `beton-api` (lub cokolwiek)
- **Directory?** → `.` (kropka - current directory)
- **Override settings?** → No

Vercel wyświetli URL (np. `beton-api.vercel.app`)

---

## KROK 5: Dodaj Custom Domain

W panelu Vercel (https://vercel.com):
1. Otwórz projekt `beton-api`
2. Settings → Domains
3. Dodaj: `betonn.cc`
4. Vercel pokaże DNS settings

W panelu domeny (gdzie kupiłeś betonn.cc):
- **Typ A Record**: usuń/zastąp tym z Vercel
- **Typ CNAME**: dodaj `cname.vercel-dns.com`

**WAŻNE**: GitHub Pages używa głównej domeny, więc:
- Usuń `betonn.cc` z GitHub Pages Settings
- Dodaj tylko `betonn.cc` do Vercel

---

## KROK 6: Dodaj Zmienne Środowiskowe (opcjonalne)

W Vercel → Settings → Environment Variables:
- `STRAVA_CLIENT_ID` = Twoje Client ID
- `STRAVA_CLIENT_SECRET` = Twoje Client Secret

Wtedy w `config.json` możesz użyć:
```json
{
  "strava_app": {
    "client_id": "${STRAVA_CLIENT_ID}",
    "client_secret": "${STRAVA_CLIENT_SECRET}"
  }
}
```

---

## KROK 7: Test autoryzacji

Odwiedź: `https://betonn.cc/api/auth`

Powinien pokazać się ekran autoryzacji Strava.
Kliknij "Połącz ze Stravą" i zaloguj się swoim kontem.

Sprawdź czy zostałeś dodany:
`https://betonn.cc/api/strava?action=participants`

---

## KROK 8: Znajdź segmenty

1. Wejdź na https://www.strava.com/segments/explore
2. Przesuń mapę do okolic Calpe/Moraira/Alicante
3. Kliknij segment → URL zawiera ID, np. `strava.com/segments/12345678`
4. Dodaj ID do `api/config.json`

Typy segmentów:
- **GORY** - avg_grade > 3%
- **SPRINT** - avg_grade ≈ 0%

---

## KROK 9: Test API

Sprawdź rankingi:
```
https://betonn.cc/api/strava?action=rankings
```

Powinien zwrócić JSON z rankingami.

---

## KROK 10: Dodaj uczestników

Wyślij link każdemu uczestnikowi:
```
https://betonn.cc/api/auth
```

Po zalogowaniu są automatycznie dodawani do rywalizacji.

---

## 🔧 DEBUGOWANIE

### Problem: 500 Error
- Sprawdź logi: `vercel logs`
- Sprawdź czy `config.json` ma poprawny JSON

### Problem: Brak segmentów
- Sprawdź daty w `date_range` (czy pokrywają się z wyjazdем)
- Sprawdź czy segment_id jest poprawny

### Problem: Tokeny nie działają
- Sprawdź scope w aplikacji Strava (powinno być `read,activity:read`)

---

## 📝 NASTĘPNE KROKI

Jak backend działa → przechodzimy do **Kroku 3** (Frontend UI)
