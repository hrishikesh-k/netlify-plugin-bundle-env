import type {NetlifyPlugin} from '@netlify/build'
import {cwd} from 'process'
import {lstatSync, readdirSync, readFileSync, writeFileSync, unlinkSync} from 'fs'
import {extname, resolve} from 'path'
// noinspection AnonymousFunctionJS, JSUnusedGlobalSymbols, OverlyNestedFunctionJS,ConstantOnRightSideOfComparisonJS
export default function() : NetlifyPlugin {
  let countFile = 0
  let functionsDir = ''
  const output = new Map<string, Map<string, string | undefined>>()
  const processedVars : Array<string> = []
  // noinspection NestedFunctionCallJS
  const workingDir = resolve(cwd())
  // noinspection FunctionWithMultipleLoopsJS, OverlyNestedFunctionJS
  return {
    onEnd: () => {
      // noinspection NestedFunctionJS
      function recursiveProcess(path : string) {
        // noinspection AnonymousFunctionJS, ChainedFunctionCallJS
        readdirSync(path).forEach(newPath => {
          const resolvedPath = resolve(path, newPath)
          // noinspection ChainedFunctionCallJS
          if (lstatSync(resolvedPath).isDirectory()) {
            recursiveProcess(resolvedPath)
          } else {
            // noinspection ConstantOnRightSideOfComparisonJS
            if (extname(resolvedPath) === '.bak') {
              const originalName = resolvedPath.slice(0, -4)
              // noinspection NestedFunctionCallJS
              writeFileSync(originalName, readFileSync(resolvedPath, 'utf-8'))
              unlinkSync(resolvedPath)
              console.log(`File ${originalName} successfully processed and restored.`)
            }
          }
        })
      }
      recursiveProcess(functionsDir)
    },
    onPreBuild: plugin => {
      if (plugin.constants.FUNCTIONS_SRC) {
        // noinspection ReuseOfLocalVariableJS
        functionsDir = resolve(workingDir, plugin.constants.FUNCTIONS_SRC)
        // noinspection FunctionWithMultipleLoopsJS, NestedFunctionJS
        function recursiveProcess(path : string) {
          // noinspection AnonymousFunctionJS, ChainedFunctionCallJS, FunctionWithMultipleLoopsJS
          readdirSync(path).forEach(newPath => {
            const resolvedPath = resolve(path, newPath)
            // noinspection ChainedFunctionCallJS
            if (lstatSync(resolvedPath).isDirectory()) {
              recursiveProcess(resolvedPath)
            } else {
              // noinspection ConstantOnRightSideOfComparisonJS
              if (extname(resolvedPath) === '.js' || extname(resolvedPath) === '.ts') {
                const originalCode = readFileSync(resolvedPath, 'utf-8')
                let code = originalCode
                // noinspection NestedFunctionCallJS
                const normalMatches = Array.from(code.matchAll(/process\.env\['([\w-]+)']|process\.env.([\w-]+)/g))
                // noinspection ConstantOnRightSideOfComparisonJS
                if (normalMatches.length > 0) {
                  countFile++
                  // noinspection NestedFunctionCallJS
                  output.set(resolvedPath, new Map<string, string | undefined>())
                }
                // noinspection AnonymousFunctionJS
                normalMatches.forEach(match => {
                  // noinspection DynamicallyGeneratedCodeJS
                  const value = eval(match[0])
                  if (value) {
                    // noinspection NestedFunctionCallJS
                    code = code.replaceAll(match[0], `'${value.replaceAll('\'', '\\\'')}'`)
                  } else {
                    code = code.replaceAll(match[0], value)
                  }
                  if (!output.get(resolvedPath)!.has(match[0])) {
                    const varName = match[0].replace('process.env.', '')
                    if (!processedVars.includes(varName)) {
                      processedVars.push(varName)
                    }
                    output.get(resolvedPath)!.set(match[0], value)
                  }
                })
                const destructuredFinder = /(const|let|var)\s*{((.|\n)*)\s*=\s*process\.env/g
                // noinspection NestedFunctionCallJS
                const destructuredMatches = Array.from(code.matchAll(destructuredFinder))
                // noinspection ConstantOnRightSideOfComparisonJS
                if (destructuredMatches.length > 0 && !output.has(resolvedPath)) {
                  countFile++
                  // noinspection NestedFunctionCallJS
                  output.set(resolvedPath, new Map<string, string | undefined>())
                }
                // noinspection AnonymousFunctionJS
                destructuredMatches.forEach(match => {
                  let codeToReplace = ''
                  // noinspection AnonymousFunctionJS, ChainedFunctionCallJS
                  match[0].replace(/^[^{]*/, '').slice(1).replace(/\s*}.*/, '').split(',').map(variable => {
                    return variable.trim()
                  }).forEach(trimmedVariable => {
                    // noinspection ConstantOnRightSideOfComparisonJS
                    if (trimmedVariable.length > 0) {
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
                  })
                  code = code.replace(destructuredFinder, codeToReplace)
                })
                writeFileSync(resolvedPath, code)
                writeFileSync(`${resolvedPath}.bak`, originalCode)
              }
            }
          })
        }
        recursiveProcess(functionsDir)
        // noinspection AnonymousFunctionJS
        output.forEach((renderedKeys, path) => {
          console.log(`${path} processed:\n`)
          // noinspection AnonymousFunctionJS
          renderedKeys.forEach((renderedValue, keyName) => {
            if (renderedValue) {
              // noinspection ConstantOnRightSideOfComparisonJS
              if (renderedValue.length > 5) {
                // noinspection NestedFunctionCallJS
                console.log(`  ${keyName}: ${renderedValue.slice(0, 5)}*****\n`)
              } else {
                console.log(`  ${keyName}: ${renderedValue}\n`)
              }
            } else {
              console.warn(`  ${keyName}: ${renderedValue}\n`)
            }
          })
        })
        plugin.utils.status.show({
          summary: `Successfully processed ${countFile} file(s) containing ${processedVars.length} variable(s)`,
          title: 'Netlify Plugin Bundle ENV'
        })
      } else {
        plugin.utils.build.failPlugin('Functions directory is not defined')
      }
    }
  }
}