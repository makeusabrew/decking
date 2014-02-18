logger = process.stdout

padName = (name, prefix = "", suffix = "") ->
  pad = (Cluster.maxLength + 1) - name.length
  return "#{prefix}#{name}#{suffix}#{Array(pad).join(" ")}"

Logger =
  log: (data) -> logger.write "#{data}\n"

module.exports = Logger
