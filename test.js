const { spawn } = require('child_process')
const assert = require('assert')
const fs = require('fs-promise')
const request = require('request')
const terminate = require('terminate')

const runCommand = () => {
  fs.removeSync('/tmp/doof')
  fs.removeSync('/tmp/moof')
  fs.copySync('./example-app', '/tmp/doof')
  const running = spawn('./bin/node-runner', ['/tmp/doof', '/tmp/moof'])

  // TODO this is useful to uncomment sometimes
  // running.childprocess.stdout.pipe(process.stdout)
  // running.childprocess.stderr.pipe(process.stderr)

  return running
}

const replaceInAppIndex = (findString, replaceString) => {
  const contentPath = '/tmp/doof/index.js'
  const content = fs.readFileSync(contentPath).toString()
  fs.writeFileSync(contentPath, content.replace(findString, replaceString))
}

const TIMEOUT = 2000
const PORT = 55555
const URL = `http://localhost:${PORT}`

// NOTE testing is rather shallow

const waitForBodyToContain = (running, expectedBody, done) => {
  setTimeout(() => {
    request(URL, (error, res) => {
      if (error) return done(error)

      assert.equal(res.body, expectedBody)
      terminate(running.pid, done)
    })
  }, TIMEOUT)
}

describe('node runner', () => {
  it('runs app', done => {
    const running = runCommand()
    waitForBodyToContain(running, '`default` example response', done)
  })

  it('restarts app when a file changes', done => {
    const running = runCommand()
    replaceInAppIndex('default', '!!!changed!!!')
    waitForBodyToContain(running, '`!!!changed!!!` example response', done)
  })
})
