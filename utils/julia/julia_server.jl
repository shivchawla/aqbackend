using YRead
import Mongo: MongoClient
using HttpServer
using WebSockets
using JSON
using TimeSeries
 
using Raftaar: Performance, Returns, Drawdown, Ratios, Deviation, PortfolioStats
using Raftaar: serialize
 
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
 
YRead.configure(client, database = connection["mongo_database"])
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
         parsemsg = JSON.parse(msg)
  
         if haskey(parsemsg, "action") 
 
             action = parsemsg["action"]
             error = ""
 
            if action == "validate_portfolio"
                
               valid = false
 
               try 
                  valid = validate_portfolio(parsemsg["portfolio"]) 
               catch err
                  error = "Error"
               end
 
               parsemsg["valid"] = valid
               parsemsg["error"] = error
             
            elseif action == "compute_performance_portfolio_history"
                portfolioHistory = parsemsg["portfolioHistory"]
                benchmark = parsemsg["benchmark"]["ticker"];

                (netValues, dates) = compute_portfolio_value_history(portfolioHistory)

                performance = compute_performance(netValues, dates, benchmark)

                nVDict = Vector{Dict{String, Any}}()

                for i = 1:length(netValues)
                    push!(nVDict, Dict{String, Any}("date" => dates[i], "netValue" => netValues[i]))
                end

                parsemsg["performance"] = Dict{String, Any}("detail" => serialize(performance), 
                                            "portfolioStats" => nVDict)
                parsemsg["error"] = error
 
            elseif action == "compute_portfolio_performance"
               
               performance = Dict{String, Any}()
               
               # trim Z from the string
               startDate = DateTime(parsemsg["startDate"][1:end-1])
               endDate = DateTime(parsemsg["endDate"][1:end-1])
 
               try
                 performance = compute_performance(parsemsg["portfolio"], startDate, endDate)
               catch err
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
 
                 performance = compute_performance(netValue, dates, benchmark)
                 performance = JSON.parse(JSON.json(performance))
                 parsemsg["performance"] = Dict("date" => endDate, "value" => performance)
                 error = ""
                 
               catch err
                 error = "error"
               end
               parsemsg["error"] = error
 
             elseif action == "compute_portfolio_value_history"
 
               try
                 portfolioHistory = parsemsg["portfolioHistory"]
 
                 (netValue, dates) = compute_portfolio_value_history(portfolioHistory)
 
                 parsemsg["netValue"] = Dict("dates" => dates, "values" => netValue)
                 parsemsg["error"] = ""
 
               catch err
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
                 error = "error"
               end
 
             elseif action == "compute_portfolio_value_date"
                 netvalue = 0.0
                 lastdate = DateTime()
                 try
                   portfolio = parsemsg["portfolio"]
                   date = data["date"]

                   netvalue = compute_portfoliovalue(portfolio, date)
                   if (lastdate == DateTime())
                     parsemsg["netvalue"] = Dict("date" => lastdate, "value" => netvalue)
                     parsemsg["error"] = ""
                   end
                catch err
                  error = "error"
                end
              
                parsemsg["error"] = error

            elseif action == "compute_stock_price_history"
                try
                  security = convert(Raftaar.Security, parsemsg["security"])
                  (ts, prices) = get_stock_price_history(security)
                  
                  history = Dict{String, Float64}()
                  for i=1:length(ts)
                    history[string(Date(ts[i]))] = prices[i]
                  end

                  parsemsg["priceHistory"] = history
 
                 catch err
                  error = "error"
                end
              
                parsemsg["error"] = error
                
            elseif action == "compute_stock_price_latest"
                try
                  security = convert(Raftaar.Security, parsemsg["security"])
                  latestPriceDetail = get_stock_price_latest(security)
                  
                  parsemsg["latestDetail"] = latestPriceDetail
 
                 catch err
                  println(err)
                  error = "error"
                end
              
                parsemsg["error"] = error                
            elseif action == "compute_stock_rolling_performance"
                try
                  security = convert(Raftaar.Security, parsemsg["security"])
                  
                  rolling_performances = compute_stock_rolling_performance(security)
 
                  rolling_performance_dict = Dict{String, Any}()
                  for (k,v) in rolling_performances
                      rolling_performance_dict[k] = serialize(v)
                  end

                  parsemsg["performance"] = rolling_performance_dict
                catch err
                   error = "error"
                end
              
                parsemsg["error"] = error

            elseif action == "compute_stock_static_performance"
                try
                    security = convert(Raftaar.Security, parsemsg["security"])
                    static_performance = compute_stock_static_performance(security)

                    static_performance_dict = Dict{String, Any}()
                    static_performance_dict["yearly"] = Dict{String, Any}()
                    static_performance_dict["monthly"] = Dict{String, Any}()                  

                    for (k,v) in static_performance["yearly"]
                        static_performance_dict["yearly"][k] = serialize(v)
                    end

                    for (k,v) in static_performance["monthly"]
                        static_performance_dict["monthly"][k] = serialize(v)
                    end
                    parsemsg["performance"] = static_performance_dict
                
                catch err
                    error = "error"
                end
               
                parsemsg["error"] = error
 
            elseif action == "compute_updated_portfolio"
                portfolio = parsemsg["portfolio"]
                transactions = parsemsg["transactions"]

                # TODO: update function to compute portfolio stats etc.
                # TODO: if price is not give (or zero price), assume EOD price for the day
                (cash, updated_portfolio) = compute_updated_portfolio(portfolio, transactions)
                
                #Update, the positions to match the object structure in Node
                #portfolio = Raftaar.serialize(updated_portfolio)

                updated_portfolio = convert_to_node_portfolio(updated_portfolio)
                
                updated_portfolio["cash"] = cash
                #updated_portfolio["updatedDate"] = string(now())
            elseif action == "compute_attribution"
 
                println("Portfolio: $(updated_portfolio)")
 
                parsemsg["portfolio"] = updated_portfolio
 
            else
 
                parsemsg["error"] = "Invalid action"
             
            end
             write(client, JSON.json(parsemsg))  
         end
     end     
 end
 
 server = Server(wsh)
 run(server, host=IPv4(host), port=port)
 
