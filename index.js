const { spawn } = require('child-process-promise')
const { copy, remove, existsSync, removeSync } = require('fs-promise')
const { watch } = require('graceful-chokidar')
const terminate = require('terminate')

const appDir = process.argv[2]
const workDir = process.argv[3]

if (!existsSync(appDir) || !workDir) {
  console.error('Usage: node-runner /app-dir /temp-work-dir')
  process.exit()
}

removeSync(workDir)

const childProcesses = {}

const runProcess = (command, options) => {
  const [commandName, ...commandArgs] = command.split(' ')
  const running = spawn(commandName, commandArgs, options)
    .catch(error => {
      if (error.code === null) return
      throw error
    })

  const { childProcess } = running

  childProcess.on('exit', (code) => {
    if (code !== null) {
      delete childProcess[command]
    }
  })

  // TODO capture output here, we can play it back on error

  childProcesses[command] = childProcess

  return running
}

const runAppCommand = 'yarn run start'

const syncInitialApp = () => {
  console.info(' - sync initial app')
  return copy(appDir, workDir)
}
const installApp = () => {
  console.info(' - install app')
  return runProcess('yarn install', { cwd: workDir })
}
const buildApp = () => {
  console.info(' - build app')
  runProcess('yarn run build', { cwd: workDir })
}

let isRestarting = false
const restartApp = async () => {
  if (isRestarting) {
    return
  } else {
    console.info(' - restart in progress, skipping...')
  }
  console.info(' - restarting app')

  isRestarting = true

  killApp()
  await buildApp()
  runApp()

  isRestarting = false
}

const runApp = () => {
  console.info(' - run app')

  const running = runProcess(runAppCommand, { cwd: workDir })

  running.childProcess.once('exit', code => {
    delete childProcesses[runAppCommand]
    if (code !== null) {
      console.info('broken, waiting...')
      // Just keep the process running until there's a new process
      const waiting = setInterval(() => {
        if (childProcesses[runAppCommand]) {
          clearInterval(waiting)
        }
      }, 100)
    }
  })

  return running
}

const killApp = () => {
  console.info(' - kill app')

  if (childProcesses[runAppCommand]) {
    terminate(childProcesses[runAppCommand].pid)
    delete childProcesses[runAppCommand]
  }
}

const handleWatchError = (error) => {
  console.error(error)
  Object.keys(childProcesses).forEach(processName => {
    terminate(childProcesses[processName].pid)
  })
  process.exit()
}

const workDirForPath = path => `${workDir}${path.slice(appDir.length)}`
const copyFileToWorkDir = path => copy(path, workDirForPath(path))

const thenRestartApp = job => async (...args) => {
  await job(...args)
  restartApp()
}

const syncAndRestartOnChange = () => {
  console.info(' - begin sync')

  const watcher = watch(appDir, {
    ignored: new RegExp(`^${appDir}/(dist|node_modules|.git)`),
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
