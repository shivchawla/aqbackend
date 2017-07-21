using HttpServer
using WebSockets
using IJulia
using JSON

port = 2000
host = "127.0.0.1"

try
  host = ARGS[1]
  port = parse(ARGS[2])
end

#global Dict to store open connections in
global connections = Dict{Int,WebSocket}()

function decodeMessage(msg)
    String(copy(msg))
end

wsh = WebSocketHandler() do req, client
    global connections
    connections[client.id] = client
	println("New client: ", client.id)
	notebook()
end

server = Server(wsh)
run(server, host=IPv4(host), port=port)
