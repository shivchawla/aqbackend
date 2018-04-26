using YRead
import Mongo: MongoClient
using HttpServer
using WebSockets
using JSON
using TimeSeries
using BufferedStreams

using Raftaar: Performance, Returns, Drawdown, Ratios, Deviation, PortfolioStats
using Raftaar: serialize

currentIndiaTime() = now(Dates.UTC) + Dates.Hour(5) + Dates.Minute(30)

include("readNSEFiles.jl")  
include("portfolio.jl")
include("performance.jl")
include("handleAction.jl")

port = 6000
host = "127.0.0.1"
SERVER_READY = false
SERVER_AVAILABLE = true

try
 port = parse(ARGS[1])
 host = ARGS[2]
end

#Setup database connections
println("Configuring datastore connections")
connection = JSON.parsefile(Base.source_dir()*"/connection.json")
mongo_user = connection["mongo_user"]
mongo_pass = connection["mongo_pass"]
mongo_host = connection["mongo_host"]
mongo_port = connection["mongo_port"]
 
usr_pwd_less = mongo_user=="" && mongo_pass==""
const client = usr_pwd_less ? MongoClient(mongo_host, mongo_port) :
                        MongoClient(mongo_host, mongo_port, mongo_user, mongo_pass)
 
YRead.configure(client, database = connection["mongo_database"], priority = 2)
 
#global Dict to store open connections in
global connections = Dict{Int,WebSocket}()
fname = ""
  
function close_connection(client)  
    #println("Closing Connection: $client")
    try
        close(client)
        global SERVER_AVAILABLE = true;
    catch
        println("Error Closing: $client")
    end
end


function decode_message(msg)
   String(copy(msg))
end

function geterrormsg(err::Any)
  out = BufferedOutputStream()
  showerror(out, err)
  msg = String(take!(out))
  close(out)
  return msg
end


jsdateformat = "yyyy-mm-ddTHH:MM:SS.sssZ"

wsh = WebSocketHandler() do req, client
    
    responseMsg = Dict{String, Any}("error" => "")
    try 
        
        msg = decode_message(read(client))
        parsemsg = JSON.parse(msg)
        
        if haskey(parsemsg, "action") 
            responseMsg = handleRequest(parsemsg)
        else
          println(parsemsg)
          warn("No action provided")
          responseMsg["error"] = "No or invalid action provided"
          responseMsg["code"] = 403
        end
        
    catch err
        println(err)
        responseMsg = Dict{String, Any}("error" => err, "code" => 401, "outputtype" => "internal")
    end

    write(client, JSON.json(responseMsg))
    close_connection(client) 
  
end
 
server = Server(wsh)
run(server, host=IPv4(host), port=port)
 