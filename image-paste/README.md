# image-paste

Paste images from the Mac clipboard into pi running on a remote machine over
ssh. Modeled on [ssh-paste-image-for-claude](https://github.com/barjakuzu/ssh-paste-image-for-claude)
but with no editor dependency and no scp per paste: the existing ssh connection
carries the image.

```
Mac clipboard -> launchd socket service (127.0.0.1:17878)
              -> ssh RemoteForward
              -> pi extension on the remote (ctrl+v) -> temp file -> attached image
```

Three pieces:

- **Mac**: a launchd socket-activated agent on `127.0.0.1:17878`. No resident
  daemon; per connection launchd runs `mac/pi-image-clipd.sh`, which writes the
  clipboard image as PNG to the socket (`osascript` with a TIFF+`sips`
  fallback, stock macOS only). No image on the clipboard means an empty
  response.
- **Transport**: `RemoteForward 127.0.0.1:17878 127.0.0.1:17878` in your ssh
  config exposes that port on the remote for the life of the connection.
- **Remote**: this extension. Over ssh it claims `ctrl+v` (pi's native paste
  would read the remote's empty clipboard), fetches the PNG through the tunnel,
  writes `pi-clipboard-<uuid>.png` to the temp dir and inserts the path, same
  as pi's native image paste, so pi attaches the image as usual. Local
  sessions are untouched. `/paste-image` does the same from any session.

## Install

Mac side, from this checkout:

```
mac/install.sh --host trig --host bee
```

Installs the launchd agent and adds a marked `RemoteForward` block to
`~/.ssh/config` for the named hosts. Without `--host` it prints the line to add
yourself. It never writes `Host *`: hosts that refuse the forward (github,
anything with `AllowTcpForwarding no`) would print a warning on every
connection, including git pushes. `--uninstall` removes the agent.

Remote side:

```
pi install npm:@guygrigsby/pi-image-paste
```

## Use

Copy an image on the Mac, hit `ctrl+v` in pi on the remote (or `/paste-image`).
The image lands as a temp file path in the editor and is attached on submit.
With no image on the clipboard it says so; text pasting via the terminal's own
cmd+v is unaffected.

## Configuration

- `PI_IMAGE_PASTE_PORT`: port on both sides (default 17878; pass
  `--port=N` to `install.sh` to match).
- `PI_IMAGE_PASTE=1|0`: force the `ctrl+v` takeover on or off. Default is on
  only when `SSH_CONNECTION`/`SSH_TTY`/`SSH_CLIENT` is set; a tmux session
  created before the ssh login can lose those.

## Protocol

Connect, read to EOF. PNG bytes = the clipboard image; empty = no image;
anything else is treated as an error (something else on the port). 32MB cap,
5s timeout.

## Security

While a session with the forward is up, any user on the remote host can read
the Mac clipboard image via `127.0.0.1:17878` there. Fine for single-user
boxes; don't add the forward for shared hosts. On the Mac the service binds
localhost only, and any local process can read the clipboard anyway.
