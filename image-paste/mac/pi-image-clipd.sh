#!/bin/zsh
# pi-image-clipd.sh - write the Mac clipboard image to stdout as PNG.
#
# Run per-connection by launchd (inetd style, Wait=false): stdout is the
# accepted socket. No image on the clipboard -> no output, so the client reads
# EOF immediately. Stock macOS only: osascript for the pasteboard, sips for
# TIFF -> PNG when an app copied TIFF without a PNG representation.
set -u

tmp=$(mktemp -d) || exit 1
trap 'rm -rf "$tmp"' EXIT

png="$tmp/clip.png"
if osascript - "$png" >/dev/null 2>&1 <<'EOF'
on run argv
    set outPath to item 1 of argv
    set pngData to the clipboard as «class PNGf»
    set f to open for access (POSIX file outPath) with write permission
    set eof of f to 0
    write pngData to f
    close access f
end run
EOF
then
    cat "$png"
    exit 0
fi

tiff="$tmp/clip.tiff"
if osascript - "$tiff" >/dev/null 2>&1 <<'EOF'
on run argv
    set outPath to item 1 of argv
    set tiffData to the clipboard as TIFF picture
    set f to open for access (POSIX file outPath) with write permission
    set eof of f to 0
    write tiffData to f
    close access f
end run
EOF
then
    sips -s format png "$tiff" --out "$png" >/dev/null 2>&1 && cat "$png"
fi
exit 0
