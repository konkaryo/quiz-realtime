require('net')
  .createServer()
  .listen(3001, 'localhost', () => console.log('OK: listening on localhost:3001'))
  .on('error', (e) => console.error('ERROR:', e));