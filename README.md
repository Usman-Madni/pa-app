# PA App

Your personal assistant: tasks with reminders, notes and a calendar, all in one file.

## Use it
Open **`PA App.html`** in **Chrome or Edge** on your computer. Nothing to install.

**First time:**
1. Go to **Settings → Data file → Create new data file**. Save it in OneDrive, e.g. `pa-app-data.json`.
   From then on, every change saves to that file automatically, 2 seconds after you stop typing.
2. In the same place, choose **Daily backups → Choose backup folder**, for example the `backups` folder here.
   The first save each day also writes a dated backup copy there.

**After restarting the browser,** click **Reconnect data file** once. Browsers ask again for file access after a restart.

**Using two computers:**
- Open the same data file on both (**Settings → Open existing data file**).
- Each computer picks up the other's saves within about 20 seconds.
- If both changed something in the meantime, the app asks which version to keep.
- Best used on one computer at a time.

## On your phone (read-only for now)
- Open **https://usman-madni.github.io/pa-app/PA%20App.html** on your phone. You can add it to your home screen.
- On a phone the app only shows your data and never changes it. That stops two different copies from appearing.
- Tap **Open data file** and pick `pa-app-data.json` from OneDrive. To see newer changes, tap **Open newer file** and pick it again.
- Planned: full editing on the phone through OneDrive.

## Theme
The **🌓** button in the sidebar switches between Auto (follows Windows), Dark and Light.

## For development
```bash
npm run setup
```
```bash
npm test
```
`npm run setup` installs the test tools once, outside the project folder. See `CLAUDE.md` and `PA_APP_CONTEXT.md`.
