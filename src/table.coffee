Logger = require "./logger"

rows = {}
rowCount = 0
maxLength = 0

esc = "\u001B"
csi = "#{esc}["

Table =
  setContainers: (list) ->
    for container in list
      # just used for formatting so we pad the container names equally
      length = container.name.length
      maxLength = length if length > maxLength

      rows[container.name] = "..."
      rowCount += 1

    Table.renderRows()

  renderRows: (clear = false) ->
    str = ""
    str += "#{csi}#{rowCount}F" if clear
    for key,text of rows
      str += "#{csi}2K#{Table.padName(key)}  #{text}\n"

    Logger.write str

  render: (name, message) ->
    rows[name] = message
    Table.renderRows true

  renderOk: (name) ->
    Table.render name, "#{rows[name]} #{csi}32m✔#{csi}0m"

  padName: (name, prefix = "", suffix = "") ->
    pad = (maxLength + 1) - name.length
    return "#{prefix}#{name}#{suffix}#{Array(pad).join(" ")}"

module.exports = Table
