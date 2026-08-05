#!/usr/bin/env bash
# Optional: daily append-only backup of Claude Code transcripts.
# ~/.claude/projects is pruned after ~30 days; a mirror preserves history for mining.
# macOS: launchd agent. Linux: cron entry. Usage: install-backup.sh [backup-dir]
set -euo pipefail

DEST="${1:-$HOME/.claude-transcript-backup}"
SRC="$HOME/.claude/projects"
LABEL="cc-ascension-backup"

mkdir -p "$DEST"
chmod 700 "$DEST"  # transcripts can contain pasted secrets — owner-only
BACKUP_CMD="rsync -a $SRC/ $DEST/projects/"

if [[ "$(uname)" == "Darwin" ]]; then
  PLIST="$HOME/Library/LaunchAgents/com.$LABEL.plist"
  cat > "$PLIST" << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>/bin/sh</string><string>-c</string><string>$BACKUP_CMD</string>
  </array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>12</integer><key>Minute</key><integer>0</integer></dict>
  <key>RunAtLoad</key><true/>
  <key>StandardErrorPath</key><string>$DEST/backup.err</string>
</dict></plist>
PLIST_EOF
  launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  echo "installed launchd agent com.$LABEL (daily 12:00 + now), mirror: $DEST"
else
  CRON_LINE="0 12 * * * $BACKUP_CMD"
  (crontab -l 2>/dev/null | grep -v "$LABEL" ; echo "$CRON_LINE # $LABEL") | crontab -
  eval "$BACKUP_CMD"
  echo "installed cron entry (daily 12:00, ran once now), mirror: $DEST"
fi
echo "mine against it later with: node scripts/mine.mjs --src $DEST/projects"
