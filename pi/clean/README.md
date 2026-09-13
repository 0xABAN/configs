# pi-clean

Run official Pi **0.84.2**, the version used in the initial bug reports, without
changing the normal `pi` installation. The npm lockfile pins its dependencies.

## Install

From this directory:

```sh
npm ci --ignore-scripts
mkdir -p "$HOME/.local/bin"
ln -s "$PWD/pi-clean" "$HOME/.local/bin/pi-clean"
```

`~/.local/bin` must be on `PATH`. The link command intentionally refuses to
replace an existing command. Reinstall dependencies with `npm ci --ignore-scripts`;
do not use `pi-clean update` to change the pinned installation.

## Use

```sh
pi-clean
pi-clean --version
pi-clean --tui-mode fullscreen
pi-clean -e /absolute/path/to/repro.ts
```

Each invocation starts in an empty temporary working directory with a fresh home
and Pi configuration. Automatic extensions, skills, templates, themes, and context
files are disabled. Explicit reproduction extensions still work. Use **absolute
paths** for file arguments because the working directory changes.

Inherited credentials, Pi overrides, Node options, and host integration variables
are removed. Terminal capabilities, locale, and `PATH` are retained. Startup
network operations and telemetry are disabled. Model calls are not network-blocked,
but no personal authentication is supplied; UI reproduction needs none.

Sessions are not saved. Temporary files, settings, and any login performed during
the run are discarded on exit. A forced kill or machine crash can leave a
`/tmp/pi-clean.*` directory behind. Export anything you want to keep to an explicit
path outside that temporary directory before quitting.

This is **configuration isolation, not a security sandbox**. Pi's tools and any
explicit extension still run as your user and can access the filesystem. This
launcher does not isolate your operating system, Node installation, or terminal.
Your usual `pi` command, patches, and personal settings remain untouched.

## Verify

```sh
bash -n pi-clean
node --test pi-clean.test.mjs
pi-clean --version
```

The test uses a fake Pi entry point to check fresh state, credential stripping,
argument forwarding, symlink resolution, exit status, cleanup, and missing-install
errors without credentials or model calls.
