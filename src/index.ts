// noinspection AnonymousFunctionJS, ChainedFunctionCallJS, ConstantOnRightSideOfComparisonJS, FunctionTooLongJS, FunctionWithMoreThanThreeNegationsJS, FunctionWithMultipleLoopsJS, FunctionWithMultipleReturnPointsJS, IfStatementWithTooManyBranchesJS, JSUnusedGlobalSymbols, MagicNumberJS, NestedFunctionCallJS, NestedFunctionJS, OverlyNestedFunctionJS

import type { NetlifyPluginOptions} from '@netlify/build'
import {cwd} from 'process'
import {lstatSync, readdirSync, readFileSync, writeFileSync, unlinkSync, existsSync} from 'fs'
import {extname, resolve} from 'path'
export function onEnd(plugin : NetlifyPluginOptions) {
  const directoriesToProcess = plugin.inputs['directories'] as Array<string>
  if (directoriesToProcess.length === 0) {
    directoriesToProcess.push(plugin.constants.FUNCTIONS_SRC as string)
  }
  directoriesToProcess.forEach(directory => {
    function recursiveProcess(path : string) {
      readdirSync(path).forEach(newPath => {
        const resolvedPath = resolve(path, newPath)
        if (lstatSync(resolvedPath).isDirectory()) {
          recursiveProcess(resolvedPath)
        } else {
          if (extname(resolvedPath) === '.bak') {
            const originalName = resolvedPath.slice(0, -4)
            writeFileSync(originalName, readFileSync(resolvedPath, 'utf-8'))
            unlinkSync(resolvedPath)
            console.log(`${originalName} successfully processed and restored.`)
          }
        }
      })
    }
    recursiveProcess(directory)
  })
}
export function onPreBuild(plugin : NetlifyPluginOptions) {
  const directoriesToProcess = plugin.inputs['directories']
  const excludedEnvs = plugin.inputs['exclude']
  const extensionsToProcess = plugin.inputs['extensions']
  const includedEnvs = plugin.inputs['include']
  const maskValues = plugin.inputs['mask']
  const output = new Map<string, Map<string, string | undefined>>()
  const processedVars : Array<string> = []
  const workingDir = resolve(cwd())
  let countFile = 0
  if (!Array.isArray(directoriesToProcess)) {
    plugin.utils.build.failPlugin('Plugin\'s option "directories" must be an array.')
  } else if (!Array.isArray(excludedEnvs)) {
    plugin.utils.build.failPlugin('Plugin\'s option "exclude" must be an array.')
  } else if (!Array.isArray(extensionsToProcess)) {
    plugin.utils.build.failPlugin('Plugin\'s option "extensions" must be an array.')
  } else if (!Array.isArray(includedEnvs)) {
    plugin.utils.build.failPlugin('Plugin\'s option "include" must be an array.')
  } else if (typeof maskValues !== 'boolean') {
    plugin.utils.build.failPlugin('Plugin\'s option "mask" must be a boolean.')
  } else {
    directoriesToProcess.forEach(directory => {
      if (typeof directory !== 'string') {
        plugin.utils.build.failPlugin(`Plugin's option "directories" must be an array of strings. ${directory} is not a string.`)
      }
    })
    excludedEnvs.forEach(excludedEnv => {
      if (typeof excludedEnv !== 'string') {
        plugin.utils.build.failPlugin(`Plugin's option "exclude" must be an array of strings. ${excludedEnv} is not a string.`)
      }
    })
    extensionsToProcess.forEach((extension, extensionIndex) => {
      if (typeof extension !== 'string') {
        plugin.utils.build.failPlugin(`Plugin's option "extensions" must be an array of strings. ${extension} is not a string.`)
      } else if (extension.startsWith('.')) {
        console.warn(`${extension} should not start with ".". The plugin will remove the "." and continue processing.`)
        extensionsToProcess[extensionIndex] = extension.slice(1)
      }
    })
    includedEnvs.forEach(includedEnv => {
      if (typeof includedEnv !== 'string') {
        plugin.utils.build.failPlugin(`Plugin's option "include" must be an array of strings. ${includedEnv} is not a string.`)
      }
    })
    excludedEnvs.forEach(excludedEnv => {
      // @ts-ignore
      if (includedEnvs.includes(excludedEnv)) {
        console.warn(`${excludedEnv} exists in include as well as exclude list. This is not supported and can produce unexpected results.`)
      }
    })
    if (directoriesToProcess.length === 0) {
      if (plugin.constants.FUNCTIONS_SRC) {
        directoriesToProcess.push(plugin.constants.FUNCTIONS_SRC)
      } else {
        plugin.utils.build.failPlugin('No source directory is specified.')
      }
    }
    directoriesToProcess.forEach(directory => {
      const resolvedPath = resolve(workingDir, directory as string)
      if (existsSync(resolvedPath)) {
        function recursiveProcess(path : string) {
          readdirSync(path).forEach(newPath => {
            const resolvedPath = resolve(path, newPath)
            if (lstatSync(resolvedPath).isDirectory()) {
              recursiveProcess(resolvedPath)
            } else {
              // @ts-ignore
              if (extensionsToProcess.includes(extname(resolvedPath).slice(1))) {
                function processVariable(varName : string) : boolean {
                  // @ts-ignore
                  if (excludedEnvs.includes(varName)) {
                    console.warn(`${varName} will not be replaced because it is in the exclude list.`)
                    return false
                  } else {
                    // @ts-ignore
                    if (includedEnvs.length > 0 && !includedEnvs.includes(varName)) {
                      console.warn(`${varName} will not be replaced because it is in not in the include list.`)
                      return false
                    } else {
                      return true
                    }
                  }
                }
                const originalCode = readFileSync(resolvedPath, 'utf-8')
                let code = originalCode
                const normalMatches = Array.from(code.matchAll(/process\.env\['([\w-]+)']|process\.env\["([\w-]+)"]|process\.env.([\w-]+)/g))
                if (normalMatches.length > 0) {
                  countFile++
                  output.set(resolvedPath, new Map<string, string | undefined>())
                }
                normalMatches.forEach(match => {
                  let varName = match[0]
                  if (varName.startsWith('process.env.')) {
                    varName = varName.slice(12)
                  } else if (varName.startsWith('process.env[')) {
                    varName = varName.slice(13, -2)
                  }
                  if (processVariable(varName)) {
                    const value = process.env[varName]
                    if (value) {
                      code = code.replaceAll(match[0], `'${value.replaceAll('\'', '\\\'')}'`)
                    } else {
                      code = code.replaceAll(match[0], `${`'${value}'`.slice(1, -1)}`)
                    }
                    if (!output.get(resolvedPath)!.has(match[0])) {
                      if (!processedVars.includes(varName)) {
                        processedVars.push(varName)
                      }
                      output.get(resolvedPath)!.set(match[0], value)
                    }
                  }
                })
                const destructuredFinder = /(const|let|var)\s*{((.|\n)*)\s*=\s*process\.env/g
                const destructuredMatches = Array.from(code.matchAll(destructuredFinder))
                if (destructuredMatches.length > 0 && !output.has(resolvedPath)) {
                  countFile++
                  output.set(resolvedPath, new Map<string, string | undefined>())
                }
                destructuredMatches.forEach(match => {
                  let codeToReplace = ''
                  match[0].replace(/^[^{]*/, '').slice(1).replace(/\s*}.*/, '').split(',').map(variable => {
                    return variable.trim()
                  }).forEach(trimmedVariable => {
                    if (trimmedVariable.length > 0) {
                      if (processVariable(trimmedVariable)) {
                        const value = process.env[trimmedVariable]
                        if (value) {
                          codeToReplace += `const ${trimmedVariable} = '${value.replaceAll('\'', '\\\'')}';\n`
                        } else {
                          codeToReplace += `const ${trimmedVariable} = ${value};\n`
                        }
                        if (!output.get(resolvedPath)!.has(trimmedVariable)) {
                          if (!processedVars.includes(trimmedVariable)) {
                            processedVars.push(trimmedVariable)
                          }
                          output.get(resolvedPath)!.set(`{${trimmedVariable}}`, value)
                        }
                      }
                    }
                  })
                  code = code.replace(destructuredFinder, codeToReplace)
                })
                writeFileSync(resolvedPath, code)
                writeFileSync(`${resolvedPath}.bak`, originalCode)
              } else {
                console.log(`Skipping ${resolvedPath} because its extension is not listed in plugin's "extensions" options.`)
              }
            }
          })
        }
        recursiveProcess(resolvedPath)
      } else {
        plugin.utils.build.failPlugin(`${directory} is not a valid directory name or the provided path does not exist.`)
      }
    })
  }
  output.forEach((renderedKeys, path) => {
    console.log(`${path} processed:`)
    renderedKeys.forEach((renderedValue, keyName) => {
      if (renderedValue) {
        if (renderedValue.length > 5 && maskValues) {
          console.log(`  ${keyName}: '${renderedValue.slice(0, 5)}*****'`)
        } else {
          console.log(`  ${keyName}: '${renderedValue}'`)
        }
      } else {
        console.warn(`  ${keyName}: ${renderedValue}`)
      }
    })
  })
  plugin.utils.status.show({
    summary: `Successfully processed ${countFile} file(s) containing ${processedVars.length} variable(s)`,
    title: 'Netlify Plugin Bundle ENV'
  })
}