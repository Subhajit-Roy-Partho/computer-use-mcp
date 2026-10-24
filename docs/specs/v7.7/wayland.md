# Wayland: what 7.7.0 does, and the libei plan

Status: design note for K7, 2026-10-24. The window and capture backends below shipped in 7.7.0. Input through libei
has not been written yet.

## Where 7.6 stood

On Linux the server was an X11 program that ran on Wayland only when XWayland let it:

- **Windows** came from GNOME Shell's `org.gnome.Shell.Eval`. GNOME 41 and later refuse `Eval` unless the shell runs
  in unsafe mode, so on a current Ubuntu or Fedora desktop the call returned `(false, '')`. The `wmctrl -l -p` fallback
  saw only XWayland windows and reported every one of them at 0,0, sized 0x0. A missing `wmctrl` gave an empty list
  with no error.
- **Screenshots** tried `gnome-screenshot`, then `grim`, then `scrot`, all with inherited stdio. On GNOME 42 and
  later, `gnome-screenshot` called from another program is refused. Each tool was handed an existing temporary file,
  and `scrot` writes beside a file that already exists, so even a successful `scrot` read back an empty file.
- **Input** is `ydotool`: it writes to `/dev/uinput` and needs its daemon running with access to that device. That
  part is unchanged in 7.7.0.

## What 7.7.0 does

`native/src/linux_desktop.rs` picks a backend from the variables each compositor sets:

| Session | Window list and activation | Window capture | Screen capture |
|---|---|---|---|
| sway (`SWAYSOCK`) | `swaymsg -t get_tree`, `[con_id=N] focus` | `grim -g` on the window's rectangle | `grim` |
| Hyprland (`HYPRLAND_INSTANCE_SIGNATURE`) | `hyprctl clients -j`, `dispatch focuswindow address:` | `grim -g` | `grim` |
| GNOME on Wayland | `Eval` when the shell allows it, otherwise XWayland windows through `wmctrl` (named as partial) | the screen | `gnome-screenshot`, then the desktop portal |
| KDE and other Wayland compositors | XWayland windows through `wmctrl` | the screen | `grim` where the compositor supports it, then the portal |
| X11 | `wmctrl -l -p -G` with real geometry, `xdotool windowactivate` and a bounded wait | ImageMagick `import -window` | `scrot`, `gnome-screenshot`, `import` |

- Every shell-out goes through `linux_tools`, so no child writes to the MCP channel, and a missing tool is an error
  that names the package (L1, L2).
- The **desktop portal** (`org.freedesktop.portal.Screenshot`, non-interactive) is the capture of last resort on
  Wayland. Its answer comes as a `Response` signal on a request object, so a short fixed python3 script holds the bus
  connection for it. That is the same python3-gi dependency the AT-SPI bridge already has. GNOME asks the person once
  before the first portal screenshot. A refusal is reported as declined, not as a missing tool.
- `doctor` has a `linux_backends` check. It names the session, the compositor and the window, capture and input
  backends, and says when GNOME is limited to XWayland windows.
- Hyprland window addresses are 64-bit. The window id is the low 32 bits, and activation looks the full address up
  again.

## What is still missing

- **Window list on GNOME Wayland.** No public interface lists another program's Wayland windows. The options are a
  shell extension (the "Window Calls" extension exposes a D-Bus list; this server would document it, not install it),
  the AT-SPI tree (application frames with extents; we already have the bridge), or unsafe mode. The AT-SPI route is
  the least intrusive and is the next step.
- **KDE.** KWin scripting can list windows, but the result comes back through the journal or a D-Bus callback.
  `kdotool` does this and could be a backend once it is packaged widely.
- **Input without ydotool.** See the plan below.

## The libei plan

libei ("emulated input") is the supported way for a program to send input to a Wayland compositor. A sender gets an
EIS connection from the compositor. Under GNOME 46 and later, and KDE 6.1 and later, it does that through the
**RemoteDesktop portal** (`org.freedesktop.portal.RemoteDesktop.ConnectToEIS`), with the person's consent once per
session, or once and remembered when the portal's `persist_mode` allows. The sender then creates a seat and gets
pointer, keyboard and absolute-pointer devices.

Proposed shape:

1. **A small helper, not the addon.** libei is a C library, and the portal handshake is D-Bus with signals, like the
   screenshot portal. A Rust helper binary (or a python3 script for the handshake that passes the EIS file descriptor
   to the addon) keeps the addon free of a hard libei link. Hosts without libei keep using ydotool and xdotool.
2. **Consent is the person's.** The first `ConnectToEIS` shows the portal dialog. The server returns
   `approval_required` with a hint ("approve the remote desktop request on screen") instead of waiting silently, and it
   keeps the `restore_token` so later sessions do not ask again.
3. **Absolute pointer first.** `ei_device` with `EI_DEVICE_CAP_POINTER_ABSOLUTE` takes logical coordinates per region,
   which matches the coordinate contract (K6). Relative motion is only for drags in apps that ignore jumps.
4. **Keyboard through the keymap the compositor sends.** EIS sends an XKB keymap. Key names are resolved through it,
   so `type` no longer depends on ydotool's US layout.
5. **The same refusals.** The user-active guard, takeover, the emergency latch and the status card apply unchanged: the
   helper is just another delivery path behind `mouse.rs` and `keyboard.rs`.
6. **Tests.** Mutter has a headless mode with an EIS test server (`mutter --headless --virtual-monitor`). A CI job on
   that is the gate before libei is preferred over ydotool.

Order: AT-SPI window listing on GNOME first (no new dependency), then the libei helper behind
`COMPUTER_USE_LINUX_INPUT=libei`, then libei as the default where `ConnectToEIS` is available.
