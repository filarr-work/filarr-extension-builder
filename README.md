# Filarr Extension Builder

Create, test and package extensions for [Filarr](https://filarr.com), with or without code.

- `packages/` — the API, the no-code engine, the simulator and the command-line tools;
- `apps/builder` — the in-browser workshop ([docs/workshop.md](docs/workshop.md));
- `examples/` — twenty example extensions, ten with code and ten no-code;
- `docs/` — the guide: [the workshop](docs/workshop.md), [the command line](docs/cli.md),
  [the no-code engine](docs/nocode.md).

![Filarr Builder: composing a no-code extension, with a preview from the real engine](docs/assets/screenshots/03-vue-et-style.webp)

The Filarr-side contract (sandbox protocol, capabilities, `.filarrext` package format)
is described in this repository, in [`docs/contract/`](docs/contract/README.md):
[API.md](docs/contract/API.md), [CAPABILITIES.md](docs/contract/CAPABILITIES.md),
[PACKAGE.md](docs/contract/PACKAGE.md).

Note: the tools' messages are currently in French.
