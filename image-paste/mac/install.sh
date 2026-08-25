#!/bin/zsh
# Install the Mac-side clipboard service for pi-image-paste.
#
# Writes a launchd agent that listens on 127.0.0.1:$PORT and runs
# pi-image-clipd.sh per connection (socket activation, no resident daemon).
# The plist points at this checkout, so updating the repo updates the service.
#
#   mac/install.sh [--port=N] [--host <ssh-host-pattern>]... [--uninstall]
#
# With --host patterns it appends a marked block to ~/.ssh/config adding the
# RemoteForward for those hosts. Without, it prints the block to add yourself.
# Deliberately never writes "Host *": the forward would be requested on every
# ssh (github, git push, ...) and refused ones print a warning each time.
set -euo pipefail

PORT=${PI_IMAGE_PASTE_PORT:-17878}
LABEL=dev.grigsby.pi-image-paste
SCRIPT_DIR=${0:A:h}
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UNINSTALL=0
typeset -a HOSTS
while (( $# )); do
    case $1 in
        --port=*) PORT=${1#--port=} ;;
        --host) shift; HOSTS+=("$1") ;;
        --uninstall) UNINSTALL=1 ;;
        *) print -u2 "unknown argument: $1"; exit 2 ;;
    esac
    shift
done

if (( UNINSTALL )); then
    launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    print "Removed $LABEL. Any pi-image-paste block in ~/.ssh/config is left for you to delete."
    exit 0
fi

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/zsh</string>
        <string>$SCRIPT_DIR/pi-image-clipd.sh</string>
    </array>
    <key>Sockets</key>
    <dict>
        <key>Listeners</key>
        <dict>
            <key>SockNodeName</key>
            <string>127.0.0.1</string>
            <key>SockServiceName</key>
            <string>$PORT</string>
        </dict>
    </dict>
    <key>inetdCompatibility</key>
    <dict>
        <key>Wait</key>
        <false/>
    </dict>
    <key>LimitLoadToSessionType</key>
    <string>Aqua</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$PLIST"
print "Installed $LABEL on 127.0.0.1:$PORT (serving $SCRIPT_DIR/pi-image-clipd.sh)."

FORWARD="    RemoteForward 127.0.0.1:$PORT 127.0.0.1:$PORT"
if (( ${#HOSTS} )); then
    CONFIG="$HOME/.ssh/config"
    mkdir -p "$HOME/.ssh"
    touch "$CONFIG"
    if grep -q ">>> pi-image-paste >>>" "$CONFIG"; then
        print "~/.ssh/config already has a pi-image-paste block; not touching it."
    else
        {
            print ""
            print "# >>> pi-image-paste >>>"
            print "Host ${(j: :)HOSTS}"
            print "$FORWARD"
            print "# <<< pi-image-paste <<<"
        } >> "$CONFIG"
        print "Added RemoteForward for: ${(j: :)HOSTS}"
    fi
else
    print "Add to ~/.ssh/config under the hosts you run pi on:"
    print "$FORWARD"
fi
