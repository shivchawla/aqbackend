using YRead
import Mongo: MongoClient
using HttpServer
using WebSockets
using JSON

using Raftaar: Performance, Returns, Drawdown, Ratios, Deviation, PortfolioStats
using Raftaar: serialize

#TO BE COMPLETED
function validate_portfolio(portfolio)
  return true
end

include("portfolio.jl")
include("performance.jl")

port = 6000
host = "127.0.0.1"

try
  port = parse(ARGS[1])
  host = ARGS[2]
end

#Setup database connections for security and database
#connection = JSON.parsefile("../raftaar/Util/connection.json")
#println(connection)
#const client = MongoClient(connection["mongo_host"], connection["mongo_user"], connection["mongo_pass"], connection["mongo_database"])

const client = MongoClient()
info("Configuring datastore connections", datetime=now())    

YRead.configure(client, database = "aimsquant") #connection["mongo_database"])
YRead.configure(priority = 2)

#global Dict to store open connections in
global connections = Dict{Int,WebSocket}()
fname = ""
        
function decode_message(msg)
    String(copy(msg))
end

wsh = WebSocketHandler() do req, client
    
    while true

        msg = decode_message(read(client))

        #println(msg)
        parsemsg = JSON.parse(msg)

        #println(parsemsg)

        if haskey(parsemsg, "action") 

            action = parsemsg["action"]
            error = ""

            if action == "validate_portfolio"
               
              valid = false

              println(parsemsg["portfolio"])

              try 
                valid = validate_portfolio(parsemsg["portfolio"]) 
              catch err
                println(err)
                error = "Error"
              end

              parsemsg["valid"] = valid
              parsemsg["error"] = error

                
            elseif action == "compute_portfolio_performance"
              
              performance = Dict{String, Any}()
              
              # trim Z from the string
              startDate = DateTime(parsemsg["startDate"][1:end-1])
              endDate = DateTime(parsemsg["endDate"][1:end-1])

              try
                println(parsemsg["portfolio"])
                println(parsemsg["startDate"])
               
                performance = compute_performance(parsemsg["portfolio"], startDate, endDate)
                #println(JSON.json(performance))
              catch err
                println(err)
                error = "error"
              end

              performance = JSON.parse(JSON.json(performance))

              parsemsg["performance"] = Dict("date" => endDate, "value" => performance)
              parsemsg["error"] = error

            elseif action == "compute_performance_netvalue"
              performance = Dict{String, Any}()
              
              try
                
                netValue = convert(Vector{Float64}, parsemsg["netValue"])
                benchmark = parsemsg["benchmark"]["ticker"]
                dates = parsemsg["dates"]

                endDate = dates[end]

                dates = [Date(DateTime(date[1:end-1])) for date in dates]

                println(netValue)
                println(benchmark)
                println(dates)

                performance = compute_performance(netValue, dates, benchmark)
                
                performance = JSON.parse(JSON.json(performance))
                parsemsg["performance"] = Dict("date" => endDate, "value" => performance)
                error = ""
                
              catch err
                println(err)
                error = "error"
              end
  
              parsemsg["error"] = error

            elseif action == "compute_portfolio_value_history"

              try
                portfolioHistory = parsemsg["portfolioHistory"]

                println(portfolioHistory)

                println(typeof(portfolioHistory))

                (netValue, dates) = compute_portfolio_value_history(portfolioHistory)

                parsemsg["netValue"] = Dict("dates" => dates, "values" => netValue)
                parsemsg["error"] = ""

              catch err
                println(err)
                error = "error"
              end

            elseif action == "compute_portfolio_value_period"
               
              try
                portfolio = parsemsg["portfolio"]
                startDate = parsemsg["startDate"]
                endDate = parsemsg["endDate"]
                
                (netValue, dates) = compute_portfolio_value_period(portfolio, startDate, endDate)
                parsemsg["netValue"] = Dict("dates" => dates, "values" => netValue)
                parsemsg["error"] = ""
                
              catch err
                println(err)
                error = "error"
              end

            elseif action == "compute_portfolio_value_date"
               
               netvalue = 0.0
               lastdate = DateTime()

               try
                portfolio = parsemsg["portfolio"]
                date = data["date"]
                println(data)
              
                netvalue = compute_portfoliovalue(portfolio, date)
                if (lastdate == DateTime())
                  parsemsg["netvalue"] = Dict("date" => lastdate, "value" => netvalue)
                  parsemsg["error"] = ""
                end

              catch err
              
                println(err)
                error = "error"
              
              end
              
              parsemsg["error"] = error

            elseif action == "compute_updated_portfolio"
                portfolio = parsemsg["portfolio"]
                transactions = parsemsg["transactions"]
                
                (cash, updated_portfolio) = compute_updated_portfolio(portfolio, transactions)
                
                portfolio = Raftaar.serialize(updated_portfolio)
                
                portfolio["cash"] = cash

                parsemsg["portfolio"] = portfolio

            else

              parsemsg["error"] = "Invalid action"
            
            end

            println(parsemsg)

            write(client, JSON.json(parsemsg))  

        end

    end     
end

server = Server(wsh)
run(server, host=IPv4(host), port=port)

