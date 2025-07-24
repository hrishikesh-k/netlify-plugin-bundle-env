import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { basename, extname, join } from 'node:path'
import { cwd, env } from 'node:process'
import type { NetlifyPlugin, NetlifyPluginOptions, OnPreBuild } from '@netlify/build'
import chalk from 'chalk'

type PInputs = NetlifyPluginOptions<{
  'backup-dir': string
  debug: boolean
  directories: string[]
  exclude: string[]
  extensions: string[]
  files: string[]
  include: string[]
  quiet: boolean
}>['inputs']

class PLogger {
  constructor(private readonly d: PInputs['debug'], private readonly q: PInputs['quiet']) {}

  debug(m: string) {
    if (this.d && !this.q) {
      console.log(chalk.blue(m))
    }
  }

  success(m: string) {
    if (!this.q) {
      console.log(chalk.green(m))
    }
  }

  warn(m: string) {
    if (!this.q) {
      console.log(chalk.yellow(m))
    }
  }
}

function pVar(i: PInputs, l: PLogger, v: string) {
  l.debug(`validating if ${v} should be processed`)
  if (i.exclude.includes(v)) {
    l.warn(`${v} will not be replaced because it is in the exclude list`)
    return false
  }

  if (i.include.length) {
    if (i.include.includes(v)) {
      return true
    } else {
      l.warn(`${v} will not be replaced because it is not in the include list`)
      return false
    }
  }

  return true
}

function rp(l: PLogger, p: string, c: (pathToProcess: string) => void) {
  l.debug(`rp: checking ${p}`)
  if (!lstatSync(p).isDirectory()) {
    l.debug(`${p} is a file, calling callback`)
    c(p)
    return
  }

  l.debug(`${p} is a directory, performing recursive call`)
  for (const np of readdirSync(p)) {
    const absP = join(p, np)
    l.debug(`rp: absolutePath: ${absP}, checking if directory`)
    rp(l, absP, c)
  }
}

function valI(i: PInputs, l: PLogger, p: Parameters<OnPreBuild>[0]) {
  const paths: Set<string> = new Set()

  l.debug('checking for debug/quiet conflict')
  if (i.debug && i.quiet) {
    l.warn('debug and quiet both are enabled, debug would be ignored')
  }

  l.debug('checking extensions')
  for (const [extIndex, ext] of i.extensions.entries()) {
    if (ext.startsWith('.')) {
      l.warn(`${ext} should not start with '.', processing would continue without the dot`)
      i.extensions[extIndex] = ext.slice(1)
    }
  }

  l.debug('checking for excluded/included conflict')
  for (const exEnv of i.exclude) {
    if (i.include.includes(exEnv)) {
      l.warn(`${exEnv} exists in include as well as exclude list, exclude would take preference`)
    }
  }

  l.debug('checking for directories/files conflict')

  if (i.directories.length && i.files.length) {
    l.warn('directories and files, both are provided - directories will be ignored')
    for (const file of i.files) {
      paths.add(file)
    }
    return paths
  }

  if (i.files.length) {
    l.warn('files is provided, Netlify (Edge) Functions would not be automatically processed')
    for (const file of i.files) {
      paths.add(file)
    }
    return paths
  }

  if (i.directories.length) {
    l.warn('directories is provided, Netlify (Edge) Functions would not be automatically processed')
    for (const dir of i.directories) {
      paths.add(dir)
    }
    return paths
  }

  l.debug('directories and files not provided, adding Netlify (Edge) Functions src to directories')
  if (p.constants.EDGE_FUNCTIONS_SRC && p.constants.FUNCTIONS_SRC) {
    paths.add(p.constants.EDGE_FUNCTIONS_SRC)
    paths.add(p.constants.FUNCTIONS_SRC)
    return paths
  } else {
    p.utils.build.failPlugin('No source directory is specified')
    return paths
  }
}

export default function (i: PInputs): NetlifyPlugin {

  const l = new PLogger(i.debug, i.quiet)
  const dVar = new Set()
  const wDir = cwd()
  let cf = 0
  let paths: Set<string>

  return {
    onEnd() {
      if (i['backup-dir'].length) {
        const bDir = join(wDir, i['backup-dir'])
        rp(l, bDir, (p) => {
          if (extname(p) === '.path') {
            l.debug(`restoring backup from ${p}`)
            copyFileSync(p.slice(0, -5), readFileSync(p, 'utf-8'))
          }
        })

        l.debug(`deleting ${bDir}`)
        rmSync(bDir, {
          recursive: true
        })
        l.success('backup successfully processed and files have been restored')
      } else {
        for (const p of paths) {
          l.debug(`processing ${p}`)
          rp(l, join(wDir, p), (pa) => {
            if (extname(pa) === '.bak') {
              l.debug(`restoring backup from ${pa}`)
              const oName = pa.slice(0, -4)
              writeFileSync(oName, readFileSync(oName, 'utf-8'))

              l.debug(`deleting ${pa}`)
              rmSync(pa)
              l.success(`${oName} successfully processed and restored`)
            }
          })
        }
      }
    },
    onPreBuild(pl) {
      l.debug(`resolved config:\n  - backup-dir: ${i['backup-dir']}\n  - debug: ${i.debug}\n  - directories: ${i.directories.join(', ')}\n  - exclude: ${i.exclude.join(', ')}\n  - extensions: ${i.extensions.join(', ')}\n  - files: ${i.files.join(', ')}\n  - include: ${i.include.join(', ')}\n  - quiet: ${i.quiet}`)

      paths = valI(i, l, pl)

      for (const p of paths) {
        l.debug(`processing: ${p}`)
        const absP = join(wDir, p)

        l.debug(`absolute path: ${absP}, checking its existence`)
        if (!existsSync(absP)) {
          pl.utils.build.failPlugin(`${p} does not exist`)
          continue
        }

        l.debug(`${p} exists`)
        rp(l, absP, (pa) => {
          l.debug(`checking if ${pa} has an included extension`)
          if (!i.extensions.includes(extname(pa).slice(1))) {
            l.warn(`skipping ${basename(pa)} because its extension is not listed in \`extensions\` options`)
            return
          }

          l.debug(`${pa} has an included extension`)
          cf++

          l.debug(`reading ${pa}`)
          const oc = readFileSync(pa, 'utf-8').trim()
          let nc = `${oc}`
          let sb = ''

          if (nc.startsWith('#!')) {
            l.debug(`removing shebang from ${pa}, it will be restored later`)
            sb = nc.slice(0, nc.indexOf('\n') + 1)
            nc = nc.slice(sb.length).trim()
          }

          for (const e of Object.keys(env)) {
            if (!env[e]) {
              l.warn(`skipping ${e} because its value is undefined`)
              continue
            }

            if (pVar(i, l, e)) {
              if (!dVar.has(e)) {
                l.debug(`adding ${e} to dVar`)
                dVar.add(e)
              }

              l.debug(`appending ${e} to file`)
              nc = `process.env[${JSON.stringify(e)}]=${JSON.stringify(env[e])};\n${nc}`
            }
          }

          writeFileSync(pa, `${sb}\n${nc}`)

          if (!i["backup-dir"].length) {
            l.debug('no backup-dir provided, backing up along-side original file')
            writeFileSync(`${pa}.bak`, oc)
            return
          }

          l.debug('backup-dir provided')
          const bDir = join(wDir, i['backup-dir'])

          l.debug(`backup-dir absolute path: ${bDir}, checking if it exists`)
          if (!existsSync(bDir)) {
            l.debug('backup-dir doesn\'t exist, creating it')
            mkdirSync(bDir, {
              recursive: true
            })
          }

          l.debug('checking file-tree in backup-dir')
          const dBack = join(bDir, pa)

          l.debug(`backup-dir file-tree absolute path: ${dBack}, checking if it exists`)
          if (!existsSync(dBack)) {
            l.debug(`backupDir file-tree doesn't exist, creating it`)
            mkdirSync(dBack, {
              recursive: true
            })
          }

          const fBack = join(dBack, basename(pa))
          l.debug(`writing ${pa} in backup-dir at: ${fBack}`)
          writeFileSync(fBack, oc)
        })

        pl.utils.status.show({
          summary: `Successfully processed ${cf} file(s) containing ${dVar.size} variable(s)`,
          title: 'Netlify Plugin Bundle ENV'
        })
      }
    }
  }
}
