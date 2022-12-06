# How to publish new release
Publish procedure is a little more difficult because we use `npm alias`es in package dependencies like:
`npm:@sicpa-dlab/aries-framework-core@0.4.1`.

`Lerna` mono-repo manager does not work well with such aliases, which results in inability to properly link local `core`
and `node`/`react-native` packages during build process. Instead of using local ones, the remote packages from GH registry are used during bootstrap.

For that reason, `core` package must be published first. Then, it will be possible to build `node` and `react-native` too.

## Steps:
### Step 1. Update and publish `core` package
- Bump version of `core` manually
  - Update dependency packages like `gossip` and `value-transfer` if necessary
  - Commit code
- Clean all `node_modules` and `build` folders
- `cd` to repo root, run `yarn install --force --no-lockfile`
- `cd packages/core`, `yarn publish` to publish core package

### Step 2. Update and publish `node` and `react-native`
- Bump version of `node` and `react-native` manually
  - Update `core` dependency to the latest version
  - Update dependency packages like `gossip` and `value-transfer` if necessary
  - Commit code
- Clean all `node_modules` and `build` folders (**Important**)
  - Need to make sure everything is completely removed
  - Otherwise, there is a chance old versions of `gossip` or `value-transfer` libs may be left in node_modules
- `cd` to repo root, run `yarn install --force --no-lockfile` (again)
- `cd packages/node`, `yarn publish` to publish node package
- `cd packages/react-native`, `yarn publish` to publish react-native package


### All good

Now, do not forget to update Mobile and Backend apps with newer version of Aries Framework Javascript.
