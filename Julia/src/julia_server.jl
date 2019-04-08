using YRead
using Mongoc
using HTTP
using JSON
using TimeSeries
using BufferedStreams
using Logging
using Dates
using MarketTechnicals
using Statistics

using BackTester: Performance, Returns, Drawdown, Ratios, Deviation, PortfolioStats, TradeBar
using BackTester: serialize

currentIndiaTime() = now(Dates.UTC) + Dates.Hour(5) + Dates.Minute(30)
currentIndiaDate() = Date(currentIndiaTime())

include("readNSEFiles.jl")  
include("portfolio.jl")
include("performance.jl")
include("handleAction.jl")

port = 6000
host = "127.0.0.1"
SERVER_READY = false
SERVER_AVAILABLE = true

try
 global port = Meta.parse(ARGS[1])
 global host = ARGS[2]
catch err
end

#Setup database connections
println("Configuring datastore connections")
connection = JSON.parsefile(Base.source_dir()*"/connection.json")
mongo_user = connection["mongo_user"]
mongo_pass = connection["mongo_pass"]
mongo_host = connection["mongo_host"]
mongo_port = connection["mongo_port"]
 
usr_pwd_less = mongo_user=="" && mongo_pass==""
client = usr_pwd_less ? Mongoc.Client("mongodb://$(mongo_host):$(mongo_port)") :
                            Mongoc.Client("mongodb://$(mongo_user):$(mongo_pass)@$(mongo_host):$(mongo_port)/?authMechanism=MONGODB-CR&authSource=admin")

YRead.configureMongo(client, database = connection["mongo_database"], priority = 3)

function close_connection(client)  
    try
        close(client)
    catch
        println("Error Closing: $client")
    end
end

function decode_message(msg)
   String(msg)
end

function geterrormsg(err::Any)
  out = BufferedOutputStream()
  showerror(out, err)
  msg = String(take!(out))
  close(out)
  return msg
end

jsdateformat = "yyyy-mm-ddTHH:MM:SS.sssZ"

function requestHandler(client)    
    
    println("Request Received: $(now())")
    
    responseMsg = Dict{String, Any}("error" => "")
    
    try 
        println("Decoding request: $(now())")
        msg =  decode_message(readavailable(client))
        
        parsemsg = JSON.parse(msg)

        if haskey(parsemsg, "action") 
            println("Handling request: $(now())")
            responseMsg = handleRequest(parsemsg)
        else
          println(parsemsg)
          @warn "Error: No action provided: $(now())"
          responseMsg["error"] = "No or invalid action provided"
          responseMsg["code"] = 403
        end
        
    catch err
        println(err)
        responseMsg = Dict{String, Any}("error" => err, "code" => 401, "outputtype" => "internal")
    end

    println("Sending response: $(now())")
    write(client, JSON.json(responseMsg))

end

HTTP.WebSockets.listen(host, UInt16(port)) do ws
    requestHandler(ws)
end

 