const { spawn } = require('child-process-promise')
const { watch } = require('chokidar')
const path = require('path')
const terminate = require('terminate')

const {
  exists,
  copy,
  remove,
  existsSync,
  removeSync,
} = require('fs-promise')

const appDir = process.argv[2]
const workDir = process.argv[3]

if (!existsSync(appDir) || !workDir) {
  console.error('Usage: node-runner /app-dir /temp-work-dir')
  process.exit()
}

removeSync(workDir)

const childProcesses = {}

const registerChildProcess = (name, childProcess) => {
  childProcesses[name] = childProcess
}

const killChildProcess = name => {
  return new Promise(resolve => {
    const childProcess = childProcesses[name]

    if (!childProcess) {
      resolve()
    }

    terminate(childProcess.pid, () => {
      delete childProcesses[name]
      resolve()
    })
  })
}

const findChildProcess = name => childProcesses[name]

const runProcess = (command, options) => {
  const [commandName, ...commandArgs] = command.split(' ')

  let outputLines = []

  const running = spawn(commandName, commandArgs, options)
    .catch(error => {
      if (error.code === null) return
      console.error(outputLines.join(''))
    })

  const { childProcess } = running

  childProcess.stderr.on('data', d => outputLines.push(d.toString()))
  childProcess.stdout.on('data', d => outputLines.push(d.toString()))

  registerChildProcess(command, childProcess)

  return running
}

const runAppCommand = 'yarn run start'

const syncInitialApp = async () => {
  console.info(' - sync initial app')

  if (await exists(workDir)) {
    return Promise.resolve()
  } else {
    return copy(appDir, workDir)
  }
}

const installApp = () => {
  console.info(' - install app')
  return runProcess('yarn install', { cwd: workDir })
}

const buildApp = () => {
  console.info(' - build app ')
  const start = new Date().getTime()
  const running = runProcess('yarn run build', { cwd: workDir })
  running.childProcess.on('exit', code => {
    if (code !== null) {
      const elapsedSeconds = (new Date().getTime() - start) / 1000
      console.info(` - build app finished in ${elapsedSeconds} seconds`)
    }
  })
  return running
}

let isRestarting = false
const restartApp = async () => {
  if (isRestarting) {
    console.info(' - restart in progress, skipping...')
    return
  }

  console.info(' - restarting app')

  isRestarting = true

  await killApp()
  await buildApp()
  runApp()

  isRestarting = false
}

const runApp = () => {
  console.info(' - run app')

  const running = runProcess(runAppCommand, { cwd: workDir })

  running.childProcess.once('exit', code => {
    if (code !== null) {

      console.info('broken, waiting...')

      // Just keep the process running until there's a new process
      const waiting = setInterval(() => {
        if (findChildProcess(runAppCommand)) {
          clearInterval(waiting)
        }
      }, 100)
    }
  })

  return running
}

const killApp = async () => {
  const childProcess = findChildProcess(runAppCommand)
  await killChildProcess(runAppCommand)
}

const handleWatchError = (error) => {
  console.error(error)
  Object.keys(childProcesses).forEach(processName => {
    if (childProcesses[processName]) {
      terminate(childProcesses[processName].pid)
    }
  })
  process.exit()
}

const workDirForPath = filePath => {
  const relativeFilePath = path.resolve(filePath).slice(path.resolve(appDir).length)
  return `${workDir}${relativeFilePath}`
}
const copyFileToWorkDir = filePath => {
  copy(filePath, workDirForPath(filePath))
}

const thenRestartApp = job => async (...args) => {
  console.info(` - file changed, syncing \`${args[0]}\``)
  await job(...args)
  restartApp()
}

const syncAndRestartOnChange = () => {
  console.info(' - begin watching files')

  const watcher = watch(appDir, {
    ignored: new RegExp(`^${appDir}/(dist|node_modules|.git)$`),
    ignoreInitial: true,
  })

  watcher.on('add', thenRestartApp(copyFileToWorkDir))
  // TODO make sure we're not copying into directory when we want to copy over
  watcher.on('addDir', thenRestartApp(copyFileToWorkDir))
  watcher.on('change', thenRestartApp(copyFileToWorkDir))
  watcher.on('unlink', thenRestartApp(remove))
  watcher.on('unlinkDir', thenRestartApp(remove))

  watcher.on('error', handleWatchError)
}

const runAppForDevelopment = async () => {
  await syncInitialApp()
  await installApp()
  await buildApp()

  runApp()
  syncAndRestartOnChange()
}

runAppForDevelopment()
