## Netlify Plugin Bundle ENV

A Netlify Build Plugin to inject environment variables in Netlify Functions during Netlify Builds.

### Motivation:

Netlify uses AWS Lambda for Netlify Functions. AWS imposes a limitation of 4 KiB for environment variables (name + value). While this limit might be enough for a lot of people, some large environment variables fail due to this limit. To tackle this, Netlify now has Scoped Environment Variables to seprate build-time and function-level environment variables. However, a few people still seem to be affected by the limit.

### Working:

This build plugin scans all the JavaScript and TypeScript files in the user-configured Functions' directory. It replaces all the declared environment variables with the values available during build time. This allows users to scope the environment variables only to the builds.

### Installation:

Add the following to your `netlify.toml` file:

```toml
[[plugins]]
  package = "netlify-plugin-bundle-env"
```

and run `npm i netlify-plugin-bundle-env` to make sure the plugin is added as a dependency.

By default, Netlify checks for functions in `./netlify/functions` directory (relative to the base directory). if you override this setting, that directory will be scanned instead.

### Supports:

All three ways of using environment variables is supported:

- Indexed Signature:

```js
const varName = process.env['VAR_NAME']
```

- Dot Notation:

```js
const varName = process.env.VAR_NAME
```

- Destructuring:

```js
const { VAR_NAME } = process.env
```

You can mix and match these three ways of using environment variables across your project.