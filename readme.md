## Netlify Plugin Bundle ENV

A Netlify Build Plugin to inject environment variables in Netlify Functions (or server-side code) during Netlify Builds.

### Motivation:

Netlify uses AWS Lambda for Netlify Functions. Quite a few frameworks use Netlify Functions to deploy server-side functionality to the applications. AWS imposes a limitation of 4 KiB for environment variables (name + value). While this limit might be enough for a lot of people, some large environment variables fail due to this limit. To tackle this, Netlify now has Scoped Environment Variables to separate build-time and function-level environment variables. However, a few people still seem to be affected by the limit.

### Working:

This build plugin scans all the files (extensions can be modified) in user-configured directories. It replaces all the declared environment variables with the values available during build time. This allows users to scope the environment variables only to the builds.

### Installation:

Add the following to your `netlify.toml` file:

```toml
[[plugins]]
  package = "netlify-plugin-bundle-env"
```

and run `npm i netlify-plugin-bundle-env` to make sure the plugin is added as a dependency. An an alternative, you can also add the plugin directly in your `package.json` as:

```json
{
  "dependencies": {
    "netlify-plugin-bundle-env": "0.3.1"
  }
}
```

### Supports:

The plugin supports JavaScript as well as TypeScript files by default. Any additional extensions can be added via `netlify.toml`. All three ways of using environment variables are supported:

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

Note that, the plugin is only really useful when you used the scoped environment variables feature. If you do not, all variables from the UI are anyways published to AWS Lambda, thus rendering this plugin useless.

When building locally, the plugin takes care of restoring the original files after deploying.

### Configuration:

The plugin can be used in plug-n-play mode without any additional configuration. However, there are a few options that you can use to customise the plugin's default behaviour:

| Name        | Type          | Description                                                                | Required | Default         |
|-------------|---------------|----------------------------------------------------------------------------|----------|-----------------|
| backup-dir  | string        | Directory to backup the original functions in (relative to base directory) | No       | ''              |
| directories | Array<string> | List of directories to process (relative to base directory)                | No       | [FUNCTIONS_SRC] |
| exclude     | Array<string> | List of variables to not process                                           | No       | []              |
| extensions  | Array<string> | List of extensions to process                                              | No       | ["js", "ts"]    |
| include     | Array<string> | List of variables to process                                               | No       | []              |
| mask        | boolean       | Toggles visibility of environment variables' value in build logs           | No       | true            |

Note:

1. `backup-dir` when set to `''` (default) backs up the original functions alongside the actual function file. The file is saved as `<file-name>.<ext>.bak`. You might need to override this in case you are including all files from your functions folder and bundling these `.bak` files is causing some issues. The directory, if specified, is created for you. Note that, this directory is deleted after processing, so it's better to use a directory which is not required by your application otherwise.
1. `directories` should only include the "start" directory. Any sub-directories will be automatically included. Thus, glob patterns are not supported. If you provide a directory here, it will override the default directories. So, to include the default directories, you need to add those to the array too. Unlike `exclude` and `include`, an empty array for this will automatically use the functions' directory of the site.
1. Both `exclude` and `include` should contain only the name of the variable. For example, if you wish to add `process.env.VAR_1` in the list, you should only add `VAR_1` (case-sensitive).
1. If `exclude` is specified, all variables excluding those in the list will be replaced. If `include` is specified, only the variables included in that list will be replaced. Using `exclude` and `include` together is not supported and can cause unexpected results.
1. `extensions` should be specified without the dot (`.`). For example, if you wish to process `file.jsx`, you should only add `jsx` (case-sensitive). If you provide an extension here, it will override the default extensions. So, to include the default extensions, you need to add those to the array too.
1. `mask` option should not be toggled unless you're absolutely sure. It will print the values of the environment variables that were processed directly in your build logs. However, variable values with less than 5 characters in length will always be logged.

The options can be configured only in `netlify.toml` as follows:

```toml
[[plugins]]
  package = "netlify-plugin-bundle-env"
  [plugins.inputs]
    backup-dir = ""
    directories = []
    exclude = []
    extensions = ["js", "ts"]
    include = []
    mask = true
```

### Limitations:

Dynamic references to environment variables are not supported. For example, the following will not work:

```ts
function getKey(key) {
  return process.env[key]
}
```

It is important to not include such references in your code to avoid any unexpected errors.

This plugin heavily depends on RegEx and thus, assumes that most standard coding practices are followed. If, for some unexpected use-case, this plugin does not work, feel free to open an issue, only if you're able to provide a reproduction case. Not all use-cases can be accommodated, but at least they can be considered.