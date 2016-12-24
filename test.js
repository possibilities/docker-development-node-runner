const { spawn } = require('child_process')
const assert = require('assert')
const fs = require('fs-promise')
const request = require('request')
const terminate = require('terminate')

const TIMEOUT = 1500
const PORT = 55555
const URL = `http://localhost:${PORT}`

const setupFilesystemSync = () => {
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

const expectAppEndpointToContain = (expectedBody, callback) => {
  // Wait some time for the app to restart
  setTimeout(() => {
    // Make a request to assert against the response
    request(URL, (error, res) => {
      if (error) return callback(error)

      // Assert the app has the correct output
      assert.equal(res.body, expectedBody)
      callback()
    })
  }, TIMEOUT)
}

const expectAppEndpointToBeUnresponsive = callback => {
  // Wait some time for the app to restart
  setTimeout(() => {
    // Make a request to assert against the response
    request(URL, (error, res) => {
      // We should experience an error
      if (error) {
        callback()
      } else {
        callback(new Error('Error was expected when server is broken'))
      }
    })
  }, TIMEOUT)
}

describe('node runner', () => {
  let runningCommand

  beforeEach(() => {
    setupFilesystemSync()
    runningCommand = runCommand()
  })

  afterEach(done => terminate(runningCommand.pid, done))

  it('runs app', done => {
    expectAppEndpointToContain('`default` example response', done)
  })

  it('restarts app when a file changes', done => {
    // Check default response
    expectAppEndpointToContain('`default` example response', () => {
      // Update script to change response
      replaceStringInAppIndexJs('default', '!!!changed!!!')
      // Check response is updated
      expectAppEndpointToContain('`!!!changed!!!` example response', done)
    })
  })

  it('recovers after broken app is repaired', done => {
    // Check default response
    expectAppEndpointToContain('`default` example response', () => {
      // Update script in a way that breaks it
      replaceStringInAppIndexJs('(', 'THIS_SHOULD_BE_AN_OPEN_PARENTH')
      expectAppEndpointToBeUnresponsive(() => {
        replaceStringInAppIndexJs('THIS_SHOULD_BE_AN_OPEN_PARENTH', '(')
        expectAppEndpointToContain('`default` example response', done)
      })
    })
  })

  it('builds app before restarting')
})
