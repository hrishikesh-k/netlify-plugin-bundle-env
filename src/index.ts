// noinspection AnonymousFunctionJS, ChainedFunctionCallJS, ConstantOnRightSideOfComparisonJS, FunctionTooLongJS, FunctionWithMoreThanThreeNegationsJS, FunctionWithMultipleLoopsJS, FunctionWithMultipleReturnPointsJS, IfStatementWithTooManyBranchesJS, JSUnusedGlobalSymbols, MagicNumberJS, NestedFunctionCallJS, NestedFunctionJS, OverlyNestedFunctionJS

import type {NetlifyPlugin, NetlifyPluginOptions} from '@netlify/build'
import chalk from 'chalk'
import {cwd} from 'process'
import {copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync} from 'fs'
import {basename, extname, resolve} from 'path'
export default function bundleEnv(inputs : NetlifyPluginOptions['inputs']) : NetlifyPlugin {
  const backupDir = inputs['backup-dir']
  const directoriesToProcess = inputs['directories']
  const excludedEnvs = inputs['exclude']
  const extensionsToProcess = inputs['extensions']
  const includedEnvs = inputs['include']
  const maskValues = inputs['mask']
  const output = new Map<string, Map<string, string | undefined>>()
  const processedVars : Array<string> = []
  const workingDir = resolve(cwd())
  let countFile = 0
  function recursiveProcess(path : string, callback : (pathToProcess : string) => void) {
    readdirSync(path).forEach(newPath => {
      const resolvedPath = resolve(path, newPath)
      if (lstatSync(resolvedPath).isDirectory()) {
        recursiveProcess(resolvedPath, callback)
      } else {
        callback(resolvedPath)
      }
    })
  }
  return {
    onEnd: () => {
      if ((backupDir as string).length > 0) {
        const backupDirResolved = resolve(workingDir, backupDir as string)
        recursiveProcess(backupDirResolved, (pathToProcess : string) => {
          if (extname(pathToProcess) === '.path') {
            copyFileSync(pathToProcess.slice(0, -5), readFileSync(pathToProcess, 'utf-8'))
          }
        })
        rmSync(backupDirResolved, {
          recursive: true
        })
        console.log(chalk.green('Backup successfully processed and files have been restored.'))
      } else {
        (directoriesToProcess as Array<string>).forEach(directory => {
          recursiveProcess(resolve(workingDir, directory as string), (pathToProcess : string) => {
            if (extname(pathToProcess) === '.bak') {
              const originalName = pathToProcess.slice(0, -4)
              writeFileSync(originalName, readFileSync(pathToProcess, 'utf-8'))
              unlinkSync(pathToProcess)
              console.log(chalk.green(`${originalName} successfully processed and restored.`))
            }
          })
        })
      }
    },
    onPreBuild: plugin => {
      if (typeof backupDir !== 'string') {
        plugin.utils.build.failPlugin('Plugin\'s option "backup-dir" must be a string.')
      } else if (!Array.isArray(directoriesToProcess)) {
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
            console.log(chalk.yellow(`${extension} should not start with ".". The plugin will remove the "." and continue processing.`))
            extensionsToProcess[extensionIndex] = extension.slice(1)
          }
        })
        includedEnvs.forEach(includedEnv => {
          if (typeof includedEnv !== 'string') {
            plugin.utils.build.failPlugin(`Plugin's option "include" must be an array of strings. ${includedEnv} is not a string.`)
          }
        })
        excludedEnvs.forEach(excludedEnv => {
          if (includedEnvs.includes(excludedEnv)) {
            console.log(chalk.yellow(`${excludedEnv} exists in include as well as exclude list. This is not supported and can produce unexpected results.`))
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
            recursiveProcess(resolvedPath, (pathToProcess : string) => {
              if (extensionsToProcess.includes(extname(pathToProcess).slice(1))) {
                function processVariable(varName : string) : boolean {
                  if ((excludedEnvs as Array<string>).includes(varName)) {
                    console.log(chalk.yellow(`${varName} will not be replaced because it is in the exclude list.`))
                    return false
                  } else {
                    if ((includedEnvs as Array<string>).length > 0 && !(includedEnvs as Array<string>).includes(varName)) {
                      console.log(chalk.yellow(`${varName} will not be replaced because it is in not in the include list.`))
                      return false
                    } else {
                      return true
                    }
                  }
                }
                const originalCode = readFileSync(pathToProcess, 'utf-8')
                let code = originalCode
                const normalMatches = Array.from(code.matchAll(/process\.env\['([\w-]+)']|process\.env\["([\w-]+)"]|process\.env.([\w-]+)/g))
                if (normalMatches.length > 0) {
                  countFile++
                  output.set(pathToProcess, new Map<string, string | undefined>())
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
                    if (!output.get(pathToProcess)!.has(match[0])) {
                      if (!processedVars.includes(varName)) {
                        processedVars.push(varName)
                      }
                      output.get(pathToProcess)!.set(match[0], value)
                    }
                  }
                })
                const destructuredFinder = /(const|let|var)\s*{((.|\n)*)\s*=\s*process\.env/g
                const destructuredMatches = Array.from(code.matchAll(destructuredFinder))
                if (destructuredMatches.length > 0 && !output.has(pathToProcess)) {
                  countFile++
                  output.set(pathToProcess, new Map<string, string | undefined>())
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
                        if (!output.get(pathToProcess)!.has(trimmedVariable)) {
                          if (!processedVars.includes(trimmedVariable)) {
                            processedVars.push(trimmedVariable)
                          }
                          output.get(pathToProcess)!.set(`{${trimmedVariable}}`, value)
                        }
                      }
                    }
                  })
                  code = code.replace(destructuredFinder, codeToReplace)
                })
                writeFileSync(pathToProcess, code)
                if (backupDir.length > 0) {
                  const backupDirResolved = resolve(workingDir, backupDir)
                  if (!existsSync(backupDirResolved)) {
                    mkdirSync(backupDirResolved, {
                      recursive: true
                    })
                  }
                  const dirInBackupDir = resolve(backupDirResolved, directory as string)
                  if (!existsSync(dirInBackupDir)) {
                    mkdirSync(dirInBackupDir, {
                      recursive: true
                    })
                  }
                  const fileInBackupDir = resolve(dirInBackupDir, basename(pathToProcess))
                  writeFileSync(fileInBackupDir, originalCode)
                  writeFileSync(`${fileInBackupDir}.path`, pathToProcess)
                } else {
                  writeFileSync(`${pathToProcess}.bak`, originalCode)
                }
              } else {
                console.log(chalk.yellow(`Skipping ${pathToProcess} because its extension is not listed in plugin's "extensions" options.`))
              }
            })
          } else {
            plugin.utils.build.failPlugin(`${directory} is not a valid directory name or the provided path does not exist.`)
          }
        })
      }
      output.forEach((renderedKeys, path) => {
        console.log(chalk.green(`${path} processed:`))
        renderedKeys.forEach((renderedValue, keyName) => {
          if (renderedValue) {
            if (renderedValue.length > 5 && maskValues) {
              console.log(`  ${keyName}: '${renderedValue.slice(0, 5)}*****'`)
            } else {
              console.log(`  ${keyName}: '${renderedValue}'`)
            }
          } else {
            console.log(chalk.yellow(`  ${keyName}: ${renderedValue}`))
          }
        })
      })
      plugin.utils.status.show({
        summary: `Successfully processed ${countFile} file(s) containing ${processedVars.length} variable(s)`,
        title: 'Netlify Plugin Bundle ENV'
      })
    }
  }
}