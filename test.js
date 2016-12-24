const { spawn } = require('child_process')
const assert = require('assert')
const fs = require('fs-promise')
const request = require('request')
const terminate = require('terminate')

const TIMEOUT = 2000
const PORT = 55555
const URL = `http://localhost:${PORT}`

const cleanupSync = () => {
  fs.removeSync('/tmp/doof')
  fs.removeSync('/tmp/moof')
  fs.copySync('./example-app', '/tmp/doof')
}

const runCommand = () => spawn('./bin/node-runner', [
  '/tmp/doof',
  '/tmp/moof'
])

const replaceStringInAppIndexJs = (findString, replaceString) => {
  const contentPath = '/tmp/doof/index.js'
  const content = fs.readFileSync(contentPath).toString()
  fs.writeFileSync(contentPath, content.replace(findString, replaceString))
}

// NOTE testing is rather shallow

describe('node runner', () => {
  let runningCommand

  beforeEach(() => {
    cleanupSync()
    runningCommand = runCommand()
  })

  const expectAppEndpointToContain = (expectedBody, callback) => {
    setTimeout(() => {
      request(URL, (error, res) => {
        if (error) return done(error)

        assert.equal(res.body, expectedBody)
        terminate(runningCommand.pid, callback)
      })
    }, TIMEOUT)
  }

  it('runs app', done => {
    expectAppEndpointToContain('`default` example response', done)
  })

  it('restarts app when a file changes', done => {
    replaceStringInAppIndexJs('default', '!!!changed!!!')
    expectAppEndpointToContain('`!!!changed!!!` example response', done)
  })
})
