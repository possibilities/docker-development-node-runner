const http = require('http')
const fs = require('fs')

const PORT = 55555

const headers = { 'Content-Type': 'text/plain' }

const server = http.createServer((request, response) => {
  response.writeHead(200, headers)
  response.end('`default` example response')
})

server.listen(PORT)

console.info('`default` example running')
