# header

Replaces pi's built-in startup header (logo + keybinding hints) with a big
block π, the pi version, and a time-of-day greeting to its right:

```
 ████████████
  ██     ██      PI v0.81.1
  ██     ██      evening, Guy
  ██     ██
  ██     ██▄
```

The greeting name is resolved once at startup from, in order: `PI_HEADER_NAME`,
git `user.name`, then the OS username — first token, capitalized. Set
`PI_HEADER_NAME` to override.

Requires `quietStartup: false` in your settings. `setHeader` is a no-op when the
built-in header is silenced, so with `quietStartup: true` you would see nothing.

## Install

```
pi install npm:@guygrigsby/pi-header
```

## Config

- `PI_HEADER_NAME` — name used in the greeting (else git `user.name`, else OS user).
