# Wariya

A browser-based motion-graphics and video editor in a single HTML file: templates, keyframes, transitions, text animation, effects, subtitles, music, and exports to MOV (with transparency), MP4, WebM, PNG sequences and WAV.

## Run it

Open it from a local web server (needed for Google sign-in and some browser features):

```bash
python -m http.server 8765 --bind 127.0.0.1
```

Then visit `http://localhost:8765/Wariya.html`.

## Use it inside Premiere Pro

The same app runs as a panel in Premiere Pro 2022 or newer (Windows). From the project folder, run:

```powershell
powershell -ExecutionPolicy Bypass -File premiere\install.ps1
```

Then open **Window > Extensions > Wariya** (restart Premiere the first time). Run the installer again after changing the app, then close and reopen the panel.

Inside Premiere:

- **Export** writes the file straight to `Wariya Exports` next to your Premiere project (or in Documents if the project is not saved yet), with no size limit. Under **In Premiere Pro** in the export dialog, choose to add it to the timeline at the playhead (on the first free track above V1), import it into the "Wariya" bin, or only save it.
- Transparent MOV and PNG sequences keep their transparency over your footage.
- **From Premiere** in Media brings in the clips selected in the Project panel or on the timeline.
- **Match the Premiere sequence** in the Composition panel copies the active sequence's size and frame rate.
- Google Drive sync is only available in the browser version.

The installer moves any older version of the panel to `Documents\Wariya\panel-backup-…`, and turns on Premiere's setting for loading panels that are not from Adobe Exchange (`PlayerDebugMode`) if it is off.
