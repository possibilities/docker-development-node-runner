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

  // TODO capture output here, we can play it back on error

  return running
}

const TIMEOUT = 3000
const PORT = 55555
const URL = `http://localhost:${PORT}`

// NOTE testing is rather shallow

describe('node runner', () => {
  it('runs app', done => {
    const running = runCommand()
    setTimeout(() => {
      request(URL, (error, res) => {
        if (error) return done(error)

        assert.equal(res.body, '`default` example response')
        terminate(running.pid)
        done()
      })
    }, TIMEOUT)
  })

  describe('when a file changes', () => {
    it('restarts app', done => {
      const running = runCommand()
      setTimeout(() => {
        request(URL, (error, res) => {
          if (error) return done(error)

          assert.equal(res.body, '`default` example response')

          const contentPath = '/tmp/doof/index.js'
          const content = fs.readFileSync(contentPath).toString()
          fs.writeFileSync(contentPath, content.replace('default', 'updated'))

          setTimeout(() => {
            request(URL, (error, res) => {
              if (error) return done(error)

              assert.equal(res.body, '`updated` example response')
              terminate(running.pid)
              done()
            })
          }, TIMEOUT)
        })
      }, TIMEOUT)
    })
  })
})
