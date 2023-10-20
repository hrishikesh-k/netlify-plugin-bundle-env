import {basename, extname, join} from 'node:path'
import chalk from 'chalk'
import {copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {cwd, env} from 'node:process'
import type {NetlifyPlugin, NetlifyPluginOptions} from '@netlify/build'
export default function bundleEnv(inputs : NetlifyPluginOptions<{
  'backup-dir' : string
  debug : boolean
  directories : Array<string>
  exclude : Array<string>
  extensions : Array<string>
  files : Array<string>
  include : Array<string>
}>['inputs']) : NetlifyPlugin {
  const filesOrDirs : Array<string> = []
  const processedVars : Array<string> = []
  const workingDir = cwd()
  let countFile = 0
  function logDebug(message : string) {
    if (inputs.debug) {
      console.log(chalk.blue(message))
    }
  }
  function logSuccess(message : string) {
    console.log(chalk.green(message))
  }
  function logWarn(message : string) {
    console.log(chalk.yellow(message))
  }
  function recursiveProcess(path : string, callback : (pathToProcess : string) => void) {
    logDebug(`recursiveProcess: checking ${path}`)
    if (lstatSync(path).isDirectory()) {
      logDebug(`${path} is a directory, performing recursive call`)
      readdirSync(path).forEach(newPath => {
        const absolutePath = join(path, newPath)
        logDebug(`recursiveProcess: absolutePath: ${absolutePath}, checking if directory`)
        recursiveProcess(absolutePath, callback)
      })
    } else {
      logDebug(`${path} is a file, calling callback`)
      callback(path)
    }
  }
  return {
    onEnd: () => {
      if (inputs['backup-dir'].length) {
        const backupDirAbsolute = join(workingDir, inputs['backup-dir'])
        recursiveProcess(backupDirAbsolute, pathToProcess => {
          if (extname(pathToProcess) === '.path') {
            logDebug(`restoring backup from ${pathToProcess}`)
            copyFileSync(pathToProcess.slice(0, -5), readFileSync(pathToProcess, 'utf-8'))
          }
        })
        logDebug(`deleting ${backupDirAbsolute}`)
        rmSync(backupDirAbsolute, {
          recursive: true
        })
        logSuccess('Backup successfully processed and files have been restored.')
      } else {
        filesOrDirs.forEach(fileOrDirectory => {
          logDebug(`processing ${fileOrDirectory}`)
          recursiveProcess(join(workingDir, fileOrDirectory), pathToProcess => {
            if (inputs.files.length && inputs.extensions.includes(extname(pathToProcess).slice(1))) {
              const backupFile = `${pathToProcess}.bak`
              logDebug(`restoring backup from ${backupFile}`)
              writeFileSync(pathToProcess, readFileSync(backupFile, 'utf-8'))
              logDebug(`deleting ${backupFile}`)
              rmSync(backupFile)
              logSuccess(`${pathToProcess} successfully processed and restored.`)
            } else if (extname(pathToProcess) === '.bak') {
              logDebug(`restoring backup from ${pathToProcess}`)
              const originalName = pathToProcess.slice(0, -4)
              writeFileSync(originalName, readFileSync(pathToProcess, 'utf-8'))
              logDebug(`deleting ${pathToProcess}`)
              rmSync(pathToProcess)
              logSuccess(`${originalName} successfully processed and restored.`)
            }
          })
        })
      }
    },
    onPreBuild: plugin => {
      logDebug(`resolved config:\n  - backup-dir: ${inputs['backup-dir']}\n  - debug: ${inputs.debug}\n  - directories: ${inputs.directories.join(', ')}\n  - exclude: ${inputs.exclude.join(', ')}\n  - extensions: ${inputs.extensions.join(', ')}\n  - files: ${inputs.files.join(', ')}\n  - include: ${inputs.include.join(', ')}`)
      logDebug('checking extensions')
      inputs.extensions.forEach((extension, extensionIndex) => {
        if (extension.startsWith('.')) {
          logWarn(`${extension} should not start with '.'. The plugin will remove the '.' and continue processing.`)
          inputs.extensions[extensionIndex] = extension.slice(1)
        }
      })
      logDebug('checking for excluded/included conflict')
      inputs.exclude.forEach(excludedEnv => {
        if (inputs.include.includes(excludedEnv)) {
          logWarn(`${excludedEnv} exists in include as well as exclude list. This is not supported and can produce unexpected results.`)
        }
      })
      logDebug('checking for directories/files conflict')
      if (inputs.directories.length && inputs.files.length) {
        logWarn('directories and files, both are provided, the former will be ignored')
        inputs.files.forEach(file => {
          filesOrDirs.push(file)
        })
      } else if (inputs.files.length) {
        logWarn('files is provided, Netlify Functions would not be automatically processed')
        inputs.files.forEach(file => {
          filesOrDirs.push(file)
        })
      } else {
        logDebug('directories and files not provided, adding functions src to directories')
        if (plugin.constants.FUNCTIONS_SRC) {
          filesOrDirs.push(plugin.constants.FUNCTIONS_SRC)
        } else {
          plugin.utils.build.failPlugin('No source directory is specified.')
        }
      }
      filesOrDirs.forEach(fileOrDirectory => {
        logDebug(`processing: ${fileOrDirectory}`)
        const absolutePath = join(workingDir, fileOrDirectory)
        logDebug(`absolute path: ${absolutePath}, checking its existence`)
        if (existsSync(absolutePath)) {
          logDebug(`${absolutePath} found`)
          recursiveProcess(absolutePath, pathToProcess => {
            logDebug(`checking if ${pathToProcess} has an included extension`)
            if (inputs.extensions.includes(extname(pathToProcess).slice(1))) {
              logDebug(`${pathToProcess} has an included extension`)
              countFile++
              function processVariable(varName : string) {
                logDebug(`validating if ${varName} should be processed`)
                if (inputs.exclude.includes(varName)) {
                  logWarn(`${varName} will not be replaced because it is in the exclude list.`)
                  return false
                } else if (inputs.include.length) {
                    if (inputs.include.includes(varName)) {
                      return true
                    } else {
                      logWarn(`${varName} will not be replaced because it is in not in the include list.`)
                      return false
                    }
                  } else {
                  return true
                }
              }
              logDebug(`reading ${pathToProcess}`)
              const originalCode = readFileSync(pathToProcess, 'utf-8').trim()
              writeFileSync(pathToProcess, `${Object.keys(env).map(varName => {
                if (processVariable(varName)) {
                  if (!processedVars.includes(varName)) {
                    logDebug(`adding ${varName} to processedVars`)
                    processedVars.push(varName)
                  }
                  logDebug(`writing ${varName} to file`)
                  return `process.env['${varName}'] = '${env[varName]}'`
                } else {
                  if (!env[varName]) {
                    logWarn(`skipping ${varName} because its value is undefined`)
                  }
                  return false
                }
              }).filter(mappedVarName => {
                return mappedVarName
              }).join(';')};\n${originalCode}`)
              if (inputs['backup-dir'].length) {
                logDebug('backup-dir provided')
                const backupDirResolved = join(workingDir, inputs['backup-dir'])
                logDebug(`backupDir absolute path: ${backupDirResolved}, checking if it exists`)
                if (!existsSync(backupDirResolved)) {
                  logDebug('backupDir doesn\'t exist, creating it')
                  mkdirSync(backupDirResolved, {
                    recursive: true
                  })
                }
                logDebug(`checking file-tree in backupDir`)
                const dirInBackupDir = join(backupDirResolved, fileOrDirectory)
                logDebug(`backupDir file-tree absolute path: ${dirInBackupDir}, checking if it exists`)
                if (!existsSync(dirInBackupDir)) {
                  logDebug(`backupDir file-tree doesn't exist, creating it`)
                  mkdirSync(dirInBackupDir, {
                    recursive: true
                  })
                }
                const fileInBackupDir = join(dirInBackupDir, basename(pathToProcess))
                logDebug(`writing ${pathToProcess} in backupDir at: ${fileInBackupDir}`)
                writeFileSync(fileInBackupDir, originalCode)
                logDebug(`writing ${fileInBackupDir}'s original path`)
                writeFileSync(`${fileInBackupDir}.path`, pathToProcess)
              } else {
                logDebug('no backup-dir provided, backing up along-side original file')
                writeFileSync(`${pathToProcess}.bak`, originalCode)
              }
            } else {
              logWarn(`Skipping ${basename(pathToProcess)} because its extension is not listed in plugin's "extensions" options.`)
            }
          })
        } else {
          plugin.utils.build.failPlugin(`${fileOrDirectory} does not exist.`)
        }
      })
      plugin.utils.status.show({
        summary: `Successfully processed ${countFile} file(s) containing ${processedVars.length} variable(s)`,
        title: 'Netlify Plugin Bundle ENV'
      })
    }
  }
}