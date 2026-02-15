# MaiaChat Configuration

This directory contains the configuration files used by MaiaChat.

## Files

- `default.json`: The base configuration shipped with the app.
- `config.json`: The active configuration written by the admin UI and API.
- `config-schema.json`: JSON schema for editor validation and autocompletion.

## How it works

- On startup, MaiaChat loads `default.json` and merges it with `config.json` if present.
- Updates made through the admin UI are persisted to `config.json`.

## Editing

You can edit `config.json` directly for advanced changes. Restart the server after manual edits to ensure changes are applied.
