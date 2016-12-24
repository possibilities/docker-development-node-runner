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

  // TODO this is useful somethimes
  childProcess.stdout.pipe(process.stdout)
  childProcess.stderr.pipe(process.stderr)

  registerChildProcess(command, childProcess)

  return running
}

const runAppCommand = 'yarn run start'

const syncInitialApp = () => __async(function*(){
  console.info(' - sync initial app')

  console.log(0)
  if (yield exists(workDir)) {
    console.log(1)
    return Promise.resolve()
  } else {
    console.log(2)
    return copy(appDir, workDir)
  }
}())

const installApp = () => {
  console.info(' - install app')
  return runProcess('yarn install', { cwd: workDir })
}
const buildApp = () => {
  process.stdout.write(' - build app ')
  const start = new Date().getTime()
  const running = runProcess('yarn run build', { cwd: workDir })
  running.childProcess.on('exit', code => {
    if (code !== null) {
      const elapsedSeconds = (new Date().getTime() - start) / 1000
      process.stdout.write(`${elapsedSeconds}s\n`)
    }
  })
  return running
}

let isRestarting = false
const restartApp = () => __async(function*(){
  if (isRestarting) {
    console.info(' - restart in progress, skipping...')
    return
  }

  console.info(' - restarting app')

  isRestarting = true

  yield killApp()
  yield buildApp()
  runApp()

  isRestarting = false
}())

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

const killApp = () => __async(function*(){
  const childProcess = findChildProcess(runAppCommand)
  yield killChildProcess(runAppCommand)
}())

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

const thenRestartApp = job => (...args) => __async(function*(){
  console.info(` - file changed, syncing \`${args[0]}\``)
  yield job(...args)
  restartApp()
}())

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

const runAppForDevelopment = () => __async(function*(){
  yield syncInitialApp()
  yield installApp()
  yield buildApp()

  runApp()
  syncAndRestartOnChange()
}())

runAppForDevelopment()

function __async(g){return new Promise(function(s,j){function c(a,x){try{var r=g[x?"throw":"next"](a)}catch(e){j(e);return}r.done?s(r.value):Promise.resolve(r.value).then(c,d)}function d(e){c(e,1)}c()})}
