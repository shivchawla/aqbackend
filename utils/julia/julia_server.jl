using YRead
import Mongo: MongoClient
using HttpServer
using WebSockets
using JSON
using TimeSeries
using BufferedStreams

using Raftaar: Performance, Returns, Drawdown, Ratios, Deviation, PortfolioStats
using Raftaar: serialize
  
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
 
YRead.configure(client, database = connection["mongo_database"], priority = 2)
 
#global Dict to store open connections in
global connections = Dict{Int,WebSocket}()
fname = ""
  

function close_connection(client)  
    println("Closing Connection: $client")
    try
        close(client)
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
 
wsh = WebSocketHandler() do req, ws_client
     
    msg = decode_message(read(ws_client))
    parsemsg = JSON.parse(msg)

    parsemsg["error"] = ""

    if haskey(parsemsg, "action") 

        action = parsemsg["action"]
        
      try  

        if action == "validate_advice"
          valid = false
          
          currentAdvice = parsemsg["advice"]
          lastAdvice = parsemsg["lastAdvice"] == "" ? Dict{String,Any}() : parsemsg["lastAdvice"]
          strictNetValue = parsemsg["strictNetValue"]
          
          valid = _validate_advice(currentAdvice, lastAdvice, strictNetValue) 
          parsemsg["valid"] = valid

        elseif action == "validate_portfolio"
            
          valid = false
          (valid, port) = _validate_portfolio(parsemsg["portfolio"]) 

          parsemsg["valid"] = valid

        elseif action == "validate_transactions"
            
          transactions = convert(Vector{Dict{String,Any}}, parsemsg["transactions"])
          advicePortfolio = get(parsemsg, "advicePortfolio", "")
          investorPortfolio = get(parsemsg, "investorPortfolio", "")

          advicePortfolio = advicePortfolio != "" ? advicePortfolio : Dict{String,Any}()
          investorPortfolio = investorPortfolio != "" ? investorPortfolio : Dict{String,Any}()

          #Check if portfolio is NOT null
          valid = _validate_transactions(transactions, advicePortfolio, investorPortfolio) 

          parsemsg["valid"] = valid
         
        elseif action == "compute_performance_portfolio_history"
            
            portfolioHistory = parsemsg["portfolioHistory"]
            benchmark = parsemsg["benchmark"]["ticker"]

            (netValues, dates) = compute_portfoliohistory_netvalue(portfolioHistory)

            if netValues != nothing && dates != nothing
                vals = zeros(length(netValues), 1)
                for (i,val) in enumerate(netValues)
                    vals[i,1] = val
                end
                  
                (lastdate, performance) = compute_performance(TimeArray(dates, vals, ["Portfolio"]), benchmark)
                
                nVDict = Dict{String, Any}()

                for i = 1:length(netValues)
                    nVDict[string(dates[i])] = netValues[i]
                end

                parsemsg["performance"] = Dict{String, Any}("date" => lastdate, 
                                          "value" => serialize(performance), 
                                          "portfolioValues" => nVDict)
            else 
                parsemsg["performance"] = Dict{String, Any}("date" => Date(now()), 
                                          "value" => serialize(Performance()), 
                                          "portfolioValues" => nVDict)
                #error("Missing Input")
            end

        elseif action == "compute_portfolio_performance"
           
          performance = Dict{String, Any}()
            
          # trim Z from the string
          startDate = DateTime(parsemsg["startDate"], jsdateformat)
          endDate = DateTime(parsemsg["endDate"], jsdateformat)

          performance = compute_performance(parsemsg["portfolio"], startDate, endDate)
          performance = JSON.parse(JSON.json(performance))
          parsemsg["performance"] = Dict("date" => endDate, "value" => performance)

        elseif action == "compute_performance_netvalue"
          performance = Dict{String, Any}()
           
          netValues = convert(Vector{Float64}, parsemsg["netValue"])
          benchmark = parsemsg["benchmark"]["ticker"]
          dates = parsemsg["dates"]
          dates = [Date(DateTime(date, jsdateformat)) for date in dates]

          vals = zeros(length(netValues), 1)
          for (i,val) in enumerate(netValues)
            vals[i,1] = val
          end
          
          (lastdate, performance) = compute_performance(TimeArray(dates, vals, ["Portfolio"]), benchmark)

          parsemsg["performance"] = Dict("date" => lastdate, "value" => serialize(performance))
        
        elseif action == "compute_portfolio_constituents_performance"

          startDate = DateTime(parsemsg["startDate"], jsdateformat)
          endDate = DateTime(parsemsg["endDate"], jsdateformat)
          benchmark = get(parsemsg, "benchmark", Dict("ticker"=>"NIFTY_50"))

          (date, performance) = JSON.parse(JSON.json(compute_performance_constituents(parsemsg["portfolio"], startDate, endDate, benchmark)))

          parsemsg["constituentPerformance"] = Dict("date" => date, "value" => performance)

        elseif action == "compute_portfolio_composition"

          startDate = DateTime(parsemsg["startDate"], jsdateformat)
          endDate = DateTime(parsemsg["endDate"], jsdateformat)
          benchmark = get(parsemsg, "benchmark", Dict("ticker"=>"NIFTY_50"))

          (date, composition) = JSON.parse(JSON.json(compute_portfolio_composition(parsemsg["portfolio"], startDate, endDate, benchmark)))
          
          parsemsg["portfolioComposition"] = Dict("date" => date, "value" => composition)
        
        elseif action == "compute_portfolio_value_history"

          portfolioHistory = parsemsg["portfolioHistory"]
          (netValue, dates) = compute_portfolio_value_history(portfolioHistory)
          parsemsg["netValue"] = Dict("dates" => dates, "values" => netValue)
        
        elseif action == "compute_portfolio_value_period"
          
          portfolio = parsemsg["portfolio"]
          startDate = DateTime(parsemsg["startDate"], jsdateformat)
          endDate = DateTime(parsemsg["endDate"], jsdateformat)
         
          (netValues, dates) = compute_portfolio_value_period(portfolio, startDate, endDate)
          
          nVDict = Dict{String, Any}()

          for i = 1:length(netValues)
              nVDict[string(dates[i])] = netValues[i]
          end

          parsemsg["netValue"] = nVDict

        elseif action == "compute_portfolio_value_date"
          netvalue = 0.0
          lastdate = DateTime()
          portfolio = parsemsg["portfolio"]
          date = DateTime(data["date"], jsdateformat)

          netvalue = compute_portfoliovalue(portfolio, date)
          if (lastdate == DateTime())
            parsemsg["netvalue"] = Dict("date" => lastdate, "value" => netvalue)
            parsemsg["error"] = ""
          end
        
        elseif action == "compute_stock_price_history"
            
            parsemsg["priceHistory"] = ""
            parsemsg["priceHistory"] = get_stock_price_history(parsemsg["security"])
            
        elseif action == "compute_stock_price_latest"
            parsemsg["latestDetail"] = ""
            parsemsg["latestDetail"] = get_stock_price_latest(parsemsg["security"])
        
        elseif action == "compute_stock_rolling_performance"
            parsemsg["performance"] = ""

            rolling_performances = compute_stock_rolling_performance(parsemsg["security"])
            if rolling_performances != nothing
                rolling_performance_dict = Dict{String, Any}()
                
                for (k,v) in rolling_performances
                    rolling_performance_dict[k] = serialize(v)
                end

                parsemsg["performance"] = rolling_performance_dict
            else
                parsemsg["error"] = "Empty Rolling Performance. Compute Error!!"
            end

        elseif action == "compute_stock_static_performance"
            
            parsemsg["performance"] = ""
            static_performance = compute_stock_static_performance(parsemsg["security"])
            
            if static_performance != nothing
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
            
            else
                parsemsg["error"] = "Empty Static Performance. Compute Error!!"
            end

        elseif action == "update_portfolio_transactions"
            portfolio = parsemsg["portfolio"]
            transactions = convert(Vector{Dict{String,Any}}, parsemsg["transactions"])

            # TODO: update function to compute portfolio stats etc.
            # TODO: if price is not give (or zero price), assume EOD price for the day
            ##
            ##
            (cash, updated_portfolio) = updateportfolio_transactions(portfolio, transactions)
            
            #Update, the positions to match the object structure in Node
            updated_portfolio = convert_to_node_portfolio(updated_portfolio)
            
            updated_portfolio["cash"] = cash
            parsemsg["portfolio"] = updated_portfolio

        elseif action == "update_portfolio_price"    
            portfolio = parsemsg["portfolio"]
            date = parsemsg["date"]
            updated_positions = updateportfolio_price(portfolio, date == "" ? now() : DateTime(date))
            
            #Update, the positions to match the object structure in Node
            parsemsg["updatedPositions"] = convert_to_node_portfolio(updated_positions)["positions"]
            
        elseif action == "compare_security"
            oldSecurity = convert(Raftaar.Security, parsemsg["oldSecurity"])
            newSecurity = convert(Raftaar.Security, parsemsg["newSecurity"])

            parsemsg["compare"] = oldSecurity == newSecurity

        elseif action == "compare_portfolio"
            oldPortfolio = convert(Raftaar.Portfolio, parsemsg["oldPortfolio"])
            newPorfolo = convert(Raftaar.Portfolio, parsemsg["newPortfolio"])

            parsemsg["compare"] = oldPortfolio == newPortfolio

        elseif action == "compute_attribution"
            #parsemsg["portfolio"] = updated_portfolio
        else
            parsemsg["error"] = "Invalid action"
        end

      catch err
          err_msg = geterrormsg(err)
          parsemsg["error"] = err_msg
          warn("Error: $(err_msg)")
      end
      
      write(ws_client, JSON.json(parsemsg))  
      close_connection(ws_client)
       
    end     
end
 
server = Server(wsh)
run(server, host=IPv4(host), port=port)
 