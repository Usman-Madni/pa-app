# Personal Assistant

A lightweight web app for tasks & reminders, notes, a calendar, and Gmail + Google Calendar sync.
No build step and no dependencies — just Node.js to serve the files.

## Run it

```bash
node server.js
```

Then open http://localhost:5173.

Tasks, notes and events are saved in your browser (localStorage). Use **Settings → Export backup** to move them between devices.

## Features

- **Today** — greeting, tasks due/overdue, today's schedule, unread email count
- **Tasks** — due date/time, priority, reminders (at time, 10 min, 1 h, 1 day before), filters
- **Calendar** — month view combining your events, task due dates and Google Calendar; add events (optionally to Google too)
- **Notes** — searchable notes that autosave as you type
- **Inbox** — your latest unread Gmail, click to open in Gmail
- **Reminders** — desktop notifications while the app is open in a tab

## Connect Gmail + Google Calendar (one-time, ~5 minutes)

1. Go to https://console.cloud.google.com/ and create a project (any name).
2. **APIs & Services → Library**: enable **Gmail API** and **Google Calendar API**.
3. **APIs & Services → OAuth consent screen**: choose *External*, fill in the app name and your email,
   and under **Test users** add your own Gmail address.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized JavaScript origins: `http://localhost:5173`
5. Copy the **Client ID** (ends in `.apps.googleusercontent.com`) into `config.js`:

   ```js
   window.APP_CONFIG = { GOOGLE_CLIENT_ID: '1234-abc.apps.googleusercontent.com' };
   ```

6. Reload the app, go to **Settings → Connect Google account**.

Google will say the app is "unverified" — that's expected for a personal app in testing mode; click
**Continue**. Access tokens last about an hour, after which the app asks you to reconnect.

Permissions requested: read Gmail (read-only), read/create Calendar events, and your email address.
No data is sent anywhere except directly between your browser and Google.
