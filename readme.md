## Netlify Plugin Bundle ENV

A Netlify Build Plugin to inject environment variables in Netlify Functions (or server-side code) during Netlify Builds.

### Motivation:

Netlify uses AWS Lambda for Netlify Functions. Few frameworks use Netlify Functions to deploy server-side functionality to the applications. AWS imposes a limitation of 4 KiB for environment variables (name + value). Netlify also adds some system-level environment variables, so the real limit is not exactly 4 KiB. While this limit might be enough for a lot of people, some large environment variables fail due to this limit. To tackle this, Netlify now has Scoped Environment Variables to separate build-time and function-level environment variables. However, a few people still seem to be affected by the limit.

### Working:

This build plugin scans all the files (extensions can be modified) in user-configured directories. It prepends all the variables as `process.env['VAR_NAME'] = value` at the top of each file. Thus, when accessing them in the files, the variables will always exist.

### Installation:

Add the following to your `netlify.toml` file:

```toml
[[plugins]]
  package = "netlify-plugin-bundle-env"
```

and run `npm i netlify-plugin-bundle-env` to make sure the plugin is added as a dependency. As an alternative, you can also add the plugin directly in your `package.json` as:

```json
{
  "dependencies": {
    "netlify-plugin-bundle-env": "0.5.0"
  }
}
```

### Supports:

The plugin supports JavaScript as well as TypeScript files by default. Any additional extensions can be added via `netlify.toml`. The following ways of using environment variables are supported:

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

- Dynamic references:

```js
function getKey(key) {
  return process.env[key]
}
```

You can mix and match these ways of using environment variables across your project.

Note that, the plugin is only really useful when you use the scoped environment variables feature. If you do not, all variables from the UI are published to AWS Lambda, thus rendering this plugin useless.

When building locally, the plugin takes care of restoring the original files after deploying.

### Configuration:

The plugin can be used in plug-n-play mode without any additional configuration. However, there are a few options that you can use to customise the plugin's default behaviour:

| Name        | Type          | Description                                                                | Required | Default         |
|-------------|---------------|----------------------------------------------------------------------------|----------|-----------------|
| backup-dir  | string        | Directory to backup the original functions in (relative to base directory) | No       | ''              |
| debug       | boolean       | Enables verbose logging for the plugin                                     | No       | false           |
| directories | Array<string> | List of directories to process (relative to base directory)                | No       | [FUNCTIONS_SRC] |
| exclude     | Array<string> | List of variables to not process                                           | No       | []              |
| extensions  | Array<string> | List of extensions to process                                              | No       | ["js", "ts"]    |
| files       | Array<string> | List of files to process (relative to base directory)                      | No       | []              |
| include     | Array<string> | List of variables to process                                               | No       | []              |

Note:

1. `backup-dir` when set to `''` (default) backs up the original functions alongside the actual function file. The file is saved as `<file-name>.<ext>.bak`. You might need to override this in case you are including all files from your functions folder and bundling these `.bak` files is causing some issues. The directory, if specified, is created for you. Note that, this directory is deleted after processing, so it's better to use a directory which is not required by your application otherwise.
2. `directories` should only include the "start" directory. Any subdirectories will be automatically included. Thus, glob patterns are not supported. If you provide a directory here, it will override the default directory. To include the default directory, you need to add that to the array too. Unlike `exclude` and `include`, an empty array for this will automatically use the functions' directory of the site. This should not be used together with `files`.
3. Both `exclude` and `include` should contain only the name of the variable. For example, if you wish to add `process.env.VAR_1` in the list, you should only add `VAR_1` (case-sensitive).
4. If `exclude` is specified, all variables excluding those in the list will be added to the files. If `include` is specified, only the variables included in that list will be added to the function. Using `exclude` and `include` together is not supported and can cause unexpected results.
5. `extensions` should be specified without the dot (`.`). For example, if you wish to process `file.jsx`, you should only add `jsx` (case-sensitive). If you provide an extension here, it will override the default extensions. To include the default extensions, you need to add those to the array too.
6. `files` should include the list of files that you wish to process. When this is provided, only the files in this list are processed. This should not be used together with `directories`. That option is ignored when using this one.

The options can be configured only in `netlify.toml` as follows:

```toml
[[plugins]]
  package = "netlify-plugin-bundle-env"
  [plugins.inputs]
    backup-dir = ""
    debug = true
    directories = []
    exclude = []
    extensions = ["js", "ts"]
    include = []
```

If, for some unexpected use-case, this plugin does not work, feel free to open an issue, only if you're able to provide a reproduction case. Not all use-cases can be accommodated, but at least they can be considered.