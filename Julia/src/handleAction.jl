
function handleRequest(parsemsg::Dict{String, Any})
    try 
        action = parsemsg["action"]
        parsemsg["error"] = ""
        
        if action == "validate_security"
          valid = false
          
          security = parsemsg["security"]
          
          valid = _validate_security(security) 
          parsemsg["output"] = valid

        elseif action == "validate_advice"
          valid = false
          
          currentAdvice = parsemsg["advice"]
          lastAdvice = parsemsg["lastAdvice"] == "" ? Dict{String,Any}() : parsemsg["lastAdvice"]
          
          valid = _validate_advice(currentAdvice, lastAdvice) 
          parsemsg["output"] = valid

        elseif action == "validate_contest_entry"
          valid = false
          
          currentEntry= parsemsg["entry"]
          lastEntry = parsemsg["lastEntry"] == "" ? Dict{String,Any}() : parsemsg["lastEntry"]
          dollarPosition = parsemsg["dollarPosition"] == "" ? false : parsemsg["dollarPosition"]
          
          valid = _validate_contest_entry(currentEntry, lastEntry, dollarPosition = dollarPosition) 
          parsemsg["output"] = valid

        elseif action == "validate_portfolio"
            
          valid = false
          (valid, port) = _validate_portfolio(parsemsg["portfolio"]) 

          parsemsg["output"] = valid

        elseif action == "validate_transactions"
            
          transactions = convert(Vector{Dict{String,Any}}, parsemsg["transactions"])
          advicePortfolio = get(parsemsg, "advicePortfolio", "")
          investorPortfolio = get(parsemsg, "investorPortfolio", "")

          advicePortfolio = advicePortfolio != "" ? advicePortfolio : Dict{String,Any}()
          investorPortfolio = investorPortfolio != "" ? investorPortfolio : Dict{String,Any}()

          #Check if portfolio is NOT null
          valid = _validate_transactions(transactions, advicePortfolio, investorPortfolio) 

          parsemsg["output"] = valid
         
        elseif action == "compute_performance_portfolio_history"
            
            portfolioHistory = parsemsg["portfolioHistory"]
            benchmark = parsemsg["benchmark"]["ticker"]
            cashAdjustment = parsemsg["cashAdjustment"]

            startDate = now()
            endDate = DateTime("1900-01-01")

            for port in portfolioHistory
              _sd = Date(DateTime(port["startDate"], jsdateformat))
              _ed = Date(DateTime(port["endDate"], jsdateformat))

              startDate = min(_sd, startDate)
              endDate = max(_ed, endDate)
            end

            (netValues, dates) = compute_portfoliohistory_netvalue(portfolioHistory, cashAdjustment)

            if netValues != nothing && dates != nothing
                vals = zeros(length(netValues), 1)
                for (i,val) in enumerate(netValues)
                    vals[i,1] = val
                end
                  
                (lastdate, performance, dperformance, rolling_performances, rolling_performances_diff, static_performances, rolling_performances_bench, static_performances_bench) = compute_performance(TimeArray(dates, vals, [:Portfolio]), benchmark)
                
                nVDict = Dict{String, Any}()

                for i = 1:length(netValues)
                    nVDict[string(dates[i])] = netValues[i]
                end

                parsemsg["output"] = Dict{String, Any}("date" => lastdate, 
                                          "value" => Dict(
                                            "true" => serialize(performance), 
                                            "diff" => serialize(dperformance), 
                                            "rolling" => serialize(rolling_performances),
                                            "rolling_diff" => serialize(rolling_performances_diff),
                                            "static" => serialize(static_performances),
                                            "rolling_benchmark" => serialize(rolling_performances_bench),
                                            "static_benchmark" => serialize(static_performances_bench)),  
                                          "portfolioValues" => nVDict)
            else 
                parsemsg["output"] = Dict{String, Any}("date" => Date(currentIndiaTime()), 
                                          "value" => Dict(
                                              "true" => serialize(Performance()), 
                                              "diff" => serialize(Performance()), 
                                              "rolling" => serialize(Dict{String, Performance}()),
                                              "rolling_diff" => serialize(Dict{String, Performance}()),
                                              "static" => serialize(Dict{String, Dict{String, Performance}}()),
                                              "rolling_benchmark" => serialize(Dict{String, Performance}()),
                                              "static_benchmark" => serialize(Dict{String, Dict{String, Performance}}())
                                            ),
                                          "portfolioValues" => Dict{String, Any}())
                #error("Missing Input")
            end

        #NOT IN USE
        #IF USE COMES, FIX THE OUTPUT FORMAT    
        elseif action == "compute_portfolio_performance"
           
          performance = Dict{String, Any}()
            
          # trim Z from the string
          startDate = DateTime(parsemsg["startDate"], jsdateformat)
          endDate = DateTime(parsemsg["endDate"], jsdateformat)

          performance = compute_performance(parsemsg["portfolio"], startDate, endDate)
          performance = serialize(performance)
          parsemsg["output"] = Dict("date" => endDate, "value" => performance)

        

        elseif action == "compute_performance_netvalue"
          
          try
            netValues = [Float64(get(dict, "netValue", NaN)) for dict in parsemsg["netValues"]]
            dates = [haskey(dict, "date") ? Date(DateTime(dict["date"], jsdateformat)) : Date(1)  for dict in parsemsg["netValues"]]
            benchmark = parsemsg["benchmark"]["ticker"]

            lastdate = haskey(parsemsg, "date") ? Date(parsemsg["date"], jsdateformat) : Date(1)
            nVDict = Dict{String, Any}()

            for (i,date) in enumerate(dates)
                if date != Date(1)
                  nVDict[string(date)] = netValues[i]
                end
            end
            
            (lastdate, performance, dperformance, rolling_performances, rolling_performances_diff, static_performances, rolling_performances_bench, static_performances_bench) = compute_performance(TimeArray(dates, netValues, [:Portfolio], lastdate), benchmark)

            parsemsg["output"] = Dict{String, Any}("date" => lastdate, 
                                          "value" => Dict(
                                            "true" => serialize(performance), 
                                            "diff" => serialize(dperformance), 
                                            "rolling" => serialize(rolling_performances),
                                            "rolling_diff" => serialize(rolling_performances_diff),
                                            "static" => serialize(static_performances),
                                            "rolling_benchmark" => serialize(rolling_performances_bench),
                                            "static_benchmark" => serialize(static_performances_bench)),  
                                          "portfolioValues" => nVDict)
          catch err
                println(err)
                parsemsg["output"] = Dict{String, Any}("date" => Date(currentIndiaTime()), 
                                          "value" => Dict(
                                              "true" => serialize(Performance()), 
                                              "diff" => serialize(Performance()), 
                                              "rolling" => serialize(Dict{String, Performance}()),
                                              "rolling_diff" => serialize(Dict{String, Performance}()),
                                              "static" => serialize(Dict{String, Dict{String, Performance}}()),
                                              "rolling_benchmark" => serialize(Dict{String, Performance}()),
                                              "static_benchmark" => serialize(Dict{String, Dict{String, Performance}}())
                                            ),
                                          "portfolioValues" => Dict{String, Any}())
          end
          
        
        elseif action == "compute_portfolio_constituents_performance"

          startDate = DateTime(parsemsg["startDate"], jsdateformat)
          endDate = DateTime(parsemsg["endDate"], jsdateformat)
          benchmark = get(parsemsg, "benchmark", Dict("ticker"=>"NIFTY_50"))

          (date, performance) = JSON.parse(JSON.json(compute_performance_constituents(parsemsg["portfolio"], startDate, endDate, benchmark)))

          parsemsg["output"] = Dict("date" => date, "value" => performance)

        elseif action == "compute_portfolio_metrics"

          startDate = DateTime(parsemsg["startDate"], jsdateformat)
          endDate = DateTime(parsemsg["endDate"], jsdateformat)
          benchmark = get(parsemsg, "benchmark", Dict("ticker"=>"NIFTY_50"))
          excludeCash = get(parsemsg, "excludeCash", false)

          (date, metrics) = JSON.parse(JSON.json(compute_portfolio_metrics(parsemsg["portfolio"], startDate, endDate, benchmark; excludeCash = excludeCash)))
          
          parsemsg["output"] = Dict("date" => date, "value" => metrics)
        
        elseif action == "compute_simulated_historical_performance"
            portfolio = parsemsg["portfolio"]
            startDate = DateTime(parsemsg["startDate"], jsdateformat)
            endDate = DateTime(parsemsg["endDate"], jsdateformat)
            benchmark = parsemsg["benchmark"]["ticker"]
            excludeCash = get(parsemsg, "excludeCash", false)

            (netValues, dates) = compute_portfolio_value_period(portfolio, startDate, endDate, excludeCash = excludeCash)
            
            if netValues != nothing && dates != nothing
                vals = zeros(length(netValues), 1)
                for (i,val) in enumerate(netValues)
                    vals[i,1] = val
                end
                  
                (lastdate, performance, dperformance, rolling_performances, rolling_performances_diff, static_performances, rolling_performances_bench, static_performances_bench) = compute_performance(TimeArray(dates, vals, [:Portfolio]), benchmark)
                
                nVDict = Dict{String, Any}()

                for i = 1:length(netValues)
                    nVDict[string(dates[i])] = netValues[i]
                end

                parsemsg["output"] = Dict{String, Any}("date" => lastdate, 
                                          "value" => Dict(
                                            "true" => serialize(performance), 
                                            "diff" => serialize(dperformance), 
                                            "rolling" => serialize(rolling_performances),
                                            "rolling_diff" => serialize(rolling_performances_diff),
                                            "static" => serialize(static_performances),
                                            "rolling_benchmark" => serialize(rolling_performances_bench),
                                            "static_benchmark" => serialize(static_performances_bench)
                                          ), 
                                          "portfolioValues" => nVDict)
            else 
                parsemsg["output"] = Dict{String, Any}("date" => Date(currentIndiaTime()), 
                                          "value" => Dict(
                                            "true" => serialize(Performance()), 
                                            "diff" => serialize(Performance()), 
                                            "rolling" => serialize(Dict{String, Performance}()),
                                            "rolling_diff" => serialize(Dict{String, Performance}()),
                                            "static" => serialize(Dict{String, Dict{String, Performance}}()),
                                            "rolling_benchmark" => serialize(Dict{String, Performance}()),
                                            "static_benchmark" => serialize(Dict{String, Dict{String, Performance}}())
                                          ),
                                          "portfolioValues" => nVDict)
                #error("Missing Input")
            end
         
        ##NOT IN USE
        elseif action == "compute_portfolio_value_history"

          portfolioHistory = parsemsg["portfolioHistory"]
          (netValues, dates) = compute_portfolio_value_history(portfolioHistory)
          parsemsg["output"] = Dict("dates" => dates, "values" => netValues)
        
        ##NOT IN USE
        elseif action == "compute_portfolio_value_period"
          
          portfolio = parsemsg["portfolio"]
          startDate = DateTime(parsemsg["startDate"], jsdateformat)
          endDate = DateTime(parsemsg["endDate"], jsdateformat)
         
          (netValues, dates) = compute_portfolio_value_period(portfolio, startDate, endDate)
          
          nVDict = Dict{String, Float64}()

          for i = 1:length(netValues)
              nVDict[string(dates[i])] = netValues[i]
          end

          parsemsg["output"] = Dict("portfolioValues" => nVDict)

        #NOT IN USE
        elseif action == "compute_portfolio_value_date"          
          netvalue = 0.0
          lastdate = DateTime(1)
          portfolio = parsemsg["portfolio"]
          date = DateTime(data["date"], jsdateformat)

          netvalue = compute_portfoliovalue(portfolio, date)
          if (lastdate == DateTime(1))
            parsemsg["output"] = Dict("date" => lastdate, "value" => netvalue)
            parsemsg["error"] = ""
          end
        
        elseif action == "compute_stock_price_history"
            parsemsg["output"] = ""
            field = parsemsg["field"];
            field = field == "" || field == nothing ? "Close" : field;
            parsemsg["output"] = get_stock_price_history(parsemsg["security"], field)

        elseif action == "compute_stock_price_historical"
            
            parsemsg["output"] = ""
            date = DateTime(parsemsg["date"], jsdateformat)
            parsemsg["output"] = get_stock_price_historical(parsemsg["security"], date)
            
        elseif action == "compute_stock_price_latest"
            parsemsg["output"] = ""
            parsemsg["output"] = get_stock_price_latest(parsemsg["security"], parsemsg["ptype"])
        
        elseif action == "compute_stock_price_realtime_historical"
            parsemsg["output"] = ""
            parsemsg["output"] = get_stock_realtime_price_historical(parsemsg["security"], parsemsg["fileNumber"], parsemsg["path"])    

        elseif action == "compute_stock_intraday_history"
            parsemsg["output"] = ""
            security = convert(BackTester.Security, parsemsg["security"])
            date = parsemsg["date"]
            date = date == "" ? currentIndiaDate() : Date(DateTime(date, jsdateformat))
            parsemsg["output"] = get_stock_intraday_history(security, date)

        elseif action == "compute_intraday_snapshot"
            parsemsg["output"] = ""
            parsemsg["output"] = get_intraday_snapshot(parsemsg["fileNumber"], parsemsg["fileType"])

        elseif action == "track_stock_intraday_detail"
            parsemsg["output"] = ""
            security = convert(BackTester.Security, parsemsg["security"])
            parsemsg["output"] = track_stock_intraday_detail(security)

        elseif action == "untrack_stock_intraday_detail"
            parsemsg["output"] = ""
            parsemsg["output"] = untrack_stock_intraday_detail()

        elseif action == "compute_stock_atr"
            date = DateTime(parsemsg["date"], jsdateformat)
            horizon = parsemsg["horizon"]

            parsemsg["output"] = ""
            atr = computeStockATR(parsemsg["security"], date, horizon)

            if atr == nothing
              parsemsg["error"] = "Empty ATR"
            else 
              parsemsg["output"] = atr  
            end

        elseif action == "compute_stock_rolling_performance"
            parsemsg["output"] = ""

            (date, rolling_performances) = compute_stock_rolling_performance(parsemsg["security"])
            if rolling_performances != nothing
                rolling_performance_dict = Dict{String, Any}()
                
                for (k,v) in rolling_performances
                    rolling_performance_dict[k] = serialize(v)
                end

                rolling_performance_dict["date"] = date
                parsemsg["output"] = rolling_performance_dict
            else
                parsemsg["error"] = "Empty Rolling Performance. Compute Error!!"
            end

        elseif action == "compute_stock_static_performance"
            
            parsemsg["output"] = ""
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

                parsemsg["output"] = static_performance_dict
            
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
            updated_portfolio = updateportfolio_transactions(portfolio, transactions)
            
            #Update, the positions to match the object structure in Node
            updated_portfolio = convert_to_node_portfolio(updated_portfolio)
            parsemsg["output"] = updated_portfolio

        elseif action == "update_portfolio_price"    
            portfolio = parsemsg["portfolio"]
            date = parsemsg["date"]
            date = date == "" ? currentIndiaTime() : DateTime(date, jsdateformat)
            typ = parsemsg["type"]
            
            (updatedDate, updated_portfolio) = update_portfolio_price(portfolio, date, typ)
            
            #Update, the positions to match the object structure in Node
            parsemsg["output"] = convert_to_node_portfolio(updated_portfolio)["positions"]
       
        elseif action == "update_portfolio_splits_dividends"
            portfolio = parsemsg["portfolio"]
            startDate = parsemsg["startDate"]
            endDate = parsemsg["endDate"]

            startDate = startDate == "" || startDate == nothing ? currentIndiaTime() : DateTime(startDate, jsdateformat)
            endDate = endDate == "" || endDate == nothing ? currentIndiaTime() : DateTime(endDate, jsdateformat)
            #updatedPortfolios = [portfolio]
              
            parsemsg["output"] = updateportfolio_splitsAndDividends(portfolio, startDate, endDate)

        elseif action == "update_portfolio_average_price"

            portfolioHistory = convert(Vector{Dict{String, Any}}, parsemsg["portfolioHistory"])
            (updatedDate, updated_portfolio) = updatePortfolio_averageprice(portfolioHistory)
            parsemsg["output"] = convert_to_node_portfolio(updated_portfolio)

        elseif action == "compute_portfolio_transactions"
            newPortfolio = parsemsg["newPortfolio"]
            currentPortfolio = parsemsg["currentPortfolio"]

            (date, transactions) = compute_portfolioTransactions(newPortfolio, currentPortfolio)
            parsemsg["output"] = Dict(string(date) => transactions)

        elseif action == "compute_fractional_ranking"
            
            vals = Dict{String, Float64}()
            for (k,v) in parsemsg["values"]
              vals[k] = v == nothing ? NaN : v;
            end

            scale = parsemsg["scale"]
            scale = scale == "" ? 0.0 : convert(Float64, scale)

            fractional_ranking = compute_fractional_ranking(vals, scale)
            parsemsg["output"] = fractional_ranking

        elseif action == "update_realtime_prices"
            fname = parsemsg["filename"]
            ftype = parsemsg["type"]
            parsemsg["output"] = update_realtime_prices(fname, ftype)
           
        elseif action == "compare_security"
            oldSecurity = convert(BackTester.Security, parsemsg["oldSecurity"])
            newSecurity = convert(BackTester.Security, parsemsg["newSecurity"])

            parsemsg["output"] = oldSecurity == newSecurity

        elseif action == "compare_portfolio"
            oldPortfolio = convert(BackTester.Portfolio, parsemsg["oldPortfolio"])
            newPorfolo = convert(BackTester.Portfolio, parsemsg["newPortfolio"])

            parsemsg["output"] = oldPortfolio == newPortfolio

        elseif action == "find_securities"
          hint = parsemsg["hint"]
          ct = parsemsg["limit"]
          outputType = parsemsg["outputType"]
          parsemsg["output"] = findsecurities(hint, ct, outputType)
            
        elseif action == "get_security_detail"
          security = parsemsg["security"]
          detail  = get(security, "ticker", "") !="" ? convert(BackTester.Security, YRead.getsecurity(security["ticker"])).detail : Dict()
          parsemsg["output"] = detail

        elseif action == "compute_attribution"
            #parsemsg["portfolio"] = updated_portfolio

        else
            parsemsg["error"] = "Invalid action"
            parsemsg["code"] = 403
        end
    catch err
        err_msg = geterrormsg(err)
        parsemsg["error"] = err_msg
        parsemsg["code"] = 400
        @warn "Error: $(err_msg)"
    end

    return parsemsg
end