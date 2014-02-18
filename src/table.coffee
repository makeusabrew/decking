Logger = require "./logger"

rows = {}
maxLength = 0

Table =
  setContainers: (list) ->
    for container in list
      # just used for formatting so we pad the container names equally
      length = container.name.length
      maxLength = length if length > maxLength

      rows[container.name] = ""

  render: (name, message) ->
    Logger.log "#{Table.padName(name)}  #{message}"

  padName: (name, prefix = "", suffix = "") ->
    pad = (maxLength + 1) - name.length
    return "#{prefix}#{name}#{suffix}#{Array(pad).join(" ")}"

module.exports = Table

