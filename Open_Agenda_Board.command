#!/bin/bash
# Opens agenda-board.html as a compact, borderless app window (sticky-note style) on macOS.
# Keep this file in the same folder as agenda-board.html.

DIR="$(cd "$(dirname "$0")" && pwd)"
BOARD="file://$DIR/agenda-board.html"
BOARD="${BOARD// /%20}"
ARGS=(--app="$BOARD" --window-size=980,620)

if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args "${ARGS[@]}"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
  open -na "Microsoft Edge" --args "${ARGS[@]}"
elif [ -d "/Applications/Brave Browser.app" ]; then
  open -na "Brave Browser" --args "${ARGS[@]}"
else
  # No Chromium browser found: open in the default browser (normal tab)
  open "$DIR/agenda-board.html"
fi

# Close the Terminal window that macOS opens for .command files
osascript -e 'tell application "Terminal" to close (every window whose name contains "Open_Agenda_Board")' >/dev/null 2>&1 &
exit 0
