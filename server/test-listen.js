require('net')
  .createServer()
  .listen(3001, '127.0.0.1', () => console.log('OK: listening on 127.0.0.1:3001'))
  .on('error', (e) => console.error('ERROR:', e));