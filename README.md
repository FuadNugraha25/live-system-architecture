# Live system architecture

Animated simulations of the Protea Internal Listing backend. Each flow shows a
request travelling between the Edge Function, Supabase Auth and the database
tables, with the real checks and the real order of steps, on fake data.

The Protea Internal Listing codebase (a separate, private repo) is the read-only reference.
Nothing here connects to a real database.

## Stack

React 19 + Vite 7, plain JavaScript/JSX (same as Protea). No other libraries.

## Commands

- Install: `npm install`
- Run: `npm run dev`, then open http://localhost:5180
- Build: `npm run build`

## Structure

- `src/App.jsx`: flow tabs and hash routing (`#login`, `#user-creation`).
- `src/components/`: the page.
  - `FlowView.jsx` lays out one flow and owns the form values.
  - `Board.jsx` holds `Signals`, `Transport` (pause, next step, replay, speed) and `TransitMap`.
  - `ScenarioPanel.jsx`, `RouteList.jsx`, `DataTables.jsx` render the scenario list, the step list and the fake tables.
- `src/engine/`: logic shared by every flow.
  - `useSimulation.js` runs a flow and builds the `ctx` object flows talk to.
  - `player.js` handles speed, pause, next step and cancelling a run.
  - `packets.js` moves the request pill along a line (outside React, every frame).
  - `html.js` escapes values placed in step text.
- `src/flows/`: one file per backend flow, registered in `src/flows/index.js`.
- `src/styles/`: `tokens.css` (colours, type scale, dark mode) and `app.css`.

## Adding a flow

Create `src/flows/<name>.js` exporting an object with:

- `id`, `title`, `summary`, `source`
- `hub` and `client`: node ids of the function and the caller
- `nodes` (`kind`: `client`, `hub`, `service` or `table`; `x`/`y` in a 1000×500 box) and `lines`
- `checks`: the gates shown as signal lights
- `fields` and `scenarios` (`input` fills the form, `flags` adds hidden options, `setup(db)` may seed rows and return a cleanup)
- `createDb()` and `tables`
- `async run(ctx, input)`: the flow itself, using `ctx.say`, `ctx.send`, `ctx.reply`, `ctx.check`, `ctx.commit`, `ctx.fault` and `ctx.respond`

Step text is HTML. Wrap any user-typed value in `ctx.code()` so it is escaped.

Then add it to `src/flows/index.js`.
