logger = process.stdout

Logger =
  log: (data) -> logger.write "#{data}\n"
  write: (data) -> logger.write data

module.exports = Logger
